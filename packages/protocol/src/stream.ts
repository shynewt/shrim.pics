/**
 * Encrypted stream format.
 *
 *   header  = "SHR1" | kind (1) | 0 0 0 | salt (16)
 *   record  = u32be ciphertext length | AES-256-GCM ciphertext
 *
 * Each stream gets its own key: HKDF(shareKey, salt, info). Record i uses
 * nonce = 0^7 | u32be(i) | last. Record 0 is a JSON head, the rest is body.
 */
import { ByteReader, StreamError, concat, fromUtf8, randomBytes, toBase64Url, utf8 } from './bytes.ts';

export const MAGIC = utf8('SHR1');
export const HEADER_SIZE = 24;
export const SALT_SIZE = 16;
export const RECORD_SIZE = 64 * 1024;
const TAG_SIZE = 16;

export type StreamKind = 'req' | 'res';
const KIND_BYTE: Record<StreamKind, number> = { req: 1, res: 2 };

export interface StreamContext {
	kind: StreamKind;
	shareId: string;
	/** For responses: the salt of the request being answered. */
	bind?: Uint8Array;
}

export const SHARE_KEY_SIZE = 32;

export function generateShareKey(): Uint8Array<ArrayBuffer> {
	return randomBytes(SHARE_KEY_SIZE);
}

export function importShareKey(raw: Uint8Array<ArrayBuffer>): Promise<CryptoKey> {
	if (raw.length !== SHARE_KEY_SIZE) throw new StreamError('format', 'A share key is 32 bytes.');
	return crypto.subtle.importKey('raw', raw, 'HKDF', false, ['deriveKey']);
}

function info(ctx: StreamContext): Uint8Array<ArrayBuffer> {
	let s = `shrim/1 ${ctx.kind} ${ctx.shareId}`;
	if (ctx.kind === 'res') {
		if (!ctx.bind) throw new Error('A response must be bound to its request.');
		s += ` ${toBase64Url(ctx.bind)}`;
	}
	return utf8(s);
}

function deriveStreamKey(base: CryptoKey, salt: Uint8Array<ArrayBuffer>, ctx: StreamContext) {
	return crypto.subtle.deriveKey(
		{ name: 'HKDF', hash: 'SHA-256', salt, info: info(ctx) },
		base,
		{ name: 'AES-GCM', length: 256 },
		false,
		['encrypt', 'decrypt']
	);
}

function nonce(index: number, last: boolean): Uint8Array<ArrayBuffer> {
	const n = new Uint8Array(12);
	new DataView(n.buffer).setUint32(7, index);
	n[11] = last ? 1 : 0;
	return n;
}

function header(kind: StreamKind, salt: Uint8Array): Uint8Array<ArrayBuffer> {
	const h = new Uint8Array(HEADER_SIZE);
	h.set(MAGIC, 0);
	h[4] = KIND_BYTE[kind];
	h.set(salt, 8);
	return h;
}

export interface Sealer {
	/** The stream salt. A response to this stream binds to it. */
	salt: Uint8Array<ArrayBuffer>;
	header: Uint8Array<ArrayBuffer>;
	/** Encrypts one record (≤ RECORD_SIZE bytes) and frames it. */
	seal(plain: Uint8Array<ArrayBuffer>, last: boolean): Promise<Uint8Array<ArrayBuffer>>;
}

export async function createSealer(base: CryptoKey, ctx: StreamContext): Promise<Sealer> {
	const salt = randomBytes(SALT_SIZE);
	const key = await deriveStreamKey(base, salt, ctx);
	let index = 0;
	let finished = false;
	return {
		salt,
		header: header(ctx.kind, salt),
		async seal(plain, last) {
			if (finished) throw new Error('Stream already finished.');
			if (plain.length > RECORD_SIZE) throw new Error('Record too large.');
			const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce(index++, last) }, key, plain));
			if (last) finished = true;
			const framed = new Uint8Array(4 + ct.length);
			new DataView(framed.buffer).setUint32(0, ct.length);
			framed.set(ct, 4);
			return framed;
		}
	};
}

type Body = Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array> | undefined;

/** Re-chunks any body into RECORD_SIZE pieces. */
async function* records(body: Body): AsyncGenerator<Uint8Array<ArrayBuffer>> {
	if (!body) return;
	if (body instanceof Uint8Array) {
		for (let i = 0; i < body.length; i += RECORD_SIZE) yield body.slice(i, i + RECORD_SIZE);
		return;
	}
	const reader = body.getReader();
	let pending: Uint8Array[] = [];
	let size = 0;
	try {
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			pending.push(value);
			size += value.length;
			while (size >= RECORD_SIZE) {
				const all = concat(pending);
				yield all.slice(0, RECORD_SIZE);
				const rest = all.slice(RECORD_SIZE);
				pending = rest.length ? [rest] : [];
				size = rest.length;
			}
		}
		if (size) yield concat(pending);
	} finally {
		reader.releaseLock();
	}
}

export interface EncryptedStream {
	salt: Uint8Array<ArrayBuffer>;
	stream: ReadableStream<Uint8Array<ArrayBuffer>>;
}

/** Encrypts a JSON head plus an optional body into one stream. */
export async function encryptStream(
	base: CryptoKey,
	ctx: StreamContext,
	head: unknown,
	body?: Body
): Promise<EncryptedStream> {
	const sealer = await createSealer(base, ctx);
	const source = records(body);
	// Hold one record back so we know which one is last.
	let held: Uint8Array<ArrayBuffer> | null = utf8(JSON.stringify(head));
	let started = false;

	const stream = new ReadableStream<Uint8Array<ArrayBuffer>>({
		async pull(controller) {
			if (!started) {
				started = true;
				controller.enqueue(sealer.header);
			}
			if (held === null) return controller.close();
			const next = await source.next();
			const last = !!next.done;
			controller.enqueue(await sealer.seal(held, last));
			held = last ? null : next.value;
			if (last) controller.close();
		},
		async cancel() {
			await source.return(undefined);
		}
	});
	return { salt: sealer.salt, stream };
}

export async function encryptToBytes(
	base: CryptoKey,
	ctx: StreamContext,
	head: unknown,
	body?: Uint8Array<ArrayBuffer>
): Promise<{ salt: Uint8Array<ArrayBuffer>; bytes: Uint8Array<ArrayBuffer> }> {
	const { salt, stream } = await encryptStream(base, ctx, head, body);
	return { salt, bytes: await collect(stream) };
}

export interface DecryptedStream<H> {
	salt: Uint8Array<ArrayBuffer>;
	head: H;
	body: ReadableStream<Uint8Array<ArrayBuffer>>;
}

/**
 * Decrypts a stream. Resolves once the head is read; the body stream errors
 * if anything after it is tampered with, truncated or extended.
 */
export async function decryptStream<H = unknown>(
	base: CryptoKey,
	ctx: StreamContext,
	input: ReadableStream<Uint8Array>,
	{ maxBody = Infinity }: { maxBody?: number } = {}
): Promise<DecryptedStream<H>> {
	const reader = new ByteReader(input);
	const h = await reader.read(HEADER_SIZE);
	if (!h) throw new StreamError('truncated', 'The data is empty.');
	for (let i = 0; i < 4; i++) if (h[i] !== MAGIC[i]) throw new StreamError('format', 'Not a shrim stream.');
	if (h[4] !== KIND_BYTE[ctx.kind]) throw new StreamError('format', 'Unexpected stream kind.');
	const salt = h.slice(8, 24);
	const key = await deriveStreamKey(base, salt, ctx);

	let index = 0;
	let ended = false;
	let bodySize = 0;

	async function next(): Promise<{ plain: Uint8Array<ArrayBuffer>; last: boolean } | null> {
		const len = await reader.read(4);
		if (!len) {
			if (!ended) throw new StreamError('truncated', 'The data ended too early.');
			return null;
		}
		if (ended) throw new StreamError('format', 'Unexpected data after the end.');
		const size = new DataView(len.buffer, len.byteOffset, 4).getUint32(0);
		if (size < TAG_SIZE || size > RECORD_SIZE + TAG_SIZE) throw new StreamError('format', 'Bad record size.');
		const ct = await reader.read(size);
		if (!ct) throw new StreamError('truncated', 'The data ended too early.');
		const ctCopy = ct.slice();
		for (const last of [false, true]) {
			try {
				const plain = new Uint8Array(
					await crypto.subtle.decrypt({ name: 'AES-GCM', iv: nonce(index, last) }, key, ctCopy)
				);
				index++;
				if (last) ended = true;
				return { plain, last };
			} catch {
				// try the other flag
			}
		}
		throw new StreamError('decrypt', 'This data could not be decrypted.');
	}

	const first = await next();
	if (!first) throw new StreamError('truncated', 'The data ended too early.');
	let head: H;
	try {
		head = JSON.parse(fromUtf8(first.plain)) as H;
	} catch {
		throw new StreamError('format', 'Bad head.');
	}

	const body = new ReadableStream<Uint8Array<ArrayBuffer>>({
		async pull(controller) {
			try {
				if (ended) {
					// Make sure nothing follows the final record.
					await next();
					return controller.close();
				}
				const rec = await next();
				if (!rec) return controller.close();
				bodySize += rec.plain.length;
				if (bodySize > maxBody) throw new StreamError('too_large', 'The data is too large.');
				if (rec.plain.length) controller.enqueue(rec.plain);
			} catch (e) {
				controller.error(e);
				await reader.cancel(e);
			}
		},
		cancel(reason) {
			return reader.cancel(reason);
		}
	});

	return { salt, head, body };
}

export async function collect(stream: ReadableStream<Uint8Array>): Promise<Uint8Array<ArrayBuffer>> {
	const parts: Uint8Array[] = [];
	const reader = stream.getReader();
	for (;;) {
		const { value, done } = await reader.read();
		if (done) break;
		parts.push(value);
	}
	return concat(parts);
}

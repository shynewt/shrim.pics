const encoder = new TextEncoder();
const decoder = new TextDecoder();

export const utf8 = (s: string): Uint8Array<ArrayBuffer> => encoder.encode(s);
export const fromUtf8 = (b: Uint8Array): string => decoder.decode(b);

export function randomBytes(n: number): Uint8Array<ArrayBuffer> {
	const out = new Uint8Array(n);
	// getRandomValues fills at most 64 KiB per call.
	for (let i = 0; i < n; i += 65536) crypto.getRandomValues(out.subarray(i, Math.min(n, i + 65536)));
	return out;
}

export function concat(parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
	let size = 0;
	for (const p of parts) size += p.length;
	const out = new Uint8Array(size);
	let offset = 0;
	for (const p of parts) {
		out.set(p, offset);
		offset += p.length;
	}
	return out;
}

export function toBase64Url(bytes: Uint8Array): string {
	let s = '';
	for (const b of bytes) s += String.fromCharCode(b);
	return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
	if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('Invalid base64url');
	const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
	const bin = atob(b64);
	const out = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
	return out;
}

/** Reads exact byte counts out of a stream of arbitrarily sized chunks. */
export class ByteReader {
	#reader: ReadableStreamDefaultReader<Uint8Array>;
	#buffer: Uint8Array = new Uint8Array(0);
	#done = false;

	constructor(stream: ReadableStream<Uint8Array>) {
		this.#reader = stream.getReader();
	}

	/** Returns exactly `n` bytes, or `null` if the stream ended cleanly before any byte. Throws on a partial read. */
	async read(n: number): Promise<Uint8Array | null> {
		while (this.#buffer.length < n && !this.#done) {
			const { value, done } = await this.#reader.read();
			if (done) this.#done = true;
			else if (value.length) this.#buffer = this.#buffer.length ? concat([this.#buffer, value]) : value;
		}
		if (this.#buffer.length === 0 && this.#done) return null;
		if (this.#buffer.length < n) throw new StreamError('truncated', 'The data ended too early.');
		const out = this.#buffer.subarray(0, n);
		this.#buffer = this.#buffer.subarray(n);
		return out;
	}

	cancel(reason?: unknown) {
		return this.#reader.cancel(reason).catch(() => {});
	}
}

export type StreamErrorCode = 'truncated' | 'format' | 'decrypt' | 'too_large';

export class StreamError extends Error {
	constructor(
		public code: StreamErrorCode,
		message: string
	) {
		super(message);
		this.name = 'StreamError';
	}
}

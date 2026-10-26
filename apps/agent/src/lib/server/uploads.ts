import { randomBytes } from 'node:crypto';
import { createWriteStream, mkdirSync, rmSync, type WriteStream } from 'node:fs';
import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { UPLOAD_PART_SIZE, type ImmichLinkRef } from '@shrim/protocol';
import { config } from './config.ts';
import { upload as uploadToImmich } from './immich.ts';

interface Session {
	id: string;
	shareId: string;
	name: string;
	type: string;
	size: number;
	modified: number;
	path: string;
	received: number;
	nextIndex: number;
	touched: number;
	busy: boolean;
}

const tmpDir = join(config.dataDir, 'tmp');
const IDLE_MS = 60 * 60_000;
const MAX_SESSIONS = 32;

const g = globalThis as unknown as { __shrimUploads?: Map<string, Session> };
const sessions = (g.__shrimUploads ??= new Map<string, Session>());

function clean() {
	const now = Date.now();
	for (const s of sessions.values()) {
		if (!s.busy && now - s.touched > IDLE_MS) drop(s);
	}
}

function drop(s: Session) {
	sessions.delete(s.id);
	rmSync(s.path, { force: true });
}

const g2 = globalThis as unknown as { __shrimUploadSweep?: boolean };
if (!g2.__shrimUploadSweep) {
	g2.__shrimUploadSweep = true;
	// Leftovers from a previous run can't be resumed.
	rmSync(tmpDir, { recursive: true, force: true });
	mkdirSync(tmpDir, { recursive: true, mode: 0o700 });
	setInterval(clean, 5 * 60_000).unref();
}

export class UploadError extends Error {
	constructor(
		public code: 'bad_request' | 'too_large' | 'unsupported_type' | 'upload_failed' | 'not_found',
		public status: number
	) {
		super(code);
	}
}

function safeName(name: string): string {
	const base = name.split(/[/\\]/).pop() ?? '';
	const cleaned = base
		.replace(/\p{Cc}/gu, '')
		.trim()
		.slice(0, 200);
	return cleaned || 'upload';
}

export function begin(shareId: string, meta: { name: string; type: string; size: number; modified: number }) {
	if (!Number.isSafeInteger(meta.size) || meta.size <= 0) throw new UploadError('bad_request', 400);
	if (meta.size > config.maxUploadBytes) throw new UploadError('too_large', 413);
	clean();
	if (sessions.size >= MAX_SESSIONS) throw new UploadError('upload_failed', 503);
	const id = randomBytes(16).toString('base64url');
	const s: Session = {
		id,
		shareId,
		name: safeName(String(meta.name)),
		type: String(meta.type).slice(0, 100),
		size: meta.size,
		modified: Number(meta.modified) || Date.now(),
		path: join(tmpDir, id),
		received: 0,
		nextIndex: 0,
		touched: Date.now(),
		busy: false
	};
	sessions.set(id, s);
	return { uploadId: id, partSize: UPLOAD_PART_SIZE };
}

function get(shareId: string, uploadId: string): Session {
	const s = sessions.get(uploadId);
	if (!s || s.shareId !== shareId) throw new UploadError('not_found', 404);
	if (s.busy) throw new UploadError('bad_request', 409);
	return s;
}

export async function part(shareId: string, uploadId: string, index: number, body: ReadableStream<Uint8Array>) {
	const s = get(shareId, uploadId);
	if (index !== s.nextIndex) throw new UploadError('bad_request', 409);
	s.busy = true;
	let written = 0;
	let out: WriteStream | undefined;
	try {
		out = createWriteStream(s.path, { flags: 'a', mode: 0o600 });
		const source = Readable.fromWeb(body as WebReadableStream<Uint8Array>);
		source.on('data', (c: Buffer) => {
			written += c.length;
			if (written > UPLOAD_PART_SIZE || s.received + written > s.size) {
				source.destroy(new UploadError('too_large', 413));
			}
		});
		await pipeline(source, out);
	} catch (e) {
		// A broken part can't be retried after a partial append, so start over.
		drop(s);
		throw e instanceof UploadError ? e : new UploadError('upload_failed', 400);
	} finally {
		s.busy = false;
	}
	s.received += written;
	s.nextIndex++;
	s.touched = Date.now();
	return { received: s.received };
}

export async function finish(shareId: string, uploadId: string, ref: ImmichLinkRef) {
	const s = get(shareId, uploadId);
	if (s.received !== s.size) throw new UploadError('bad_request', 400);
	s.busy = true;
	try {
		const kind = await sniff(s.path);
		if (!kind) throw new UploadError('unsupported_type', 415);
		return await uploadToImmich(ref, { path: s.path, name: s.name, type: s.type || kind, modified: s.modified });
	} finally {
		drop(s);
	}
}

export async function sniff(path: string): Promise<string | null> {
	const fh = await open(path, 'r');
	const buf = Buffer.alloc(32);
	try {
		await fh.read(buf, 0, 32, 0);
	} finally {
		await fh.close();
	}
	const ascii = (start: number, end: number) => buf.toString('latin1', start, end);
	if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
	if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
	if (ascii(0, 4) === 'GIF8') return 'image/gif';
	if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
	if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'AVI ') return 'video/x-msvideo';
	if (ascii(4, 8) === 'ftyp') {
		const brand = ascii(8, 12);
		if (/^(heic|heix|hevc|heim|heis|hevm|hevs|mif1|msf1)$/.test(brand)) return 'image/heic';
		if (/^avi[fs]$/.test(brand)) return 'image/avif';
		if (brand === 'crx ') return 'image/x-canon-cr3';
		if (brand === 'qt  ') return 'video/quicktime';
		if (/^3g/.test(brand)) return 'video/3gpp';
		return 'video/mp4';
	}
	if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) return 'video/webm';
	if (ascii(0, 4) === 'II*\0' || ascii(0, 4) === 'MM\0*') return 'image/tiff'; // TIFF, DNG, NEF, CR2, ARW…
	if (ascii(0, 4) === 'IIRO' || ascii(0, 4) === 'IIU\0') return 'image/x-raw';
	if (ascii(0, 15) === 'FUJIFILMCCD-RAW') return 'image/x-fuji-raf';
	if (buf[0] === 0xff && buf[1] === 0x0a) return 'image/jxl';
	if (buf.subarray(0, 12).equals(Buffer.from([0, 0, 0, 0x0c, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0x87, 0x0a])))
		return 'image/jxl';
	return null;
}

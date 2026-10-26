/**
 * The relay answers the example album the way an agent would, so the browser still gets ciphertext
 * and decrypts it with the link's key, as for a real album. No database row, no stats.
 * Photos live in apps/relay/demo (made by dev/demo-album.mjs), outside static/ so they're never served in the clear.
 */
import { existsSync, readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
	decryptStream,
	encryptStream,
	fromBase64Url,
	importShareKey,
	utf8,
	type AssetInfo,
	type Manifest,
	type RequestHead,
	type ResponseHead
} from '@shrim/protocol';
import { config } from '../config.ts';

/** Public on purpose: anyone may open the example album. Matches the link drawn on the landing page. */
export const DEMO_SHARE_ID = 'Xk3f9QaPz2';
export const DEMO_KEY = 'k8Fz2pQwR7vLm3xYyeO5EYC9mf9W3ih-SU0-yePjpOI';

interface DemoAsset {
	id: string;
	/** Base name of thumbs/<name>.webp and previews/<name>.webp */
	name: string;
	takenAt: string;
	width: number;
	height: number;
	thumbhash: string;
	camera?: string;
	exposure?: string;
}

interface DemoAlbum {
	title: string;
	description: string;
	place: string;
	assets: DemoAsset[];
}

interface Demo {
	dir: string;
	album: DemoAlbum;
	assets: Map<string, DemoAsset>;
	manifest: Manifest;
}

/** Finds apps/relay/demo from here: src/lib/server/demo in dev, build/server/chunks once built (or /app/build in Docker). */
function findDir(): string | null {
	let dir = dirname(fileURLToPath(import.meta.url));
	const roots: string[] = [];
	for (let i = 0; i < 6; i++) {
		roots.push(dir);
		const up = dirname(dir);
		if (up === dir) break;
		dir = up;
	}
	roots.push(process.cwd());
	for (const root of roots) {
		const candidate = join(root, 'demo');
		if (existsSync(join(candidate, 'album.json'))) return candidate;
	}
	return null;
}

let demo: Demo | null | undefined;

function load(): Demo | null {
	if (demo !== undefined) return demo;
	const dir = findDir();
	if (!dir) {
		console.warn('[shrim] SHRIM_DEMO is on, but the example album (demo/album.json) is missing. It stays off.');
		return (demo = null);
	}
	const album = JSON.parse(readFileSync(join(dir, 'album.json'), 'utf8')) as DemoAlbum;
	const manifest: Manifest = {
		title: album.title,
		description: album.description,
		// The viewer shows "Add photos" as for any album that takes uploads, then explains (see /s/[id]).
		allowUpload: true,
		allowDownload: true,
		showMetadata: true,
		expiresAt: null,
		assets: album.assets.map((a) => ({
			id: a.id,
			ratio: a.width / a.height,
			video: false,
			takenAt: a.takenAt,
			thumbhash: a.thumbhash
		}))
	};
	return (demo = { dir, album, assets: new Map(album.assets.map((a) => [a.id, a])), manifest });
}

export function demoEnabled(): boolean {
	return config.demo && load() !== null;
}

export function isDemoShare(id: string): boolean {
	return id === DEMO_SHARE_ID && demoEnabled();
}

export function demoPath(): string | null {
	return demoEnabled() ? `/s/${DEMO_SHARE_ID}#${DEMO_KEY}` : null;
}

let key: Promise<CryptoKey> | undefined;
const files = new Map<string, Promise<Uint8Array<ArrayBuffer>>>();

/** Every file is small (≤ 600 KB, 4 MB in all): read once, then kept. */
function file(d: Demo, path: string): Promise<Uint8Array<ArrayBuffer>> {
	let f = files.get(path);
	if (!f) {
		f = readFile(join(d.dir, path)).then((b) => new Uint8Array(b));
		f.catch(() => files.delete(path));
		files.set(path, f);
	}
	return f;
}

interface Reply {
	head: ResponseHead;
	body?: Uint8Array<ArrayBuffer>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (value: unknown): Reply => ({
	head: { status: 200, type: 'application/json' },
	body: utf8(JSON.stringify(value))
});

async function image(d: Demo, path: string, filename?: string): Promise<Reply> {
	const body = await file(d, path);
	return { head: { status: 200, type: 'image/webp', size: body.length, ...(filename ? { filename } : {}) }, body };
}

async function dispatch(d: Demo, head: RequestHead): Promise<Reply> {
	let asset: DemoAsset | undefined;
	if ('asset' in head) {
		if (typeof head.asset !== 'string' || !UUID.test(head.asset))
			return { head: { status: 400, error: 'bad_request' } };
		asset = d.assets.get(head.asset);
		if (!asset) return { head: { status: 404, error: 'not_found' } };
	}

	switch (head.op) {
		case 'manifest':
			return json(d.manifest);
		case 'thumb':
			return image(d, `${head.size === 'preview' ? 'previews' : 'thumbs'}/${asset!.name}.webp`);
		case 'original':
			// The previews stand in for originals, to keep the repository small.
			return image(d, `previews/${asset!.name}.webp`, `${asset!.name}.webp`);
		case 'info': {
			const a = asset!;
			const preview = await file(d, `previews/${a.name}.webp`);
			const info: AssetInfo = {
				filename: `${a.name}.webp`,
				takenAt: a.takenAt,
				camera: a.camera,
				exposure: a.exposure,
				size: preview.length,
				width: a.width,
				height: a.height,
				place: d.album.place
			};
			return json(info);
		}
		// Nothing sharper than the preview, and no videos.
		case 'fullsize':
		case 'video':
		case 'video.range':
			return { head: { status: 404, error: 'not_found' } };
		// The viewer explains instead of uploading; this only answers a client that tries anyway.
		case 'upload.begin':
		case 'upload.part':
		case 'upload.finish':
			return { head: { status: 403, error: 'not_allowed' } };
		default:
			return { head: { status: 400, error: 'bad_request' } };
	}
}

/** Null when the request doesn't decrypt with the demo key (the relay then answers 400, as for an agent). */
export async function answerDemo(request: Uint8Array): Promise<ReadableStream<Uint8Array> | null> {
	const d = load();
	if (!d) return null;
	key ??= importShareKey(fromBase64Url(DEMO_KEY));
	const base = await key;

	let decrypted;
	try {
		decrypted = await decryptStream<RequestHead>(
			base,
			{ kind: 'req', shareId: DEMO_SHARE_ID },
			new Blob([request as Uint8Array<ArrayBuffer>]).stream()
		);
		await decrypted.body.cancel();
	} catch {
		return null;
	}

	let reply: Reply;
	try {
		reply = await dispatch(d, decrypted.head);
	} catch (e) {
		console.error('[shrim] example album request failed', e);
		reply = { head: { status: 500 } };
	}
	const { stream } = await encryptStream(
		base,
		{ kind: 'res', shareId: DEMO_SHARE_ID, bind: decrypted.salt },
		reply.head,
		reply.body
	);
	return stream;
}

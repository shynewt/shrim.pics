/** Anything that doesn't decrypt with the share key is refused without touching Immich. */
import {
	UPLOAD_PART_SIZE,
	VIDEO_RANGE_MAX,
	decryptStream,
	encryptStream,
	fromBase64Url,
	importShareKey,
	parseContentRange,
	utf8,
	type Manifest,
	type RelayRequestEvent,
	type RequestHead,
	type ResponseHead
} from '@shrim/protocol';
import { config } from './config.ts';
import * as immich from './immich.ts';
import { relayFetch } from './relay.ts';
import { findShare, type StoredShare } from './state.ts';
import * as uploads from './uploads.ts';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Body = Uint8Array<ArrayBuffer> | ReadableStream<Uint8Array> | undefined;
interface Reply {
	head: ResponseHead;
	body?: Body;
}

const keys = new Map<string, Promise<CryptoKey>>();
function shareKey(share: StoredShare) {
	let k = keys.get(share.id);
	if (!k) {
		k = importShareKey(fromBase64Url(share.key));
		keys.set(share.id, k);
	}
	return k;
}

const manifests = new Map<string, { at: number; value: Promise<Manifest> }>();
function cachedManifest(share: StoredShare): Promise<Manifest> {
	const hit = manifests.get(share.id);
	if (hit && Date.now() - hit.at < 20_000) return hit.value;
	const value = immich.manifest(share.immich);
	manifests.set(share.id, { at: Date.now(), value });
	value.catch(() => manifests.delete(share.id));
	return value;
}

export function forgetShare(id: string) {
	keys.delete(id);
	manifests.delete(id);
}

const json = (value: unknown): Reply => ({
	head: { status: 200, type: 'application/json' },
	body: utf8(JSON.stringify(value))
});

function passthrough(res: Response, extra: Partial<ResponseHead> = {}): Reply {
	const size = Number(res.headers.get('content-length'));
	return {
		head: {
			status: 200,
			type: res.headers.get('content-type') ?? 'application/octet-stream',
			...(Number.isFinite(size) && size > 0 ? { size } : {}),
			...extra
		},
		body: res.body ?? undefined
	};
}

function filenameFrom(res: Response): string | undefined {
	const cd = res.headers.get('content-disposition') ?? '';
	const star = cd.match(/filename\*=UTF-8''([^;]+)/i);
	if (star) return decodeURIComponent(star[1]);
	return cd.match(/filename="?([^";]+)"?/i)?.[1];
}

/** Lets bytes skip..skip+take-1 of a stream through, then stops reading. */
function sliceStream(body: ReadableStream<Uint8Array>, skip: number, take: number): ReadableStream<Uint8Array> {
	const reader = body.getReader();
	let pos = 0;
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			for (;;) {
				const { value, done } = await reader.read();
				if (done) return controller.close();
				const from = Math.max(0, skip - pos);
				const to = Math.min(value.length, skip + take - pos);
				pos += value.length;
				if (to > from) controller.enqueue(value.subarray(from, to));
				if (pos >= skip + take) {
					await reader.cancel().catch(() => {});
					return controller.close();
				}
				if (to > from) return;
			}
		},
		cancel(reason) {
			return reader.cancel(reason);
		}
	});
}

async function videoRange(share: StoredShare, asset: string, start: number, end: number): Promise<Reply> {
	if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
		return { head: { status: 400, error: 'bad_request' } };
	}
	const last = Math.min(end, start + VIDEO_RANGE_MAX - 1);
	const res = await immich.videoRange(share.immich, asset, start, last);
	const type = res.headers.get('content-type') ?? 'application/octet-stream';
	const range = parseContentRange(res.headers.get('content-range'));
	if (res.status === 206 && range && res.body) {
		return {
			head: {
				status: 206,
				type,
				start: range.start,
				end: range.end,
				total: range.total,
				size: range.end - range.start + 1
			},
			body: res.body
		};
	}
	// Immich (or a proxy in front of it) ignored the range: cut the slice out of the whole file.
	const total = Number(res.headers.get('content-length'));
	if (res.status !== 200 || !res.body || !Number.isSafeInteger(total) || total <= 0) {
		await res.body?.cancel().catch(() => {});
		return { head: { status: 502, error: 'immich_unreachable' } };
	}
	if (start >= total) {
		await res.body.cancel().catch(() => {});
		return { head: { status: 416, total } };
	}
	const stop = Math.min(last, total - 1);
	return {
		head: { status: 206, type, start, end: stop, total, size: stop - start + 1 },
		body: sliceStream(res.body, start, stop - start + 1)
	};
}

/** Image types every browser we support can show. */
const WEB_IMAGE = /^image\/(jpeg|png|webp|gif|avif)\b/i;
/** Past this, an original is too heavy to decode just for zooming. */
const MAX_SHARP_BYTES = 80 * 1024 * 1024;

/**
 * The sharpest image this share may show, for zooming in. Immich's full-size
 * rendition when it has one; otherwise the original, but only if the link
 * allows downloads and a browser can display it. 404 means "keep the preview".
 */
async function fullsize(share: StoredShare, asset: string): Promise<Reply> {
	try {
		return passthrough(await immich.fullsize(share.immich, asset));
	} catch (e) {
		if (!(e instanceof immich.ImmichError && e.code === 'not_found')) throw e;
	}
	const m = await cachedManifest(share);
	if (!m.allowDownload) return { head: { status: 404, error: 'not_found' } };
	const res = await immich.original(share.immich, asset);
	const size = Number(res.headers.get('content-length'));
	if (!WEB_IMAGE.test(res.headers.get('content-type') ?? '') || size > MAX_SHARP_BYTES) {
		await res.body?.cancel().catch(() => {});
		return { head: { status: 404, error: 'not_found' } };
	}
	return passthrough(res);
}

async function dispatch(share: StoredShare, head: RequestHead, body: ReadableStream<Uint8Array>): Promise<Reply> {
	if ('asset' in head && !UUID.test(head.asset)) return { head: { status: 400, error: 'bad_request' } };
	if (head.op !== 'upload.part') await body.cancel().catch(() => {});

	switch (head.op) {
		case 'manifest':
			return json(await cachedManifest(share));
		case 'thumb':
			return passthrough(
				await immich.thumbnail(share.immich, head.asset, head.size === 'preview' ? 'preview' : 'thumbnail')
			);
		case 'original': {
			const m = await cachedManifest(share);
			if (!m.allowDownload) return { head: { status: 403, error: 'not_allowed' } };
			const res = await immich.original(share.immich, head.asset);
			return passthrough(res, { filename: filenameFrom(res) });
		}
		case 'video':
			return passthrough(await immich.video(share.immich, head.asset));
		case 'video.range':
			return videoRange(share, head.asset, head.start, head.end);
		case 'fullsize':
			return fullsize(share, head.asset);
		case 'info':
			return json(await immich.info(share.immich, head.asset));
		case 'upload.begin': {
			const link = await immich.sharedLink(share.immich);
			if (!link.allowUpload) return { head: { status: 403, error: 'not_allowed' } };
			return json(uploads.begin(share.id, head));
		}
		case 'upload.part':
			return json(await uploads.part(share.id, head.uploadId, head.index, body));
		case 'upload.finish': {
			const status = await uploads.finish(share.id, head.uploadId, share.immich);
			manifests.delete(share.id);
			return json({ status });
		}
		default:
			return { head: { status: 400, error: 'bad_request' } };
	}
}

async function postError(rid: string, code: 'not_found' | 'bad_request' | 'slow_down') {
	await relayFetch(`/agent/v1/requests/${rid}/response`, {
		method: 'POST',
		headers: { 'x-shrim-error': code }
	}).catch((e) => console.error('[shrim] could not report an error to the relay', e));
}

async function handle(evt: RelayRequestEvent) {
	const share = findShare(evt.share);
	if (!share) return postError(evt.rid, 'not_found');
	// The relay enforces expiry too; this is a second lock on our side.
	if (share.expiresAt && Date.parse(share.expiresAt) <= Date.now()) return postError(evt.rid, 'not_found');
	const base = await shareKey(share);

	let input: ReadableStream<Uint8Array>;
	if (evt.inline !== undefined) {
		const bytes = fromBase64Url(evt.inline);
		input = new ReadableStream({
			start(c) {
				c.enqueue(bytes);
				c.close();
			}
		});
	} else {
		const res = await relayFetch(`/agent/v1/requests/${evt.rid}/body`);
		if (!res.body) return postError(evt.rid, 'bad_request');
		input = res.body;
	}

	let request;
	try {
		request = await decryptStream<RequestHead>(base, { kind: 'req', shareId: share.id }, input, {
			maxBody: UPLOAD_PART_SIZE
		});
	} catch {
		return postError(evt.rid, 'bad_request');
	}

	let reply: Reply;
	try {
		reply = await dispatch(share, request.head, request.body);
	} catch (e) {
		if (e instanceof immich.ImmichError || e instanceof uploads.UploadError) {
			reply = { head: { status: e.status, error: e.code } };
		} else {
			console.error('[shrim] request failed', e);
			reply = { head: { status: 500, error: 'immich_unreachable' } };
		}
	}

	const { stream } = await encryptStream(
		base,
		{ kind: 'res', shareId: share.id, bind: request.salt },
		reply.head,
		reply.body
	);
	try {
		await relayFetch(`/agent/v1/requests/${evt.rid}/response`, {
			method: 'POST',
			headers: { 'content-type': 'application/octet-stream' },
			body: stream,
			duplex: 'half'
		});
	} catch {
		// The viewer went away, or the relay gave up waiting. Nothing to do.
		await stream.cancel().catch(() => {});
	}
}

// A small queue so a burst of thumbnails doesn't flood Immich.
let active = 0;
const queue: RelayRequestEvent[] = [];

function pump() {
	while (active < config.concurrency && queue.length) {
		const evt = queue.shift()!;
		active++;
		handle(evt)
			.catch((e) => console.error('[shrim] handler error', e))
			.finally(() => {
				active--;
				pump();
			});
	}
}

export function enqueue(evt: RelayRequestEvent) {
	if (queue.length > 500) {
		void postError(evt.rid, 'slow_down');
		return;
	}
	queue.push(evt);
	pump();
}

/**
 * Holds no keys and stores nothing: the player's Range requests become messages to the viewer
 * page, which fetches and decrypts the bytes. See src/lib/viewer/video-stream.ts.
 */
import { VIDEO_RANGE_MAX, parseRangeHeader, resolveRange } from '@shrim/protocol';
import { VIDEO_PATH, type RangeAnswer, type RangeAsk } from '#lib/viewer/video-messages.ts';

const sw = self as unknown as ServiceWorkerGlobalScope;

/** A page that doesn't answer within this is gone (closed, or navigated away). */
const ANSWER_TIMEOUT = 30_000;

interface RouterRule {
	condition: { urlPattern: unknown };
	source: 'fetch-event' | 'network';
}

sw.addEventListener('install', (event) => {
	void sw.skipWaiting();
	// Chromium's static routing: requests other than videos skip this worker entirely.
	const router = event as ExtendableEvent & { addRoutes?: (rules: RouterRule[]) => Promise<void> };
	const Pattern = (globalThis as { URLPattern?: new (init: object) => unknown }).URLPattern;
	if (router.addRoutes && Pattern) {
		event.waitUntil(
			router
				.addRoutes([
					{ condition: { urlPattern: new Pattern({ pathname: '/s/*/__video/*' }) }, source: 'fetch-event' },
					{ condition: { urlPattern: new Pattern({}) }, source: 'network' }
				])
				.catch(() => {})
		);
	}
});

sw.addEventListener('activate', (event) => event.waitUntil(sw.clients.claim()));

sw.addEventListener('message', (event) => {
	if ((event.data as { type?: string } | null)?.type === 'shrim.claim') event.waitUntil(sw.clients.claim());
});

sw.addEventListener('fetch', (event) => {
	const { request } = event;
	if (request.method !== 'GET') return;
	const url = new URL(request.url);
	if (url.origin !== sw.location.origin) return;
	const match = url.pathname.match(VIDEO_PATH);
	if (!match) return;
	event.respondWith(serve(event, match[1], match[2]));
});

/** The viewer page that asked: the one the request came from, else any open viewer of this share. */
async function viewerFor(event: FetchEvent, share: string): Promise<Client | undefined> {
	if (event.clientId) {
		const client = await sw.clients.get(event.clientId);
		if (client) return client;
	}
	const all = await sw.clients.matchAll({ type: 'window' });
	return all.find((c) => new URL(c.url).pathname === `/s/${share}`);
}

function ask(client: Client, msg: RangeAsk): Promise<RangeAnswer> {
	return new Promise((resolve) => {
		const channel = new MessageChannel();
		const timer = setTimeout(() => {
			channel.port1.close();
			resolve({ ok: false, status: 504 });
		}, ANSWER_TIMEOUT);
		channel.port1.onmessage = (e) => {
			clearTimeout(timer);
			channel.port1.close();
			resolve(e.data as RangeAnswer);
		};
		client.postMessage(msg, [channel.port2]);
	});
}

function plain(status: number, headers: Record<string, string> = {}) {
	return new Response(null, { status, headers: { 'cache-control': 'no-store', ...headers } });
}

function failure(answer: Extract<RangeAnswer, { ok: false }>) {
	if (answer.status === 416 && answer.total !== undefined) {
		return plain(416, { 'content-range': `bytes */${answer.total}` });
	}
	return plain(answer.status === 404 ? 404 : 502);
}

async function serve(event: FetchEvent, share: string, asset: string): Promise<Response> {
	const client = await viewerFor(event, share);
	if (!client) return plain(503);
	const msg = (start: number, end: number): RangeAsk => ({ type: 'shrim.range', share, asset, start, end });

	// Several ranges, or a malformed header: answering with the whole file is always allowed.
	const header = parseRangeHeader(event.request.headers.get('range'));
	const wanted = header ?? { start: 0 };
	const partial = !!header;

	// "The last n bytes" needs the size first; the first chunk is cached by the page anyway.
	let start: number;
	let end: number | undefined;
	if ('suffix' in wanted) {
		const probe = await ask(client, msg(0, 0));
		if (!probe.ok) return failure(probe);
		const span = resolveRange(wanted, probe.total);
		if (!span) return plain(416, { 'content-range': `bytes */${probe.total}` });
		({ start, end } = span);
	} else {
		({ start, end } = wanted);
	}

	// "From here to the end": answer with a bounded piece (206 with the real total), and the
	// player asks for the next one. Some engines (WebKit) otherwise read far ahead of playback.
	if (partial && end === undefined) end = start + VIDEO_RANGE_MAX - 1;

	const first = await ask(client, msg(start, end ?? Number.MAX_SAFE_INTEGER));
	if (!first.ok) return failure(first);
	const span = resolveRange({ start, end }, first.total);
	if (!span) return plain(416, { 'content-range': `bytes */${first.total}` });

	let pos = span.start;
	let pending: Uint8Array | null = new Uint8Array(first.bytes);
	const body = new ReadableStream<Uint8Array>(
		{
			async pull(controller) {
				let bytes = pending;
				pending = null;
				if (!bytes) {
					const next = await ask(client, msg(pos, span.end));
					if (!next.ok || next.start !== pos || next.bytes.byteLength === 0) {
						return controller.error(new Error(`Range ${pos}-${span.end} failed`));
					}
					bytes = new Uint8Array(next.bytes);
				}
				if (bytes.length > span.end - pos + 1) bytes = bytes.subarray(0, span.end - pos + 1);
				controller.enqueue(bytes);
				pos += bytes.length;
				if (pos > span.end) controller.close();
			}
		},
		// Only fetch when the player reads: a seek cancels this stream and nothing more is asked for.
		{ highWaterMark: 0 }
	);

	const headers: Record<string, string> = {
		'content-type': first.type,
		'content-length': String(span.end - span.start + 1),
		'accept-ranges': 'bytes',
		// Plaintext: never into any cache.
		'cache-control': 'no-store'
	};
	if (partial) headers['content-range'] = `bytes ${span.start}-${span.end}/${first.total}`;
	return new Response(body, { status: partial ? 206 : 200, headers });
}

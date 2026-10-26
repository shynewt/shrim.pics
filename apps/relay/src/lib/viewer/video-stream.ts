/**
 * The service worker answers `Range` requests for `/s/<share>/__video/<asset>` by asking this
 * page for the bytes. The key never leaves this page (the worker never sees it), the relay only
 * carries ciphertext, and decrypted chunks stay in memory, never on disk.
 */
import { VIDEO_CHUNK, type ResponseHead } from '@shrim/protocol';
import { AgentFailure, type ShareClient } from './client.ts';
import { videoStreamUrl, type ClaimAsk, type RangeAnswer, type RangeAsk } from './video-messages.ts';

export { isStreamUrl } from './video-messages.ts';

/** Chunks fetched ahead of what the player asked for. */
const AHEAD = 3;
/** Decrypted chunks kept in memory, across all videos (1 MiB each). */
const KEEP = 12;

interface Chunk {
	start: number;
	total: number;
	type: string;
	bytes: Uint8Array<ArrayBuffer>;
}

/** This browser can't stream here: no service worker, or it never took control of the page. */
export class StreamUnavailable extends Error {}

let registration: Promise<boolean> | null = null;

/** Registers the worker once per page, and resolves true when it controls this page. */
function controlled(): Promise<boolean> {
	registration ??= (async () => {
		const sw = navigator.serviceWorker;
		try {
			// Scoped to the viewer: the rest of the site never runs it.
			await sw.register('/service-worker.js', { scope: '/s/', type: 'module' });
			const reg = await withTimeout(sw.ready, 5000);
			if (sw.controller) return true;
			if (!reg?.active) return false;
			const claimed = new Promise<boolean>((resolve) =>
				sw.addEventListener('controllerchange', () => resolve(!!sw.controller), { once: true })
			);
			reg.active.postMessage({ type: 'shrim.claim' } satisfies ClaimAsk);
			return (await withTimeout(claimed, 3000)) ?? false;
		} catch {
			return false;
		}
	})();
	return registration;
}

async function withTimeout<T>(p: Promise<T>, ms: number): Promise<T | null> {
	let t: ReturnType<typeof setTimeout> | undefined;
	try {
		return await Promise.race([p, new Promise<null>((resolve) => (t = setTimeout(() => resolve(null), ms)))]);
	} finally {
		clearTimeout(t);
	}
}

export class VideoStreams {
	#client: ShareClient;
	/** Insertion order is the eviction order. */
	#chunks = new Map<string, Promise<Chunk>>();
	#totals = new Map<string, number>();
	/** Videos the lightbox is showing. Requests for any other are refused. */
	#active = new Map<string, AbortController>();

	constructor(client: ShareClient) {
		this.#client = client;
	}

	static supported(): boolean {
		return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && window.isSecureContext;
	}

	/**
	 * Gets a video ready to stream and returns the URL for the `<video>`.
	 * Fetches the first chunk first, which the player needs anyway: it proves
	 * the agent can serve ranges (older agents answer 400) before we commit.
	 */
	async open(asset: string): Promise<string> {
		if (!(await controlled()) || !navigator.serviceWorker.controller) throw new StreamUnavailable();
		this.#listen();
		if (!this.#active.has(asset)) this.#active.set(asset, new AbortController());
		try {
			await this.#chunk(asset, 0);
		} catch (e) {
			this.stop(asset);
			throw e;
		}
		return videoStreamUrl(this.#client.id, asset);
	}

	/** The viewer moved on: cancel what's in flight and forget the bytes. */
	stop(asset: string) {
		this.#active.get(asset)?.abort();
		this.#active.delete(asset);
		for (const key of [...this.#chunks.keys()]) if (key.startsWith(`${asset}:`)) this.#chunks.delete(key);
	}

	dispose() {
		for (const asset of [...this.#active.keys()]) this.stop(asset);
		this.#chunks.clear();
		if (this.#listening) navigator.serviceWorker.removeEventListener('message', this.#onmessage);
		this.#listening = false;
	}

	#listening = false;
	#listen() {
		if (this.#listening) return;
		this.#listening = true;
		navigator.serviceWorker.addEventListener('message', this.#onmessage);
		navigator.serviceWorker.startMessages();
	}

	#onmessage = (e: MessageEvent) => {
		const ask = e.data as RangeAsk | undefined;
		const port = e.ports[0];
		if (!port || ask?.type !== 'shrim.range' || ask.share !== this.#client.id) return;
		void this.read(ask.asset, ask.start, ask.end).then((answer) =>
			port.postMessage(answer, answer.ok ? [answer.bytes] : [])
		);
	};

	/** Bytes from `start`, up to `end` or the end of the chunk holding `start`, whichever comes first. */
	async read(asset: string, start: number, end: number): Promise<RangeAnswer> {
		if (!this.#active.has(asset)) return { ok: false, status: 409 };
		if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end < start) {
			return { ok: false, status: 400 };
		}
		const known = this.#totals.get(asset);
		if (known !== undefined && start >= known) return { ok: false, status: 416, total: known };
		const index = Math.floor(start / VIDEO_CHUNK);
		let chunk: Chunk;
		try {
			chunk = await this.#chunk(asset, index);
		} catch (e) {
			const head: ResponseHead | undefined = e instanceof AgentFailure ? e.head : undefined;
			return { ok: false, status: head?.status ?? 502, total: head?.total };
		}
		if (start >= chunk.total) return { ok: false, status: 416, total: chunk.total };
		const from = start - chunk.start;
		const to = Math.min(chunk.bytes.length, end - chunk.start + 1);
		// Read ahead, so the next pull is already here.
		for (let i = 1; i <= AHEAD && (index + i) * VIDEO_CHUNK < chunk.total; i++) {
			this.#chunk(asset, index + i).catch(() => {});
		}
		// A copy, because the buffer is transferred to the worker.
		return { ok: true, total: chunk.total, type: chunk.type, start, bytes: chunk.bytes.slice(from, to).buffer };
	}

	#chunk(asset: string, index: number): Promise<Chunk> {
		const key = `${asset}:${index}`;
		const hit = this.#chunks.get(key);
		if (hit) {
			// Recently used goes to the back of the line.
			this.#chunks.delete(key);
			this.#chunks.set(key, hit);
			return hit;
		}
		const signal = this.#active.get(asset)?.signal;
		if (!signal) return Promise.reject(new Error('Not playing'));
		const p = this.#fetch(asset, index, signal);
		p.catch(() => {
			if (this.#chunks.get(key) === p) this.#chunks.delete(key);
		});
		this.#chunks.set(key, p);
		while (this.#chunks.size > KEEP) this.#chunks.delete(this.#chunks.keys().next().value!);
		return p;
	}

	async #fetch(asset: string, index: number, signal: AbortSignal): Promise<Chunk> {
		const start = index * VIDEO_CHUNK;
		const end = start + VIDEO_CHUNK - 1;
		const r = await this.#client.send({ op: 'video.range', asset, start, end }, undefined, signal);
		const { head } = r;
		if (head.status !== 206 || head.start !== start || head.total === undefined || head.end === undefined) {
			await r.body.cancel().catch(() => {});
			throw new AgentFailure(head);
		}
		const parts: Uint8Array<ArrayBuffer>[] = [];
		let size = 0;
		const reader = r.body.getReader();
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			parts.push(value);
			size += value.length;
		}
		if (size !== head.end - head.start + 1) throw new AgentFailure({ status: 502, error: 'immich_unreachable' });
		const bytes = new Uint8Array(size);
		let at = 0;
		for (const p of parts) {
			bytes.set(p, at);
			at += p.length;
		}
		this.#totals.set(asset, head.total);
		return { start, total: head.total, type: head.type ?? 'video/mp4', bytes };
	}
}

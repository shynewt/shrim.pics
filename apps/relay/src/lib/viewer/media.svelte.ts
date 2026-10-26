/** Decrypted media as blob: URLs, shared by the grid and the lightbox. */
import { SvelteMap } from 'svelte/reactivity';
import { AgentFailure, type ShareClient } from './client.ts';
import { StreamUnavailable, VideoStreams, isStreamUrl } from './video-stream.ts';

/** Previews and whole videos kept decoded. */
const KEEP = 24;
/** Full-size images are big: only the last few stay. */
const KEEP_SHARP = 3;

type Cache = SvelteMap<string, string>;

export class Media {
	readonly thumbs = new SvelteMap<string, string>();
	readonly previews = new SvelteMap<string, string>();
	/** blob: URLs of whole videos, or the streaming URL the service worker answers. */
	readonly videos = new SvelteMap<string, string>();
	/** Full-size images, fetched when someone zooms in. */
	readonly sharp = new SvelteMap<string, string>();
	// Bookkeeping only; nothing renders from these, so they stay plain.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#inflight = new Map<string, Promise<string>>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#order = new Map<Cache, string[]>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#noSharp = new Set<string>();
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#noStream = new Set<string>();
	#client: ShareClient;
	#streams: VideoStreams;
	/** Turns false when streaming can't work here (no service worker, an agent too old): videos then download whole. */
	#streamable = VideoStreams.supported();
	#abort = new AbortController();

	constructor(client: ShareClient) {
		this.#client = client;
		this.#streams = new VideoStreams(client);
	}

	#tag(cache: Cache) {
		return cache === this.thumbs ? 't' : cache === this.previews ? 'p' : cache === this.videos ? 'v' : 'f';
	}

	#load(cache: Cache, key: string, fetcher: () => Promise<string>): Promise<string> {
		const hit = cache.get(key);
		if (hit) return Promise.resolve(hit);
		const id = `${this.#tag(cache)}:${key}`;
		let p = this.#inflight.get(id);
		if (!p) {
			p = fetcher()
				.then((url) => {
					cache.set(key, url);
					if (cache !== this.thumbs && !isStreamUrl(url)) this.#remember(cache, key);
					return url;
				})
				.finally(() => this.#inflight.delete(id));
			this.#inflight.set(id, p);
		}
		return p;
	}

	#blob(fetcher: () => Promise<Blob>, urgent: boolean): Promise<string> {
		return this.#client.queue.run(fetcher, urgent).then((blob) => URL.createObjectURL(blob));
	}

	/** Keeps memory bounded: only the most recent large items stay decoded. */
	#remember(cache: Cache, key: string) {
		const order = (this.#order.get(cache) ?? []).filter((k) => k !== key);
		order.push(key);
		while (order.length > (cache === this.sharp ? KEEP_SHARP : KEEP)) {
			const old = order.shift()!;
			const url = cache.get(old);
			if (url && !isStreamUrl(url)) URL.revokeObjectURL(url);
			cache.delete(old);
		}
		this.#order.set(cache, order);
	}

	thumb(asset: string) {
		return this.#load(this.thumbs, asset, () =>
			this.#blob(
				async () =>
					(await this.#client.blob({ op: 'thumb', asset, size: 'thumbnail' }, { signal: this.#abort.signal })).blob,
				false
			)
		);
	}

	preview(asset: string, urgent = true) {
		return this.#load(this.previews, asset, () =>
			this.#blob(
				async () =>
					(await this.#client.blob({ op: 'thumb', asset, size: 'preview' }, { signal: this.#abort.signal })).blob,
				urgent
			)
		);
	}

	/**
	 * A URL the lightbox's `<video>` can play. Streams when it can (playback
	 * starts at once and seeks anywhere); otherwise downloads the whole file
	 * first, reporting progress.
	 */
	video(asset: string, onProgress?: (p: number) => void) {
		return this.#load(this.videos, asset, async () => {
			if (this.#streamable && !this.#noStream.has(asset)) {
				try {
					return await this.#streams.open(asset);
				} catch (e) {
					if (this.#abort.signal.aborted) throw e;
					// No worker, or an agent from before video.range (400): download every video whole.
					// Anything else: just this one, this time.
					if (e instanceof StreamUnavailable || (e instanceof AgentFailure && e.head.status === 400)) {
						this.#streamable = false;
					} else this.#noStream.add(asset);
				}
			}
			return this.#blob(
				async () => (await this.#client.blob({ op: 'video', asset }, { onProgress, signal: this.#abort.signal })).blob,
				true
			);
		});
	}

	/** The lightbox left this video: stop streaming it. A whole download stays cached. */
	stopVideo(asset: string) {
		const url = this.videos.get(asset);
		if (url && isStreamUrl(url)) this.videos.delete(asset);
		this.#streams.stop(asset);
	}

	/**
	 * The player couldn't use the stream (a browser quirk, a worker that went
	 * away). Returns true if a whole download is worth a try.
	 */
	streamFailed(asset: string): boolean {
		const url = this.videos.get(asset);
		if (!url || !isStreamUrl(url)) return false;
		this.#noStream.add(asset);
		this.stopVideo(asset);
		return true;
	}

	/**
	 * The sharpest image the share allows, for zooming in. Resolves to null
	 * when there's nothing better than the preview (or an older agent).
	 */
	async sharpen(asset: string): Promise<string | null> {
		if (this.#noSharp.has(asset)) return null;
		try {
			return await this.#load(this.sharp, asset, () =>
				this.#blob(
					async () => (await this.#client.blob({ op: 'fullsize', asset }, { signal: this.#abort.signal })).blob,
					true
				)
			);
		} catch (e) {
			if (e instanceof AgentFailure) this.#noSharp.add(asset);
			return null;
		}
	}

	dispose() {
		this.#abort.abort();
		this.#streams.dispose();
		for (const map of [this.thumbs, this.previews, this.videos, this.sharp]) {
			for (const url of map.values()) if (!isStreamUrl(url)) URL.revokeObjectURL(url);
			map.clear();
		}
	}
}

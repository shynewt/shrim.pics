<script lang="ts">
	import type { AssetInfo, Manifest } from '@shrim/protocol';
	import { Icon, Spinner, formatDate, formatSize, toast } from '@shrim/ui';
	import { onMount, tick, untrack } from 'svelte';
	import type { ShareClient } from './client.ts';
	import { longDate } from './groups.ts';
	import type { Media } from './media.svelte.ts';
	import { Gestures, KEY_STEP, Zoom, type Size } from './zoom.svelte.ts';

	let {
		manifest,
		index,
		media,
		client,
		onnavigate,
		onclose,
		autoplay = false
	}: {
		manifest: Manifest;
		index: number;
		media: Media;
		client: ShareClient;
		onnavigate: (index: number) => void;
		onclose: () => void;
		autoplay?: boolean;
	} = $props();

	const assets = $derived(manifest.assets);
	const asset = $derived(assets[index]);
	const thumbUrl = $derived(media.thumbs.get(asset.id));
	const previewUrl = $derived(media.previews.get(asset.id));
	const videoUrl = $derived(media.videos.get(asset.id));
	const sharpUrl = $derived(media.sharp.get(asset.id));
	const canSlideshow = $derived(assets.some((a) => !a.video));

	let failed = $state<Record<string, boolean>>({});
	let progress = $state<Record<string, number>>({});
	let previewShown = $state<Record<string, boolean>>({});
	let sharpShown = $state<Record<string, boolean>>({});
	/** The preview's size on screen, so the sharper image lands exactly on top of it. */
	let previewBox = $state.raw<Size>({ w: 0, h: 0 });
	let detailsOpen = $state(false);
	let downloading = $state(false);
	let controlsVisible = $state(true);
	let playing = $state(false);
	let dragX = $state(0);
	let root: HTMLElement | null = null;
	let stage: HTMLElement | null = null;
	/** The frame the photo sits in (it carries the zoom transform). */
	let frame: HTMLElement | null = null;
	let hideTimer: ReturnType<typeof setTimeout>;
	let wakeLock: { release: () => Promise<void> } | null = null;
	let fullscreen = false;
	/** Cancels a single download if the viewer closes first. */
	let downloadAbort: AbortController | null = null;

	const SLIDE_MS = 5000;

	const round = 'round inline-grid size-11 place-items-center rounded-full text-on-scrim';
	const idleBg = 'bg-scrim-control hover:bg-scrim-control-hover';
	/** The arrows sit on the stage's edges; touch screens swipe instead. */
	const nav = 'absolute top-1/2 -translate-y-1/2 [@media(hover:none)]:hidden';
	/** The thumbnail while the preview decrypts, stretched to fit the frame. */
	const placeholder = 'size-full max-h-full max-w-full object-contain';

	/** Each item starts unzoomed. */
	const zoom = $derived.by(() => {
		void asset.id;
		return new Zoom(measure);
	});
	const canZoom = $derived(!asset.video && !failed[asset.id]);

	const shownPhoto = () => frame?.querySelector<HTMLImageElement>('img.full.shown') ?? null;

	function measure(): { frame: Size; content: Size } {
		const f = { w: frame?.offsetWidth ?? 0, h: frame?.offsetHeight ?? 0 };
		const img = shownPhoto();
		if (img) return { frame: f, content: { w: img.offsetWidth, h: img.offsetHeight } };
		// Still on the thumbnail, which is stretched to fit the frame.
		const r = asset.ratio || 1;
		const w = Math.min(f.w, f.h * r);
		return { frame: f, content: { w, h: w / r } };
	}

	/** Zoomed in past what the preview's pixels can show: fetch the sharpest image the share allows. */
	function sharpen() {
		const img = shownPhoto();
		if (!img || !canZoom || zoom.scale < 1.5) return;
		if (img.offsetWidth * zoom.scale * devicePixelRatio <= img.naturalWidth * 1.1) return;
		void media.sharpen(asset.id);
	}

	const gestures = new Gestures({
		zoom: () => (canZoom ? zoom : null),
		centre: () => {
			const r = stage?.getBoundingClientRect();
			if (!r || !frame) return { x: 0, y: 0 };
			return {
				x: r.left + frame.offsetLeft + frame.offsetWidth / 2,
				y: r.top + frame.offsetTop + frame.offsetHeight / 2
			};
		},
		drag: (dx) => (dragX = dx),
		swipe: (direction) => go(direction),
		close: () => onclose(),
		tap: () => (controlsVisible = !controlsVisible),
		zooming: () => playing && pause(),
		settled: sharpen
	});

	function zoomBy(factor: number) {
		if (playing) pause();
		zoom.zoomTo(zoom.scale * factor, { x: 0, y: 0 }, true);
	}
	const dateLine = $derived(manifest.showMetadata || asset.takenAt ? longDate(asset.takenAt) : '');

	/** The next photo after i, skipping videos (the slideshow doesn't play them). */
	function nextPhoto(i: number): number {
		for (let j = i + 1; j < assets.length; j++) if (!assets[j].video) return j;
		return -1;
	}

	async function play() {
		if (playing) return;
		playing = true;
		controlsVisible = false;
		if (asset.video) {
			const n = nextPhoto(index);
			if (n < 0) return pause();
			onnavigate(n);
		}
		try {
			if (!/iPhone|iPad/.test(navigator.userAgent)) await root?.requestFullscreen?.();
			fullscreen = !!document.fullscreenElement;
		} catch {
			// fullscreen is a nicety
		}
		// Paused (or closed) while the browser was still deciding.
		if (!playing) return leaveFullscreen();
		const lock =
			(await (navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof wakeLock> } }).wakeLock
				?.request('screen')
				.catch(() => null)) ?? null;
		// Paused while the lock was on its way: hand it straight back.
		if (playing) wakeLock = lock;
		else void lock?.release().catch(() => {});
	}

	function leaveFullscreen() {
		fullscreen = false;
		if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
	}

	function pause() {
		playing = false;
		controlsVisible = true;
		void wakeLock?.release().catch(() => {});
		wakeLock = null;
		leaveFullscreen();
	}

	/** Leaving fullscreen with the browser's own Esc also stops the slideshow. */
	function onfullscreenchange() {
		if (fullscreen && !document.fullscreenElement) {
			fullscreen = false;
			if (playing) pause();
		}
	}

	// While playing: once the photo on screen has loaded, wait, then move on.
	$effect(() => {
		if (!playing || !previewShown[asset.id]) return;
		const n = nextPhoto(index);
		const t = setTimeout(() => (n < 0 ? pause() : onnavigate(n)), SLIDE_MS);
		return () => clearTimeout(t);
	});

	/** Starts decrypting an item. State only changes later, when the work finishes. */
	function load(i: number, urgent: boolean) {
		const a = assets[i];
		if (!a) return;
		void media.thumb(a.id).catch(() => {});
		if (a.video) {
			if (urgent) {
				media.video(a.id, (p) => (progress[a.id] = p)).catch(() => (failed[a.id] = true));
			}
		} else {
			media.preview(a.id, urgent).catch(() => urgent && (failed[a.id] = true));
		}
	}

	// Decrypt the current item, then its neighbours. Only a new index re-runs this, not arriving blobs.
	$effect(() => {
		const i = index;
		const a = untrack(() => assets[i]);
		untrack(() => load(i, true));
		const t = setTimeout(() => {
			if (!assets[i + 1]?.video) load(i + 1, false);
			if (!assets[i - 1]?.video) load(i - 1, false);
		}, 300);
		return () => {
			clearTimeout(t);
			// Moving on stops a streaming video: no more ranges are fetched for it.
			if (a?.video) media.stopVideo(a.id);
		};
	});

	/** The stream didn't work in this browser: fall back to downloading the whole video. */
	function onvideoerror() {
		if (media.streamFailed(asset.id)) load(index, true);
	}

	// Details are fetched once per item, and only while the panel is open.
	const info = $derived(detailsOpen && manifest.showMetadata ? client.info(asset.id) : null);

	function rowsFor(info: AssetInfo): [string, string][] {
		return (
			[
				['Date', info.takenAt ? formatDate(info.takenAt) : undefined],
				['Camera', info.camera],
				['Lens', info.lens],
				['Exposure', info.exposure],
				['Dimensions', info.width && info.height ? `${info.width} × ${info.height}` : undefined],
				['Size', info.size ? formatSize(info.size) : undefined],
				['Place', info.place],
				['File', info.filename]
			] as [string, string | undefined][]
		).filter((r): r is [string, string] => !!r[1]);
	}

	function go(delta: number) {
		const next = index + delta;
		if (next >= 0 && next < assets.length) onnavigate(next);
	}

	function retry() {
		failed[asset.id] = false;
		load(index, true);
	}

	async function download() {
		if (downloading) return;
		downloading = true;
		downloadAbort = new AbortController();
		try {
			const { blob, head } = await client.blob({ op: 'original', asset: asset.id }, { signal: downloadAbort.signal });
			const ext = (head.type ?? '').split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
			const name = head.filename ?? `shrim-${client.id}-${index + 1}.${ext}`;
			const url = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = url;
			a.download = name;
			document.body.append(a);
			a.click();
			a.remove();
			setTimeout(() => URL.revokeObjectURL(url), 10_000);
		} catch {
			if (!downloadAbort?.signal.aborted)
				toast(`Couldn't download this ${asset.video ? 'video' : 'photo'}. Try again.`, 'error');
		} finally {
			downloading = false;
			downloadAbort = null;
		}
	}

	function onkeydown(e: KeyboardEvent) {
		// Alt+Left is the browser's Back; leave modified keys alone.
		if (e.altKey || e.ctrlKey || e.metaKey) return;
		// A focused video uses arrows and Space to seek and play.
		const inVideo = document.activeElement instanceof HTMLVideoElement;
		if (e.key === 'ArrowRight' && !inVideo) go(1);
		else if (e.key === 'ArrowLeft' && !inVideo) go(-1);
		else if (e.key === 'Escape') {
			e.preventDefault();
			if (playing) pause();
			else if (detailsOpen) detailsOpen = false;
			else if (zoom.zoomed) zoom.reset(true);
			else onclose();
		} else if (e.key === ' ' && !inVideo) {
			e.preventDefault();
			if (playing) pause();
			else void play();
		} else if (e.key === 'i' && manifest.showMetadata) detailsOpen = !detailsOpen;
		else if ((e.key === '+' || e.key === '=') && canZoom) zoomBy(KEY_STEP);
		else if (e.key === '-' && canZoom) zoomBy(1 / KEY_STEP);
		else if (e.key === '0' && canZoom) zoom.reset(true);
		else if (e.key === 'Tab') trapFocus(e);
	}

	function trapFocus(e: KeyboardEvent) {
		if (!root) return;
		const items = [...root.querySelectorAll<HTMLElement>('button, video, [href]')].filter(
			(el) => !el.hasAttribute('disabled') && el.offsetParent !== null
		);
		if (!items.length) return;
		const first = items[0];
		const last = items[items.length - 1];
		const active = document.activeElement;
		if (!active || active === root || !root.contains(active)) {
			e.preventDefault();
			(e.shiftKey ? last : first).focus();
		} else if (e.shiftKey && active === first) {
			e.preventDefault();
			last.focus();
		} else if (!e.shiftKey && active === last) {
			e.preventDefault();
			first.focus();
		}
	}

	function showControls() {
		controlsVisible = true;
		clearTimeout(hideTimer);
		hideTimer = setTimeout(() => (controlsVisible = false), 2500);
	}

	onMount(() => {
		const overflow = document.body.style.overflow;
		document.body.style.overflow = 'hidden';
		showControls();
		if (autoplay) void play();
		return () => {
			document.body.style.overflow = overflow;
			clearTimeout(hideTimer);
			gestures.dispose();
			playing = false;
			downloadAbort?.abort();
			void wakeLock?.release().catch(() => {});
			wakeLock = null;
			leaveFullscreen();
			// Hand focus back to the tile of whatever was on screen last, once the page is no longer inert.
			const last = index;
			void tick().then(() => document.querySelector<HTMLElement>(`[data-index="${last}"]`)?.focus());
		};
	});
</script>

<svelte:window {onkeydown} />
<svelte:document {onfullscreenchange} />

<div
	class={[
		'lightbox fixed inset-0 z-lightbox grid overflow-hidden bg-scrim text-on-scrim focus-visible:outline-none',
		{ details: detailsOpen, playing }
	]}
	{@attach (el) => {
		root = el;
		return () => (root = null);
	}}
	role="dialog"
	aria-modal="true"
	aria-label="Photo viewer"
	tabindex="-1"
	onpointermove={(e) => e.pointerType === 'mouse' && showControls()}
>
	<!-- The top bar only hides during a slideshow (fading out, back at once); idle mouse time just hides the arrows. -->
	<div
		class={[
			'col-span-full flex min-w-0 items-center justify-between gap-3 px-4 max-xs:pr-2',
			playing && !controlsVisible && 'opacity-0 transition-opacity duration-base'
		]}
	>
		<div class="grid min-w-0">
			<span class="counter truncate text-sm/xs text-on-scrim-muted tabular">{index + 1} of {assets.length}</span>
			{#if dateLine}<span class="truncate text-xs text-on-scrim-muted tabular">{dateLine}</span>{/if}
		</div>
		<span class="visually-hidden" aria-live="polite">{playing ? 'Slideshow playing' : ''}</span>
		<!-- Phones: four 44 px buttons and the counter share 360 px. -->
		<div class="flex flex-none gap-2 max-xs:gap-1">
			{#if canSlideshow}
				<button
					class={[round, idleBg]}
					onclick={() => (playing ? pause() : play())}
					aria-label={playing ? 'Pause slideshow' : 'Play slideshow'}
					title={playing ? 'Pause slideshow' : 'Play slideshow'}
				>
					<Icon name={playing ? 'pause' : 'play'} size={24} />
				</button>
			{/if}
			{#if manifest.showMetadata}
				<button
					class={[round, detailsOpen ? 'bg-scrim-control-hover' : idleBg]}
					onclick={() => (detailsOpen = !detailsOpen)}
					aria-label="Details"
					title="Details"
					aria-pressed={detailsOpen}
				>
					<Icon name="info" size={24} />
				</button>
			{/if}
			{#if manifest.allowDownload}
				<button
					class={[round, idleBg]}
					onclick={download}
					aria-label={downloading ? 'Downloading…' : 'Download'}
					title={downloading ? 'Downloading…' : 'Download'}
					aria-busy={downloading || undefined}
				>
					{#if downloading}<Spinner size={20} />{:else}<Icon name="download" size={24} />{/if}
				</button>
			{/if}
			<button class={[round, idleBg]} {@attach (el) => el.focus()} onclick={onclose} aria-label="Close" title="Close">
				<Icon name="x" size={24} />
			</button>
		</div>
	</div>

	<!-- Every gesture is ours (swipe, pinch, pan, double tap), so the browser handles none.
	     A zoomed photo stays under the top bar, never over it. -->
	<div
		class={[
			'stage relative min-h-0 min-w-0 touch-none overflow-hidden select-none',
			gestures.active ? 'cursor-grabbing' : zoom.zoomed && 'cursor-grab'
		]}
		onpointerdown={(e) => gestures.down(e)}
		onpointermove={(e) => gestures.move(e)}
		onpointerup={(e) => gestures.up(e)}
		onpointercancel={(e) => gestures.cancel(e)}
		ondblclick={(e) => gestures.dblclick(e)}
		{@attach (el) => {
			stage = el;
			// Not passive: ctrl+wheel (a trackpad pinch) would zoom the whole page otherwise.
			const onwheel = (e: WheelEvent) => gestures.wheel(e);
			el.addEventListener('wheel', onwheel, { passive: false });
			return () => {
				el.removeEventListener('wheel', onwheel);
				stage = null;
			};
		}}
		role="presentation"
	>
		{#if playing && previewShown[asset.id]}
			{#key asset.id}<span
					class="slide-progress absolute top-0 left-0 z-1 h-0.5 w-full origin-left bg-accent"
					style:--slide="{SLIDE_MS}ms"
				></span>{/key}
		{/if}
		{#key asset.id}
			<!-- will-change only while moving: a permanent layer would keep a zoomed photo rasterised at 1×, blurry. -->
			<div
				class={[
					'media absolute inset-x-4 top-0 bottom-4 grid place-items-center',
					(gestures.active || zoom.animated) && 'will-change-transform',
					zoom.animated && 'transition-transform duration-slow'
				]}
				style:transform={zoom.transform ?? (dragX ? `translateX(${dragX}px)` : undefined)}
				ontransitionend={(e) => {
					if (e.target !== e.currentTarget || e.propertyName !== 'transform') return;
					zoom.animated = false;
					sharpen();
				}}
				{@attach (el) => {
					frame = el;
					// The window or the details panel changed the frame: keep the photo in bounds.
					const ro = new ResizeObserver(() => zoom.zoomed && zoom.set(zoom.scale, zoom.x, zoom.y));
					ro.observe(el);
					return () => {
						ro.disconnect();
						if (frame === el) frame = null;
					};
				}}
			>
				{#if failed[asset.id]}
					<p class="text-center text-sm text-on-scrim-muted">
						This {asset.video ? 'video' : 'photo'} couldn't be loaded.
						<button class="text-on-scrim underline-link" onclick={retry}>Try again</button>
					</p>
				{:else if asset.video}
					{#if videoUrl}
						<!-- svelte-ignore a11y_media_has_caption -->
						<video
							class="size-full max-h-full max-w-full object-contain"
							src={videoUrl}
							poster={thumbUrl}
							controls
							playsinline
							preload="metadata"
							onerror={onvideoerror}
						></video>
					{:else}
						{#if thumbUrl}<img class={placeholder} src={thumbUrl} alt="" />{/if}
						<span class="inline-flex items-center gap-2 rounded-full bg-media-badge px-3 py-2 text-sm" role="status">
							<Spinner size={20} />
							<span class="tabular"
								>{progress[asset.id] ? `${Math.round(progress[asset.id] * 100)}%` : 'Loading video…'}</span
							>
						</span>
					{/if}
				{:else}
					{#if thumbUrl && !previewShown[asset.id]}
						<img class={placeholder} src={thumbUrl} alt="" draggable="false" />
					{/if}
					{#if previewUrl}
						<img
							class={[
								'full max-h-full max-w-full object-contain transition-opacity duration-base',
								previewShown[asset.id] ? 'shown opacity-100' : 'opacity-0'
							]}
							src={previewUrl}
							alt=""
							draggable="false"
							onload={() => (previewShown[asset.id] = true)}
							{@attach (el) => {
								const ro = new ResizeObserver(() => (previewBox = { w: el.offsetWidth, h: el.offsetHeight }));
								ro.observe(el);
								return () => ro.disconnect();
							}}
						/>
					{/if}
					{#if sharpUrl && previewShown[asset.id]}
						<!-- Same box as the preview, on top of it: it fades in with no jump. -->
						<img
							class={[
								'sharp max-h-none max-w-none object-contain transition-opacity duration-base',
								sharpShown[asset.id] ? 'shown opacity-100' : 'opacity-0'
							]}
							src={sharpUrl}
							alt=""
							draggable="false"
							style:width="{previewBox.w}px"
							style:height="{previewBox.h}px"
							onload={() => (sharpShown[asset.id] = true)}
						/>
					{/if}
					{#if !previewShown[asset.id]}
						<span class="m-3 self-start justify-self-end text-on-scrim"
							><Spinner size={20} label="Loading photo" /></span
						>
					{/if}
				{/if}
			</div>
		{/key}

		{#if index > 0}
			<button
				class={[round, nav, idleBg, 'left-4', !controlsVisible && 'opacity-0 focus-visible:opacity-100']}
				onclick={() => go(-1)}
				aria-label="Previous"
				title="Previous"
			>
				<Icon name="chevron-left" size={24} />
			</button>
		{/if}
		{#if index < assets.length - 1}
			<button
				class={[round, nav, idleBg, 'right-4', !controlsVisible && 'opacity-0 focus-visible:opacity-100']}
				onclick={() => go(1)}
				aria-label="Next"
				title="Next"
			>
				<Icon name="chevron-right" size={24} />
			</button>
		{/if}
	</div>

	{#if detailsOpen}
		<!-- Phones: a sheet in the third row, under the photo (both sized from the same dvh). -->
		<aside
			class="col-1 row-3 overflow-auto bg-scrim-panel p-6 max-md:rounded-t-xl md:col-2 md:row-2"
			aria-label="Details"
		>
			<h2 class="mb-4 text-md tracking-normal">Details</h2>
			{#await info}
				<Spinner size={20} label="Loading details" />
			{:then info}
				{@const rows = info ? rowsFor(info) : []}
				{#if rows.length === 0}
					<p class="text-sm text-on-scrim-muted">No details for this item.</p>
				{:else}
					<dl class="grid gap-y-1 text-sm">
						{#each rows as [k, v] (k)}
							<dt class="text-on-scrim-muted">{k}</dt>
							<dd class="mb-3 wrap-anywhere">{v}</dd>
						{/each}
					</dl>
				{/if}
			{:catch}
				<p class="text-sm text-on-scrim-muted">Details couldn't be loaded.</p>
			{/await}
		</aside>
	{/if}
</div>

<style>
	.lightbox {
		grid-template-rows: var(--topbar-h) 1fr;
		grid-template-columns: 1fr;
		animation: fade var(--duration-slow) var(--ease-out);
	}

	@media (min-width: 768px) {
		.lightbox.details {
			grid-template-columns: 1fr 320px;
		}
	}

	/* Phones: with details open, the photo keeps the top 40% of the screen and the sheet takes the rest. */
	@media (max-width: 767px) {
		.lightbox.details {
			grid-template-rows: var(--topbar-h) calc(40dvh - var(--topbar-h)) 1fr;
		}
	}

	/* Two durations: the hover colour is quick, hiding the arrows is a fade. */
	.round {
		transition:
			background-color var(--duration-fast) var(--ease-out),
			opacity var(--duration-base) var(--ease-out);
	}

	.stage {
		-webkit-touch-callout: none;
	}

	/* One definite cell, so the photo's max-height: 100% means the frame's height. */
	.media {
		grid-template: minmax(0, 1fr) / minmax(0, 1fr);
		animation: fade var(--duration-base) var(--ease-out);
	}

	.media > :global(*) {
		grid-area: 1 / 1;
	}

	.playing .media {
		animation-duration: var(--duration-gentle);
		animation-timing-function: var(--ease-in-out);
	}

	.slide-progress {
		animation: slide-fill var(--slide) linear forwards;
	}

	@keyframes slide-fill {
		from {
			transform: scaleX(0);
		}
	}

	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>

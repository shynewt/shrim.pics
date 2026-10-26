<script lang="ts">
	import { StreamError, importShareKey, keyFromFragment, type Manifest } from '@shrim/protocol';
	import { Button, Dialog, EmptyState, Icon, Logo, plural } from '@shrim/ui';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { MediaQuery } from 'svelte/reactivity';
	import { page } from '$app/state';
	import { AgentFailure, RelayFailure, ShareClient } from '#lib/viewer/client.ts';
	import DownloadAll from '#lib/viewer/DownloadAll.svelte';
	import Grid from '#lib/viewer/Grid.svelte';
	import { albumRange } from '#lib/viewer/groups.ts';
	import Lightbox from '#lib/viewer/Lightbox.svelte';
	import { Media } from '#lib/viewer/media.svelte.ts';
	import Upload from '#lib/viewer/Upload.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Problem = 'noKey' | 'badKey' | 'invalid' | 'expired' | 'disabled' | 'unavailable' | 'offline' | 'unsupported';

	const PROBLEMS: Record<
		Problem,
		{
			icon: 'link' | 'key-round' | 'clock' | 'ban' | 'cloud-off' | 'circle-alert';
			title: string;
			body: string;
			retry?: boolean;
		}
	> = {
		noKey: {
			icon: 'key-round',
			title: 'This link is incomplete',
			body: 'The end of the link, after the #, is missing. Ask the person who shared it to send the whole link again.'
		},
		badKey: {
			icon: 'key-round',
			title: "This link can't be opened",
			body: 'Part of the link may have been cut off. Ask the person who shared it to send the whole link again.'
		},
		invalid: {
			icon: 'link',
			title: "This link doesn't work",
			body: 'Check that you copied the whole link, or ask the person who shared it for a new one.'
		},
		expired: { icon: 'clock', title: 'This link has expired', body: 'Ask the person who shared it for a new link.' },
		disabled: {
			icon: 'ban',
			title: 'This link is no longer available',
			body: 'The person who shared it has turned it off.'
		},
		unavailable: {
			icon: 'cloud-off',
			title: "This album isn't available right now",
			body: 'Try again later.',
			retry: true
		},
		offline: {
			icon: 'cloud-off',
			title: "The owner's server is offline right now",
			body: "The album will open when it's back. Try again in a few minutes.",
			retry: true
		},
		unsupported: {
			icon: 'circle-alert',
			title: "Your browser can't open this album",
			body: 'Try a recent version of Firefox, Chrome, Safari or Edge.'
		}
	};

	let problem = $state<Problem | null>(null);
	let manifest = $state.raw<Manifest | null>(null);
	let slow = $state(false);
	let client = $state.raw<ShareClient | null>(null);
	let media = $state.raw<Media | null>(null);
	let retrying = $state(false);
	let descOpen = $state(false);
	let descClamped = $state(false);
	let headerVisible = $state(true);
	let uploadOpen = $state(false);
	let downloadOpen = $state(false);
	// bind:this assigns it, so the compiler wants it reactive (non_reactive_update otherwise).
	let uploader: Upload | undefined = $state();
	let dragDepth = $state(0);

	const lightbox = $derived(page.state.lightbox);
	const lightboxOpen = $derived(lightbox !== undefined && !!manifest?.assets[lightbox] && !!media && !!client);
	const phone = new MediaQuery('(max-width: 479px)');
	const range = $derived(manifest ? albumRange(manifest.assets) : '');
	const canSlideshow = $derived(!!manifest?.assets.some((a) => !a.video));
	const canDownloadAll = $derived(!!manifest?.allowDownload && (manifest?.assets.length ?? 0) > 1);
	/** Three labelled buttons don't fit a phone; Slideshow and Download all then show just their icons. */
	const compactActions = $derived(phone.current && canSlideshow && canDownloadAll && !!manifest?.allowUpload);
	const title = $derived(manifest?.title || 'Shared photos');
	const counts = $derived.by(() => {
		if (!manifest) return '';
		const videos = manifest.assets.filter((a) => a.video).length;
		const photos = manifest.assets.length - videos;
		return [photos && plural(photos, 'photo', 'photos'), videos && plural(videos, 'video', 'videos')]
			.filter(Boolean)
			.join(', ');
	});

	function problemFrom(e: unknown): Problem {
		if (e instanceof StreamError) return 'badKey';
		if (e instanceof RelayFailure) {
			switch (e.code) {
				case 'bad_request':
					return 'badKey';
				case 'not_found':
					return 'invalid';
				case 'gone':
					return 'disabled';
				case 'inactive':
					return 'unavailable';
				default:
					return 'offline';
			}
		}
		if (e instanceof AgentFailure) return e.head.error === 'link_gone' ? 'disabled' : 'offline';
		return 'offline';
	}

	async function loadManifest() {
		if (!client) return;
		try {
			manifest = await client.json<Manifest>({ op: 'manifest' });
			problem = null;
		} catch (e) {
			problem = problemFrom(e);
		}
	}

	async function start() {
		const fromServer: Record<string, Problem> = {
			invalid: 'invalid',
			expired: 'expired',
			disabled: 'disabled',
			unavailable: 'unavailable',
			offline: 'offline'
		};
		if (data.status !== 'live') {
			problem = fromServer[data.status];
			return;
		}
		if (!window.crypto?.subtle || !window.ReadableStream) {
			problem = 'unsupported';
			return;
		}
		// Read the key once. Never write to location.hash.
		const raw = keyFromFragment(window.location.hash);
		if (!raw) {
			problem = 'noKey';
			return;
		}
		const key = await importShareKey(raw);
		client = new ShareClient(data.id, key);
		media = new Media(client);
		const timer = setTimeout(() => (slow = true), 8000);
		await loadManifest();
		clearTimeout(timer);
	}

	async function retry() {
		retrying = true;
		if (!client) {
			problem = null;
			// The relay may know better now (agent back online).
			window.location.reload();
			return;
		}
		await loadManifest();
		retrying = false;
	}

	onMount(() => {
		void start();
		return () => media?.dispose();
	});

	/** Shows the mini bar once the album header has scrolled up out of view. */
	function watchHeader(node: HTMLElement) {
		const io = new IntersectionObserver(([e]) => (headerVisible = e.isIntersecting || e.boundingClientRect.top > 0));
		io.observe(node);
		return () => io.disconnect();
	}

	function openAt(index: number, slideshow = false) {
		void goto(window.location.href, { shallow: true, state: { lightbox: index, slideshow } });
	}

	function moveTo(index: number) {
		void goto(window.location.href, {
			shallow: true,
			replace: true,
			state: { lightbox: index, slideshow: page.state.slideshow }
		});
	}

	function startSlideshow() {
		const first = manifest?.assets.findIndex((a) => !a.video) ?? -1;
		if (first >= 0) openAt(first, true);
	}

	/** Hands the full link to the report form without putting the key in a URL. */
	function report() {
		sessionStorage.setItem('shrim.report', window.location.href);
	}

	function closeLightbox() {
		history.back();
	}

	/** Notices when the description is cut off, to offer "Show more". */
	function clamp(node: HTMLElement) {
		const ro = new ResizeObserver(() => (descClamped = node.scrollHeight > node.clientHeight + 1));
		ro.observe(node);
		return () => ro.disconnect();
	}

	const footerLine = 'inline-flex items-center justify-center gap-1.5';
	const footerLink = 'inline-flex items-center gap-2 text-subtle transition-colors hover:text-text';

	const canDrop = $derived(!!manifest?.allowUpload && lightbox === undefined && !uploadOpen);
</script>

<svelte:head>
	<title>{manifest ? `${title} – shrim.pics` : 'Shared album – shrim.pics'}</title>
	<meta name="robots" content="noindex" />
	<meta name="referrer" content="no-referrer" />
	<meta name="theme-color" content="#F6F7F8" media="(prefers-color-scheme: light)" />
	<meta name="theme-color" content="#0F1417" media="(prefers-color-scheme: dark)" />
</svelte:head>

<svelte:window
	onhashchange={() => window.location.reload()}
	ondragenter={(e) => {
		if (canDrop && e.dataTransfer?.types.includes('Files')) {
			e.preventDefault();
			dragDepth++;
		}
	}}
	ondragover={(e) => canDrop && e.preventDefault()}
	ondragleave={() => (dragDepth = Math.max(0, dragDepth - 1))}
	ondrop={(e) => {
		if (!canDrop) return;
		e.preventDefault();
		dragDepth = 0;
		if (e.dataTransfer?.files.length) {
			uploader?.addFiles(e.dataTransfer.files);
			uploadOpen = true;
		}
	}}
/>

{#if problem}
	<div class="flex min-h-dvh flex-col">
		<main class="state grid flex-1 place-items-center px-(--gutter) py-6">
			<EmptyState icon={PROBLEMS[problem].icon} title={PROBLEMS[problem].title} body={PROBLEMS[problem].body}>
				{#snippet action()}
					{#if PROBLEMS[problem!].retry}
						<Button icon="refresh-cw" loading={retrying} onclick={retry}>Try again</Button>
					{/if}
				{/snippet}
			</EmptyState>
		</main>
		{@render brand()}
	</div>
{:else if !manifest}
	<div class="flex min-h-dvh flex-col">
		<main class="state grid flex-1 place-items-center px-(--gutter) py-6">
			<EmptyState
				spinner
				body={slow ? "Still opening… The owner's server can take a moment to respond." : 'Opening album…'}
			/>
		</main>
		{@render brand()}
	</div>
{:else}
	<!-- Always in the page so it can fade both ways; hidden and inert until the header is gone. -->
	<div
		class={[
			'mini fixed inset-x-0 top-0 z-topbar flex h-12 items-center justify-between gap-4 border-b px-(--gutter) shadow-sm',
			{ shown: !headerVisible }
		]}
		inert={headerVisible || lightboxOpen}
	>
		<span class="min-w-0 truncate text-sm font-semibold">{title}</span>
		<div class="flex items-center gap-2">
			{#if canSlideshow}
				<Button size="sm" variant="ghost" icon="play" iconOnly label="Play slideshow" onclick={startSlideshow} />
			{/if}
			{#if manifest.allowUpload}
				<Button size="sm" icon="upload" onclick={() => (uploadOpen = true)}>Add photos</Button>
			{/if}
		</div>
	</div>

	<main class="mx-auto max-w-viewer px-(--gutter)" inert={lightboxOpen}>
		<header
			class="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 pt-8 pb-6 md:flex-nowrap md:pt-12"
			{@attach watchHeader}
		>
			<div class="min-w-0">
				<!-- eslint-disable-next-line better-tailwindcss/no-restricted-classes -- one-off measure for the album title -->
				<h1 class="max-w-[30ch] text-2xl md:text-3xl md:tracking-tighter">{title}</h1>
				{#if manifest.description}
					<p
						class={[
							'mt-2 max-w-measure whitespace-pre-line text-muted',
							descOpen ? 'block overflow-hidden' : 'line-clamp-4'
						]}
						{@attach clamp}
					>
						{manifest.description}
					</p>
					{#if descClamped || descOpen}
						<button class="mt-1 text-sm font-medium text-text underline-link" onclick={() => (descOpen = !descOpen)}
							>{descOpen ? 'Show less' : 'Show more'}</button
						>
					{/if}
				{/if}
				{#if counts}<p class="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-sm text-subtle tabular">
						<span>{counts}</span>{#if range}<span>{range}</span>{/if}
					</p>{/if}
			</div>
			{#if manifest.assets.length}
				<div class="header-actions flex min-w-0 flex-wrap gap-2 md:flex-none">
					{#if canSlideshow}
						<Button variant="ghost" icon="play" iconOnly={compactActions} label="Slideshow" onclick={startSlideshow}
							>Slideshow</Button
						>
					{/if}
					{#if canDownloadAll}
						<Button
							variant="ghost"
							icon="download"
							iconOnly={compactActions}
							label="Download all"
							onclick={() => (downloadOpen = true)}>Download all</Button
						>
					{/if}
					{#if manifest.allowUpload}
						<Button icon="upload" onclick={() => (uploadOpen = true)}>Add photos</Button>
					{/if}
				</div>
			{/if}
		</header>

		{#if manifest.assets.length === 0}
			<EmptyState
				mascot
				title="No photos yet"
				body={manifest.allowUpload ? 'Be the first to add some.' : 'Check back later.'}
			>
				{#snippet action()}
					{#if manifest!.allowUpload}
						<Button variant="primary" icon="upload" onclick={() => (uploadOpen = true)}>Add photos</Button>
					{/if}
				{/snippet}
			</EmptyState>
		{:else}
			<div class="max-xs:-mx-3"><Grid assets={manifest.assets} {media} onopen={(i) => openAt(i)} /></div>
		{/if}

		<footer class="grid gap-2 pt-12 pb-8 text-center text-xs text-subtle">
			<p class={footerLine}><Icon name="lock" size={12} />Encrypted end to end. shrim.pics can't see these photos.</p>
			<p class={footerLine}><a class={['plain', footerLink]} href="/"><Logo size={16} />Shared with shrim.pics</a></p>
			{#if data.demo}
				<p class={footerLine}>An example album of public domain photos.</p>
			{:else}
				<p class={footerLine}><a class={footerLink} href="/report" onclick={report}>Report this album</a></p>
			{/if}
		</footer>
	</main>

	{#if lightboxOpen && lightbox !== undefined && media && client}
		<Lightbox
			{manifest}
			index={lightbox}
			{media}
			{client}
			autoplay={!!page.state.slideshow}
			onnavigate={moveTo}
			onclose={closeLightbox}
		/>
	{/if}

	{#if client && canDownloadAll}
		<DownloadAll bind:open={downloadOpen} {manifest} {client} />
	{/if}

	{#if client && manifest.allowUpload}
		{#if data.demo}
			<!-- The example album shows "Add photos" like any album that takes uploads, then explains. -->
			<Dialog bind:open={uploadOpen} title="Add photos to {title}">
				<p>This is an example album, so uploads are off. Your friends can add photos to your albums.</p>
				{#snippet footer()}
					<Button variant="primary" onclick={() => (uploadOpen = false)}>Close</Button>
				{/snippet}
			</Dialog>
		{:else}
			<Upload bind:this={uploader} bind:open={uploadOpen} {client} album={title} onadded={loadManifest} />
		{/if}
	{/if}

	{#if dragDepth > 0 && canDrop}
		<div
			class="pointer-events-none fixed inset-0 z-dropzone grid place-items-center bg-overlay before:absolute before:inset-4 before:rounded-lg before:border-drop before:border-accent"
			aria-hidden="true"
		>
			<span class="rounded-lg bg-surface px-5 py-3 font-medium">Drop to add to {title}</span>
		</div>
	{/if}
{/if}

{#snippet brand()}
	<footer class="p-6 text-center text-xs text-subtle">
		<a class={['plain', footerLink]} href="/"><Logo size={16} />Shared with shrim.pics</a>
	</footer>
{/snippet}

<style>
	/* The full-page states set their message larger than EmptyState's default. */
	.state :global(.empty) {
		max-width: 28rem;
	}

	.state :global(.empty h2) {
		font-size: var(--text-xl);
		line-height: var(--leading-xl);
		letter-spacing: var(--tracking-tight);
	}

	.state :global(.empty p) {
		font-size: var(--text-md);
		line-height: var(--leading-md);
		max-width: none;
	}

	/* The viewer's touch targets are 44 px or more. */
	@media (max-width: 767px) {
		.header-actions :global(.btn) {
			height: var(--control-h-lg);
		}

		.header-actions :global(.btn.icon-only) {
			width: var(--control-h-lg);
		}

		/* Left aligned under the title: a leading ghost button lines its icon up with the text. */
		.header-actions > :global(.btn.ghost:first-child) {
			margin-inline-start: calc(var(--space-4) * -1);
		}

		.header-actions > :global(.btn.ghost.icon-only:first-child) {
			margin-inline-start: calc((var(--control-h-lg) - var(--icon-md)) / -2);
		}
	}

	/* The mini bar fades in and out; `visibility` waits for the fade-out so it can't be reached once gone. */
	.mini {
		background: color-mix(in srgb, var(--color-bg) 92%, transparent);
		backdrop-filter: blur(12px);
		opacity: 0;
		visibility: hidden;
		transition:
			opacity var(--duration-base) var(--ease-out),
			visibility 0s linear var(--duration-base);
	}

	.mini.shown {
		opacity: 1;
		visibility: visible;
		transition: opacity var(--duration-base) var(--ease-out);
	}

	/* Phones: 40 px targets in the bar. */
	@media (max-width: 767px) {
		.mini :global(.btn) {
			height: var(--control-h-md);
		}

		.mini :global(.btn.icon-only) {
			width: var(--control-h-md);
		}
	}
</style>

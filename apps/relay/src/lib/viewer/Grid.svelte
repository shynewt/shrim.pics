<script lang="ts">
	import type { ManifestAsset } from '@shrim/protocol';
	import { Icon, formatDate, formatDuration } from '@shrim/ui';
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { thumbHashToDataURL } from 'thumbhash';
	import { groupByDate } from './groups.ts';
	import type { Media } from './media.svelte.ts';

	let {
		assets,
		media,
		onopen
	}: {
		assets: ManifestAsset[];
		media: Media | null;
		onopen: (index: number) => void;
	} = $props();

	let width = $state(0);
	let loaded = $state<Record<string, boolean>>({});
	let previews = $state<Record<string, string>>({});

	// Row height and gap are tokens that change at the md and lg breakpoints.
	const md = new MediaQuery('(min-width: 768px)');
	const lg = new MediaQuery('(min-width: 1024px)');
	const tokens = $derived.by(() => {
		void md.current;
		void lg.current;
		const cs = getComputedStyle(document.documentElement);
		return {
			rowH: parseFloat(cs.getPropertyValue('--grid-row-h')) || 200,
			gap: parseFloat(cs.getPropertyValue('--grid-gap')) || 4
		};
	});

	const groups = $derived(groupByDate(assets));

	interface Row {
		h: number;
		items: Array<{ index: number; asset: ManifestAsset; w: number }>;
	}

	function layout(items: Array<{ index: number; asset: ManifestAsset }>): Row[] {
		const out: Row[] = [];
		if (!width) return out;
		const { rowH, gap } = tokens;
		let row: Array<{ index: number; asset: ManifestAsset; a: number }> = [];
		let sum = 0;
		const flush = (h: number) => {
			out.push({ h, items: row.map((r) => ({ index: r.index, asset: r.asset, w: r.a * h })) });
			row = [];
			sum = 0;
		};
		for (const { index, asset } of items) {
			const a = Math.min(3, Math.max(0.5, asset.ratio || 1));
			row.push({ index, asset, a });
			sum += a;
			if (sum * rowH + gap * (row.length - 1) >= width) flush((width - gap * (row.length - 1)) / sum);
		}
		// A group's last row isn't stretched.
		if (row.length) flush(rowH);
		return out;
	}

	const laidOut = $derived(groups.map((g) => ({ ...g, rows: layout(g.items) })));

	/** Immich gives thumbhashes in plain base64. */
	function decodeHash(id: string, hash: string | undefined) {
		if (!hash || previews[id]) return;
		try {
			const bin = atob(hash);
			const bytes = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
			previews[id] = thumbHashToDataURL(bytes);
		} catch {
			// a broken hash just means no preview
		}
	}

	// Rows, not tiles, are watched: off-screen rows skip rendering (content-visibility), so their tiles never lay out.
	let observer: IntersectionObserver | null = null;
	const rowItems = new WeakMap<Element, Row['items']>();

	/** Re-attaches whenever the row's photos change (after a resize), so new ones load too. */
	function near(items: Row['items']) {
		return (node: HTMLElement) => {
			rowItems.set(node, items);
			observer ??= new IntersectionObserver(
				(entries) => {
					for (const e of entries) {
						if (!e.isIntersecting) continue;
						for (const { asset } of rowItems.get(e.target) ?? []) {
							decodeHash(asset.id, asset.thumbhash);
							if (media) void media.thumb(asset.id).catch(() => {});
						}
						observer?.unobserve(e.target);
					}
				},
				{ rootMargin: '1000px 0px' }
			);
			observer.observe(node);
			return () => observer?.unobserve(node);
		};
	}

	onMount(() => () => observer?.disconnect());

	function label(asset: ManifestAsset, index: number) {
		const what = asset.video ? 'Video' : 'Photo';
		const date = asset.takenAt ? `, ${formatDate(asset.takenAt)}` : '';
		return `${what} ${index + 1} of ${assets.length}${date}`;
	}
</script>

<div class="flex flex-col" bind:clientWidth={width}>
	{#each laidOut as group, g (group.key)}
		<section aria-label={group.label}>
			<h2 class={['px-3 pb-2 text-sm tracking-normal text-text xs:px-0', g === 0 ? 'pt-0' : 'pt-4 md:pt-6']}>
				{group.label}
			</h2>
			<div class="flex flex-col gap-(--grid-gap)">
				{#each group.rows as row (row.items[0].asset.id)}
					<div class="row flex gap-(--grid-gap)" style:height="{row.h}px" {@attach near(row.items)}>
						{#each row.items as { index, asset, w } (asset.id)}
							{@const url = media?.thumbs.get(asset.id)}
							<button
								class="tile relative h-full flex-none overflow-hidden rounded-tile bg-tile bg-cover bg-center"
								style:width="{w}px"
								style:background-image={previews[asset.id] ? `url(${previews[asset.id]})` : undefined}
								data-index={index}
								aria-label={label(asset, index)}
								onclick={() => onopen(index)}
							>
								{#if url}
									<img
										src={url}
										alt=""
										draggable="false"
										class={[
											'size-full object-cover transition-opacity duration-base select-none',
											loaded[asset.id] ? 'shown opacity-100' : 'opacity-0'
										]}
										onload={() => (loaded[asset.id] = true)}
									/>
								{/if}
								{#if asset.video}
									<span
										class="badge absolute bottom-2 left-2 inline-flex items-center gap-1 rounded-full bg-media-badge px-1.5 py-0.5 text-xs font-semibold text-on-media"
									>
										<Icon name="play" size={12} filled />
										{#if asset.duration}<span class="tabular">{formatDuration(asset.duration)}</span>{/if}
									</span>
								{/if}
							</button>
						{/each}
					</div>
				{/each}
			</div>
		</section>
	{/each}
</div>

<style>
	/* Big albums: rows off screen skip layout and paint. Each row's height is set inline, so nothing jumps. */
	.row {
		content-visibility: auto;
		contain-intrinsic-size: auto none;
	}

	.tile {
		transition: filter var(--duration-fast) var(--ease-out);
	}

	.tile:focus-visible {
		outline-offset: -2px;
		box-shadow: inset 0 0 0 4px var(--color-on-media);
	}

	@media (hover: hover) {
		.tile:hover {
			filter: brightness(0.94);
		}
	}

	/* Icon's own scoped stroke width would win over a utility: the play badge is a solid shape. */
	.badge :global(.icon) {
		stroke-width: 0;
	}
</style>

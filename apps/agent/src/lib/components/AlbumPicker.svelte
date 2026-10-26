<script lang="ts">
	import { Button, Icon, IconTile, Notice, plural } from '@shrim/ui';
	import { onMount } from 'svelte';
	import { applyAction, enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { createError } from '#lib/errors.ts';
	import { dateRange, type Album, type ReadyLink } from '#lib/types.ts';
	import LinkOptions from './LinkOptions.svelte';

	let {
		relayHost,
		relayUrl,
		oncreated,
		onpaste,
		onkeyproblem
	}: {
		relayHost: string;
		relayUrl: string;
		oncreated: (link: ReadyLink) => void;
		onpaste: () => void;
		/** The agent's own API key stopped working (SHRIM_AUTH=none): offer to replace it. */
		onkeyproblem?: () => void;
	} = $props();

	let albums = $state.raw<Album[] | null>(null);
	let loadError = $state<'key' | 'other' | null>(null);
	let query = $state('');
	let chosen = $state.raw<Album | null>(null);
	let busy = $state(false);
	let error = $state<string | null>(null);
	let planProblem = $state(false);

	const shown = $derived(albums?.filter((a) => a.name.toLowerCase().includes(query.trim().toLowerCase())) ?? []);

	async function load() {
		loadError = null;
		albums = null;
		try {
			const res = await fetch('/api/albums');
			const body = await res.json();
			if (res.ok) albums = body as Album[];
			else if (res.status === 401) await goto('/login?expired=1');
			else
				loadError =
					body.error === 'link_gone' || body.error === 'not_allowed' || body.error === 'no_key' ? 'key' : 'other';
		} catch {
			// Offline, or something in between answered with a page instead of JSON.
			loadError = 'other';
		}
	}

	onMount(load);
</script>

{#snippet meta(album: Album, more: boolean)}
	<span class="flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-subtle tabular">
		<span>{plural(album.count, 'item', 'items')}</span>
		{#if album.startDate}<span>{dateRange(album.startDate, album.endDate)}</span>{/if}
		{#if more && album.sharedBy}<span>Shared by {album.sharedBy}</span>{/if}
		{#if more && !album.canShare}<span>View only, can't share</span>{/if}
	</span>
{/snippet}

{#if !chosen}
	<div class="grid min-w-0 gap-4 text-text">
		{#if loadError === 'key'}
			{#if onkeyproblem}
				<Notice tone="warning">
					Immich no longer accepts the API key.
					{#snippet action()}<Button size="sm" onclick={onkeyproblem}>Update key</Button>{/snippet}
				</Notice>
			{:else}
				<Notice tone="warning">
					Immich didn't let you list your albums. Your API key may be missing album.read. Paste a link instead, or sign
					in again with another key.
				</Notice>
			{/if}
		{:else if loadError}
			<Notice tone="danger">
				Couldn't load your albums.
				{#snippet action()}<Button size="sm" onclick={load}>Try again</Button>{/snippet}
			</Notice>
		{:else if albums === null}
			<div class="grid gap-2" role="status">
				<span class="h-3 rounded-xs bg-tile"></span><span class="h-3 w-4/5 rounded-xs bg-tile"></span><span
					class="h-3 w-3/5 rounded-xs bg-tile"
				></span><span class="visually-hidden">Loading albums</span>
			</div>
		{:else if albums.length === 0}
			<p class="p-4 text-sm text-muted">No albums yet. Make an album in Immich first, then come back.</p>
		{:else}
			<label class="relative block font-regular">
				<Icon name="search" size={16} class="absolute top-1/2 left-3 -translate-y-1/2 text-subtle" />
				<span class="visually-hidden">Search albums</span>
				<input class="pl-10" type="search" placeholder="Search albums" bind:value={query} autocomplete="off" />
			</label>
			<!-- eslint-disable-next-line better-tailwindcss/no-restricted-classes -- one-off: half the screen -->
			<ul class="rounded-md border xs:max-h-[50dvh] xs:overflow-auto [&>li+li]:border-t" role="list">
				{#each shown as album (album.id)}
					<li>
						<button
							type="button"
							class="flex min-h-14 w-full items-center justify-between gap-3 px-3 py-2 text-left text-subtle transition-colors not-disabled:hover:bg-surface-sunken focus-visible:-outline-offset-2 disabled:cursor-default"
							onclick={() => (chosen = album)}
							disabled={!album.canShare}
							title={album.canShare ? undefined : `Only the album's owner and editors can share it`}
						>
							<IconTile icon={album.sharedBy ? 'users' : 'image'} />
							<span class="grid min-w-0 flex-1 gap-0.5">
								<span class={['font-medium', album.canShare ? 'text-text' : 'text-subtle']}>{album.name}</span>
								{@render meta(album, true)}
							</span>
							{#if album.canShare}<Icon name="chevron-right" size={16} />{/if}
						</button>
					</li>
				{:else}
					<li class="p-4 text-sm text-muted">No albums match “{query}”.</li>
				{/each}
			</ul>
		{/if}
		<div class="alt flex flex-wrap items-center justify-between gap-2 border-t bg-surface-sunken text-sm text-muted">
			<span>Album not in the list?</span>
			<Button variant="ghost" size="sm" icon="link" onclick={onpaste}>Paste a link</Button>
		</div>
	</div>
{:else}
	<form
		class="grid min-w-0 gap-4 text-text"
		method="POST"
		action="?/createFromAlbum"
		use:enhance={() => {
			busy = true;
			error = null;
			planProblem = false;
			return async ({ result }) => {
				busy = false;
				if (result.type === 'redirect') return applyAction(result);
				if (result.type === 'success' && result.data?.created) oncreated(result.data.created as ReadyLink);
				else if (result.type === 'failure') {
					planProblem = result.data?.error === 'plan';
					error = createError(result.data?.error, relayHost);
				} else error = createError(null, relayHost);
			};
		}}
	>
		<input type="hidden" name="albumId" value={chosen.id} />
		<div class="flex items-center gap-3 border-b pb-4">
			<button
				type="button"
				class="relative -ml-2 grid size-8 flex-none place-items-center rounded-sm text-muted transition-colors hover:bg-surface-sunken hover:text-text max-xs:touch-target"
				onclick={() => (chosen = null)}
				aria-label="Back to albums"
				title="Back to albums"
			>
				<Icon name="chevron-left" size={20} />
			</button>
			<IconTile icon="image" />
			<span class="grid min-w-0">
				<span class="font-medium text-text">{chosen.name}</span>
				{@render meta(chosen, false)}
			</span>
		</div>

		<LinkOptions
			permissions={{ allowUpload: false, allowDownload: true, showMetadata: true }}
			editable
			name={chosen.name}
		/>

		{#if error}
			<Notice tone="danger">
				{error}
				{#if planProblem}<a href="{relayUrl}/dashboard#plan" target="_blank" rel="noreferrer"
						>Subscribe on {relayHost}</a
					>{/if}
			</Notice>
		{/if}
		<div class="flex justify-end">
			<Button type="submit" variant="primary" loading={busy}>{busy ? 'Creating…' : 'Create link'}</Button>
		</div>
	</form>
{/if}

<style>
	/* A footer band that reaches the dialog's edges, padded like the dialog itself. */
	.alt {
		margin: var(--space-2) calc(var(--dialog-pad-x, 0px) * -1) calc(var(--dialog-pad-bottom, 0px) * -1);
		padding: var(--space-4) var(--dialog-pad-x, 0px);
	}

	/* Ghost buttons hover with the band's own colour; lift them to the surface instead. */
	@media (hover: hover) {
		.alt :global(.btn.ghost:hover) {
			background: var(--color-surface);
		}
	}
</style>

<script lang="ts">
	import { Button, Field, Icon, Notice, Spinner, plural } from '@shrim/ui';
	import { enhance } from '$app/forms';
	import { createError } from '#lib/errors.ts';
	import type { ReadyLink } from '#lib/types.ts';
	import LinkOptions from './LinkOptions.svelte';

	let {
		relayHost,
		relayUrl,
		oncreated,
		onaddkey
	}: { relayHost: string; relayUrl: string; oncreated: (link: ReadyLink) => void; onaddkey?: () => void } = $props();

	interface Resolved {
		albumName: string | null;
		count: number;
		allowUpload: boolean;
		allowDownload: boolean;
		showMetadata: boolean;
	}

	let url = $state('');
	let resolving = $state(false);
	let resolved = $state.raw<Resolved | null>(null);
	let fieldError = $state<string | null>(null);
	let error = $state<string | null>(null);
	let planProblem = $state(false);
	let busy = $state(false);
	let name = $state('');
	let lastResolved = '';
	// Only the newest lookup may set the result: an older, slower answer is dropped.
	let lookup = 0;
	const uid = $props.id();

	async function resolve() {
		const value = url.trim();
		if (!value || value === lastResolved) return;
		lastResolved = value;
		const mine = ++lookup;
		resolved = null;
		fieldError = null;
		resolving = true;
		try {
			const res = await fetch('/api/resolve', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ url: value })
			});
			const body = await res.json();
			if (mine !== lookup) return;
			if (res.ok) {
				resolved = body as Resolved;
				if (!name) name = resolved.albumName ?? '';
				// LinkOptions owns the name field from here on.
			} else fieldError = createError(body.error, relayHost);
		} catch {
			if (mine === lookup) fieldError = createError('immichDown', relayHost);
		} finally {
			if (mine === lookup) resolving = false;
		}
	}
</script>

<form
	class="grid gap-5 text-text"
	method="POST"
	action="?/create"
	use:enhance={() => {
		busy = true;
		error = null;
		planProblem = false;
		return async ({ result }) => {
			busy = false;
			if (result.type === 'success' && result.data?.created) oncreated(result.data.created as ReadyLink);
			else if (result.type === 'failure') {
				const code = result.data?.error;
				if (code === 'empty' || code === 'format' || code === 'notFound' || code === 'password') {
					fieldError = createError(code, relayHost);
				} else {
					planProblem = code === 'plan';
					error = createError(code, relayHost);
				}
			} else error = createError(null, relayHost);
		};
	}}
>
	<Field id="{uid}-url" label="Immich share link" error={fieldError}>
		{#snippet help()}In Immich, open the album, choose Share, then Create link. Paste that link here.{/snippet}
		{#snippet children({ describedby, invalid })}
			<div class="relative">
				<input
					id="{uid}-url"
					name="url"
					type="url"
					inputmode="url"
					autocomplete="off"
					spellcheck="false"
					class="mono"
					placeholder="https://photos.example.com/share/…"
					bind:value={url}
					onblur={resolve}
					onpaste={() => setTimeout(() => void resolve(), 0)}
					aria-describedby={describedby}
					aria-invalid={invalid || undefined}
				/>
				{#if resolving}<span class="absolute top-1/2 right-3 flex -translate-y-1/2 text-muted"
						><Spinner size={16} label="Checking the link" /></span
					>{/if}
			</div>
		{/snippet}
	</Field>

	{#if resolved}
		<div class="-mt-2 flex items-center gap-3 rounded-md border bg-surface-sunken p-3" role="status">
			<Icon name="image" size={20} class="text-muted" />
			<div class="grid min-w-0 flex-1">
				<span class="truncate font-medium">{resolved.albumName ?? 'Selected photos'}</span>
				<span class="text-sm text-muted tabular">{plural(resolved.count, 'item', 'items')}</span>
			</div>
			<span class="inline-flex items-center gap-1 text-sm font-medium text-success"
				><Icon name="check" size={16} />Found</span
			>
		</div>
	{/if}

	<LinkOptions permissions={resolved} editable={false} {name} />

	{#if error}
		<Notice tone="danger">
			{error}
			{#if planProblem}<a href="{relayUrl}/dashboard#plan" target="_blank" rel="noreferrer">Subscribe on {relayHost}</a
				>{/if}
		</Notice>
	{/if}

	<div class="flex flex-wrap items-center justify-end gap-3">
		{#if onaddkey}
			<div class="mr-auto flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted">
				<span>Rather pick from a list?</span>
				<Button variant="ghost" size="sm" icon="key-round" onclick={onaddkey}>Add an API key</Button>
			</div>
		{/if}
		<Button type="submit" variant="primary" loading={busy}>{busy ? 'Creating…' : 'Create link'}</Button>
	</div>
</form>

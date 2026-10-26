<script lang="ts">
	import { Button, CopyButton, CopyFailed, EasyId, Icon, MetaList, QrCode, formatDate } from '@shrim/ui';
	import { onMount } from 'svelte';
	import { whatFriendsCanDo, type ReadyLink } from '#lib/types.ts';

	let { link, onrevoke }: { link: ReadyLink; onrevoke?: () => void } = $props();

	let canShare = $state(false);
	let showQr = $state(false);
	let small = $state(false);
	let copyFailed = $state(false);
	let shareFailed = $state(false);
	let field: HTMLSpanElement | null = null;

	const shown = $derived(link.link.replace(/^https?:\/\//, ''));
	const hash = $derived(shown.indexOf('#'));
	const meta = $derived([
		...whatFriendsCanDo(link),
		{ text: link.expiresAt ? `Expires ${formatDate(link.expiresAt)}` : 'No expiry', icon: 'clock' as const }
	]);

	onMount(() => {
		canShare = window.isSecureContext && typeof navigator.share === 'function';
		// Phones are already where the link gets sent: the QR code waits behind a button.
		small = !window.matchMedia('(min-width: 480px)').matches;
		showQr = !small;
	});

	function selectLink() {
		if (!field) return;
		const range = document.createRange();
		range.selectNodeContents(field);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	}

	async function share() {
		shareFailed = false;
		try {
			// No `text`: some apps glue it to the URL and break the key.
			await navigator.share({ title: link.label, url: link.link });
		} catch (e) {
			if ((e as DOMException).name !== 'AbortError') shareFailed = true;
		}
	}
</script>

<div class="ready grid min-w-0 gap-5 text-text">
	<div class="flex min-w-0 items-center gap-3">
		<EasyId id={link.id} />
		<div class="grid min-w-0 gap-0.5">
			<p class="truncate font-semibold">{link.label}</p>
			<MetaList items={meta} />
		</div>
	</div>

	<div class="grid gap-2">
		<!-- eslint-disable better-tailwindcss/no-restricted-classes -- one-off phone grid: Open sized to fit, Copy takes the rest -->
		<div
			class="bar flex min-w-0 items-center gap-2 rounded-md border bg-surface-sunken max-xs:grid max-xs:grid-cols-[auto_1fr] max-xs:p-2 xs:p-1 xs:pl-3"
		>
			<!-- eslint-enable better-tailwindcss/no-restricted-classes -->
			<span
				class="field min-w-0 flex-1 truncate mono text-sm select-all max-xs:col-span-full max-xs:p-1"
				title={link.link}
				{@attach (el) => {
					field = el;
					return () => (field = null);
				}}
				>{#if hash >= 0}{shown.slice(0, hash)}<span class="text-subtle">{shown.slice(hash)}</span
					>{:else}{shown}{/if}</span
			>
			<Button
				variant="ghost"
				size="md"
				iconOnly
				icon="external-link"
				label="Open link"
				href={link.link}
				target="_blank"
				rel="noreferrer"
			/>
			<CopyButton
				value={link.link}
				variant="primary"
				size="md"
				onfail={() => {
					copyFailed = true;
					selectLink();
				}}
			/>
		</div>
		{#if copyFailed}
			<CopyFailed message="Couldn't copy. The link is selected: copy it from there." />
		{/if}
		<p class="flex items-start gap-1.5 text-sm text-muted">
			<Icon name="lock" size={16} class="mt-0.5" />
			<span>Anyone with this link can see the album. The part after # is the key, so send it whole.</span>
		</p>
	</div>

	{#if canShare || small}
		<div class="flex flex-wrap gap-2">
			{#if canShare}<Button size="sm" icon="share-2" onclick={share}>Share…</Button>{/if}
			{#if small}
				<Button size="sm" variant="ghost" icon="qr-code" aria-expanded={showQr} onclick={() => (showQr = !showQr)}
					>{showQr ? 'Hide QR code' : 'QR code'}</Button
				>
			{/if}
		</div>
	{/if}
	{#if shareFailed}
		<CopyFailed message="Couldn't open sharing. Copy the link instead." />
	{/if}

	{#if showQr}
		<div class="flex items-center gap-4 rounded-lg bg-surface-sunken p-3 max-xs:flex-col max-xs:text-center">
			<QrCode value={link.link} size={112} />
			<div class="grid gap-1">
				<p class="text-sm font-medium">Send it from your phone</p>
				<p class="text-sm text-muted">
					Scan this with your phone's camera to open the link there, then share it from any app.
				</p>
			</div>
		</div>
	{/if}

	{#if onrevoke}
		<div class="border-t pt-4">
			<Button variant="ghost-danger" size="sm" icon="trash-2" onclick={onrevoke}>Revoke link</Button>
		</div>
	{/if}
</div>

<style>
	@media (max-width: 479px) {
		.bar > :global(.btn) {
			height: var(--control-h-lg);
		}
	}
</style>

<script lang="ts">
	import { Button, IconTile, TopBar } from '@shrim/ui';
	import { enhance } from '$app/forms';
	import FormError from '#lib/components/FormError.svelte';
	import Page from '#lib/components/Page.svelte';
	import type { PageProps, SubmitFunction } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state<'confirm' | 'send' | null>(null);
	/** Opened from the email, and the link hasn't been turned down. */
	const fromLink = $derived(!!data.token && form?.error !== 'invalid' && !form?.sent);
	/** Long addresses wrap at the @ first. */
	const at = $derived(Math.max(data.email.lastIndexOf('@'), 0));

	const submit =
		(which: 'confirm' | 'send'): SubmitFunction =>
		() => {
			busy = which;
			return async ({ update }) => {
				await update({ reset: false });
				busy = null;
			};
		};
</script>

<svelte:head><title>Confirm your address – shrim.pics</title></svelte:head>

{#snippet address()}
	<strong class="wrap-break-word">{data.email.slice(0, at)}<wbr />{data.email.slice(at)}</strong>
{/snippet}

<Page width="narrow">
	{#snippet topbar()}<TopBar />{/snippet}

	<div class="mb-8 grid justify-items-center gap-1 text-center">
		<IconTile icon="shield" tone="accent" size="lg" />
		<h1 class="mt-4">Confirm your address</h1>
	</div>

	<div class="grid gap-5 rounded-lg border bg-surface p-4 xs:p-6">
		{#if fromLink}
			<p>Confirm that {@render address()} is yours to open the operator pages.</p>
			<form method="POST" action="?/confirm" use:enhance={submit('confirm')}>
				<input type="hidden" name="token" value={data.token} />
				<Button type="submit" variant="primary" size="lg" full loading={busy === 'confirm'}>
					{busy === 'confirm' ? 'Confirming…' : 'Confirm'}
				</Button>
			</form>
		{:else}
			{#if form?.error === 'invalid'}
				<FormError>This link has expired, or it's for another account. Send a new one.</FormError>
			{:else if form?.error === 'rate'}
				<FormError>Too many links asked for. Wait a few minutes and try again.</FormError>
			{/if}
			<p role="status">
				{#if !data.mailed}
					This server can't send emails, so the link is in its log. Open it in this browser.
				{:else if form?.sent}
					We've sent a new link to {@render address()}. Open it in this browser.
				{:else}
					The operator pages open once you confirm the address is yours. We've sent a link to {@render address()}. Open
					it in this browser.
				{/if}
			</p>
			<form method="POST" action="?/send" use:enhance={submit('send')}>
				<Button type="submit" size="lg" full loading={busy === 'send'}>
					{busy === 'send' ? 'Sending…' : 'Send a new link'}
				</Button>
			</form>
		{/if}
	</div>
	<p class="mt-6 text-center text-xs text-subtle">
		The link works for 24 hours, in the browser where you're signed in.
	</p>
</Page>

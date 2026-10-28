<script lang="ts">
	import { Button, Field, IconTile, SecretInput, toast, TopBar } from '@shrim/ui';
	import { enhance } from '$app/forms';
	import BrandMark from '#lib/components/BrandMark.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import Page from '#lib/components/Page.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	const expired = $derived(!data.email || form?.error === 'invalid');
</script>

<svelte:head><title>{expired ? 'Link expired' : 'Choose a new password'} – shrim.pics</title></svelte:head>

<Page width="narrow">
	{#snippet topbar()}<TopBar />{/snippet}

	{#if expired}
		<div class="mb-8 grid justify-items-center gap-1 text-center">
			<IconTile icon="clock" tone="warning" size="lg" />
			<h1 class="mt-4">This link has expired</h1>
		</div>
		<div class="grid gap-5 rounded-lg border bg-surface p-4 xs:p-6">
			<p>
				Reset links work once, for an hour. If you asked more than once, only the newest email works. Ask for a new link
				to try again.
			</p>
			<Button href="/forgot" variant="primary" size="lg" full>Get a new link</Button>
		</div>
	{:else}
		<div class="mb-8 grid justify-items-center gap-1 text-center">
			<BrandMark size="lg" />
			<h1 class="mt-4">Choose a new password</h1>
			<p class="mt-2 text-sm wrap-anywhere text-muted">
				For <strong class="font-medium text-text">{data.email}</strong>
			</p>
		</div>

		<div class="rounded-lg border bg-surface p-4 xs:p-6">
			<form
				class="grid gap-5"
				method="POST"
				use:enhance={() => {
					busy = true;
					return async ({ result, update }) => {
						if (result.type === 'redirect') toast('Password changed');
						await update({ reset: false });
						busy = false;
					};
				}}
			>
				{#if form?.error === 'rate'}
					<FormError>Too many attempts. Wait a minute and try again.</FormError>
				{/if}
				<input type="hidden" name="token" value={data.token} />
				<!-- Lets password managers save the new password for the right account. -->
				<div class="visually-hidden" aria-hidden="true">
					<input type="email" name="username" autocomplete="username" value={data.email} readonly tabindex="-1" />
				</div>
				<Field
					id="password"
					label="New password"
					help="At least 10 characters."
					error={form?.error === 'password' ? 'Use at least 10 characters.' : null}
				>
					{#snippet children({ describedby, invalid })}
						<SecretInput id="password" name="password" autocomplete="new-password" {describedby} {invalid} />
					{/snippet}
				</Field>
				<Button type="submit" variant="primary" size="lg" full loading={busy}>
					{busy ? 'Saving…' : 'Save new password'}
				</Button>
			</form>
		</div>
		<p class="mt-6 text-center text-xs text-subtle">This signs you out on every other device.</p>
	{/if}
</Page>

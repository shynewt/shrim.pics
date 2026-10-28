<script lang="ts">
	import { Button, Field, SecretInput, TopBar } from '@shrim/ui';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import BrandMark from '#lib/components/BrandMark.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import Page from '#lib/components/Page.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	const next = $derived(page.url.searchParams.get('next') ?? '');
	const signupHref = $derived(next ? `/signup?next=${encodeURIComponent(next)}` : '/signup');
	let busy = $state(false);
</script>

<svelte:head><title>Sign in – shrim.pics</title></svelte:head>

<Page width="narrow">
	{#snippet topbar()}<TopBar />{/snippet}

	<div class="mb-8 grid justify-items-center gap-1 text-center">
		<BrandMark size="lg" />
		<h1 class="mt-4">Sign in</h1>
		{#if next.startsWith('/connect')}<p class="mt-2 text-md">Sign in to connect your agent.</p>{/if}
		<p class="mt-2 text-sm text-muted">New here? <a href={signupHref}>Create an account</a></p>
	</div>

	<div class="rounded-lg border bg-surface p-4 xs:p-6">
		<form
			class="grid gap-5"
			method="POST"
			use:enhance={() => {
				busy = true;
				return async ({ update }) => {
					await update({ reset: false });
					busy = false;
				};
			}}
		>
			{#if form?.error === 'rate'}
				<FormError>Too many attempts. Wait a minute and try again.</FormError>
			{:else if form?.error === 'credentials'}
				<FormError>That email and password don't match. Check them and try again.</FormError>
			{/if}
			<Field id="email" label="Email">
				{#snippet children({ describedby })}
					<input
						id="email"
						name="email"
						type="email"
						autocomplete="email"
						required
						defaultValue={form?.email ?? ''}
						aria-describedby={describedby}
					/>
				{/snippet}
			</Field>
			<Field id="password" label="Password">
				{#snippet aside()}<a class="text-sm" href="/forgot">Forgot password?</a>{/snippet}
				{#snippet children({ describedby })}
					<SecretInput id="password" name="password" autocomplete="current-password" {describedby} />
				{/snippet}
			</Field>
			<Button type="submit" variant="primary" size="lg" full loading={busy}>
				{busy ? 'Signing in…' : 'Sign in'}
			</Button>
		</form>
	</div>
</Page>

<script lang="ts">
	import { Button, Field, TopBar } from '@shrim/ui';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import BrandMark from '#lib/components/BrandMark.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import Page from '#lib/components/Page.svelte';
	import PasswordInput from '#lib/components/PasswordInput.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	const next = $derived(page.url.searchParams.get('next') ?? '');
	const loginHref = $derived(next ? `/login?next=${encodeURIComponent(next)}` : '/login');
</script>

<svelte:head><title>Create your account – shrim.pics</title></svelte:head>

<Page width="narrow">
	{#snippet topbar()}<TopBar />{/snippet}

	<div class="mb-8 grid justify-items-center gap-1 text-center">
		<BrandMark size="lg" />
		<h1 class="mt-4">Create your account</h1>
		<p class="mt-2 text-sm text-muted">Already have one? <a href={loginHref}>Sign in</a></p>
	</div>

	<div class="rounded-lg border bg-surface p-4 xs:p-6">
		{#if data.closed}
			<FormError>This server isn't taking new accounts. Ask the person who runs it for access.</FormError>
		{:else}
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
				{:else if form?.error === 'taken'}
					<FormError>There's already an account with this email. <a href={loginHref}>Sign in</a> instead?</FormError>
				{/if}
				<Field
					id="email"
					label="Email"
					error={form?.error === 'email' ? 'Enter an email address like name@example.com.' : null}
				>
					{#snippet children({ describedby, invalid })}
						<input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							required
							defaultValue={form?.email ?? ''}
							aria-describedby={describedby}
							aria-invalid={invalid || undefined}
						/>
					{/snippet}
				</Field>
				<Field
					id="password"
					label="Password"
					help="At least 10 characters."
					error={form?.error === 'password' ? 'Use at least 10 characters.' : null}
				>
					{#snippet children({ describedby, invalid })}
						<PasswordInput id="password" name="password" autocomplete="new-password" {describedby} {invalid} />
					{/snippet}
				</Field>
				<Button type="submit" variant="primary" size="lg" full loading={busy}>
					{busy ? 'Creating account…' : 'Create account'}
				</Button>
			</form>
		{/if}
	</div>

	<p class="mt-6 text-center text-xs text-subtle [&_a]:text-inherit">
		By creating an account you agree to the <a href="/terms">Terms</a> and <a href="/privacy">Privacy policy</a>.
	</p>
</Page>

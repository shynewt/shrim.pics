<script lang="ts">
	import { Button, Field, IconTile, TopBar } from '@shrim/ui';
	import { enhance } from '$app/forms';
	import BrandMark from '#lib/components/BrandMark.svelte';
	import FormError from '#lib/components/FormError.svelte';
	import Page from '#lib/components/Page.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);
	const sent = $derived(form?.sent ? form.email : null);
	/** Long addresses wrap at the @ first. */
	const at = $derived(sent ? Math.max(sent.lastIndexOf('@'), 0) : 0);
	const canSend = $derived(data.mail && form?.error !== 'mail');
</script>

<svelte:head><title>Forgot your password – shrim.pics</title></svelte:head>

<Page width="narrow">
	{#snippet topbar()}<TopBar />{/snippet}

	{#if sent}
		<div class="mb-8 grid justify-items-center gap-1 text-center">
			<IconTile icon="mail" tone="accent" size="lg" />
			<h1 class="mt-4">Check your email</h1>
		</div>
		<div class="grid gap-5 rounded-lg border bg-surface p-4 xs:p-6" role="status">
			<p>
				If there's an account for <strong class="wrap-break-word">{sent.slice(0, at)}<wbr />{sent.slice(at)}</strong>,
				we've sent it a link to choose a new password. The link works for an hour.
			</p>
			<p class="text-sm text-muted">
				Nothing after a few minutes? Check your spam folder, or <a href="/forgot">try again</a>.
			</p>
			<Button href="/login" size="lg" full>Back to sign in</Button>
		</div>
	{:else}
		<div class="mb-8 grid justify-items-center gap-1 text-center">
			<BrandMark size="lg" />
			<h1 class="mt-4">Forgot your password?</h1>
			<p class="mt-2 text-sm text-muted">Remembered it? <a href="/login">Sign in</a></p>
		</div>

		<div class="rounded-lg border bg-surface p-4 xs:p-6">
			{#if !canSend}
				<FormError>
					This server can't send emails, so it can't send you a link. Ask the person who runs it to reset your password{#if data.support}:
						<a href="mailto:{data.support}">{data.support}</a>{/if}.
				</FormError>
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
						<FormError>Too many attempts. Wait a few minutes and try again.</FormError>
					{/if}
					<p class="text-sm text-muted">
						Enter the email you signed up with. We'll send you a link to choose a new password.
					</p>
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
					<Button type="submit" variant="primary" size="lg" full loading={busy}>
						{busy ? 'Sending…' : 'Send reset link'}
					</Button>
				</form>
			{/if}
		</div>
	{/if}
</Page>

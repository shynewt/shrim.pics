<script lang="ts">
	import { Button, EmptyState, Field, TopBar } from '@shrim/ui';
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import FormError from '#lib/components/FormError.svelte';
	import Page from '#lib/components/Page.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	let busy = $state(false);

	/** "Report this album" in the viewer leaves the full link here, never in a URL. */
	function prefill(input: HTMLInputElement) {
		const link = sessionStorage.getItem('shrim.report');
		if (link && !input.value) input.value = link;
		sessionStorage.removeItem('shrim.report');
	}
</script>

<svelte:head><title>Report a link – shrim.pics</title></svelte:head>

<Page>
	{#snippet topbar()}<TopBar width="content" />{/snippet}

	{#if form?.sent}
		<EmptyState
			icon="check"
			title="Thanks, we got your report"
			body="We'll look at it as soon as we can. If you left an email address, we may contact you."
		>
			{#snippet action()}<Button href="/">Back to shrim.pics</Button>{/snippet}
		</EmptyState>
	{:else}
		<h1 class="mb-2">Report a link</h1>
		<p class="mb-8 max-w-measure text-muted">
			We can't see what's in shared albums. Paste the whole link, including the part after the #. It lets us open that
			one album, like anyone the link was shared with, and nothing else.
		</p>

		<form
			class="grid gap-5 rounded-lg border bg-surface p-4 xs:p-6"
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
				<FormError>Too many reports from your connection. Try again later.</FormError>
			{/if}
			<Field
				id="link"
				label="Link"
				error={form?.error === 'link'
					? `This doesn't look like a link from ${page.url.host}. Paste the whole link.`
					: null}
			>
				{#snippet children({ describedby, invalid })}
					<input
						id="link"
						name="link"
						type="url"
						class="mono"
						required
						placeholder="https://{page.url.host}/s/…#…"
						defaultValue={form?.link ?? ''}
						{@attach prefill}
						aria-describedby={describedby}
						aria-invalid={invalid || undefined}
					/>
				{/snippet}
			</Field>
			<Field id="reason" label="What's wrong" error={form?.error === 'reason' ? 'Choose a reason.' : null}>
				{#snippet children({ describedby, invalid })}
					<select id="reason" name="reason" required aria-describedby={describedby} aria-invalid={invalid || undefined}>
						<option value="" disabled selected={!form?.reason}>Choose one</option>
						<option value="illegal" selected={form?.reason === 'illegal'}>Illegal content</option>
						<option value="consent" selected={form?.reason === 'consent'}
							>Photos of me, shared without my consent</option
						>
						<option value="spam" selected={form?.reason === 'spam'}>Spam or a scam</option>
						<option value="other" selected={form?.reason === 'other'}>Something else</option>
					</select>
				{/snippet}
			</Field>
			<Field id="details" label="Details" optional>
				{#snippet children({ describedby })}
					<textarea
						id="details"
						name="details"
						rows="4"
						aria-describedby={describedby}
						defaultValue={form?.details ?? ''}></textarea>
				{/snippet}
			</Field>
			<Field id="contact" label="Your email" optional help="Only if you'd like us to get back to you.">
				{#snippet children({ describedby })}
					<input
						id="contact"
						name="contact"
						type="email"
						autocomplete="email"
						aria-describedby={describedby}
						defaultValue={form?.contact ?? ''}
					/>
				{/snippet}
			</Field>
			<div>
				<Button type="submit" variant="primary" loading={busy}>{busy ? 'Sending…' : 'Send report'}</Button>
			</div>
		</form>
	{/if}
</Page>

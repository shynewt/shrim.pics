<script lang="ts">
	import { Button, CopyButton, Icon, Notice, TopBar } from '@shrim/ui';
	import { page } from '$app/state';
	import ApiKeyForm from '#lib/components/ApiKeyForm.svelte';
	import BrandMark from '#lib/components/BrandMark.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let ssoBusy = $state(false);

	const params = $derived(page.url.searchParams);
	const SSO_ERRORS: Record<string, string> = {
		expired: 'That sign-in took too long or was started elsewhere. Try again.',
		denied: 'The sign-in was cancelled. Try again, or use an API key.',
		failed:
			"Immich didn't accept that sign-in. Your Immich account may not be linked to it yet: sign in to Immich itself once, or use an API key.",
		immichDown: "Can't reach Immich right now. Try again in a moment.",
		unavailable: "Immich couldn't start the sign-in. Try again, or use an API key.",
		unexpected: 'The agent hit a problem while signing you in. Its logs say what; try again after a look.'
	};
	const ssoError = $derived(SSO_ERRORS[params.get('sso') ?? ''] ?? null);
	const forgot = $derived(params.get('forgot'));
</script>

<svelte:head><title>Sign in – shrim.pics agent</title></svelte:head>

<TopBar width="content" suffix="agent" />

<!-- The narrow column plus the gutters (content-box). -->
<main class="mx-auto box-content grid max-w-narrow gap-5 px-(--gutter) py-16">
	<div class="mb-3 grid justify-items-center gap-1 text-center">
		<BrandMark size="lg" />
		<h1 class="mt-4">Sign in with Immich</h1>
		<p class="mt-2 text-sm text-muted">Use your own Immich account. You'll see your albums and your share links.</p>
	</div>

	{#if params.has('expired')}
		<Notice>Immich no longer accepts the key you signed in with. Sign in again to carry on.</Notice>
	{:else if forgot}
		<Notice tone="success">
			Signed out. This agent forgot your key. It's still in your Immich account as “{forgot}” if you want to delete it
			there.
		</Notice>
	{/if}
	{#if ssoError}
		<p class="flex items-start gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger" role="alert">
			<Icon name="circle-alert" size={16} class="mt-0.5" /><span>{ssoError}</span>
		</p>
	{/if}

	{#if data.sso}
		<Button
			href="/login/sso/start"
			data-sveltekit-reload
			variant="primary"
			size="lg"
			full
			icon="shield"
			loading={ssoBusy}
			onclick={() => (ssoBusy = true)}>{data.sso.label}</Button
		>
		<p class="flex items-center gap-3 text-sm text-subtle before:flex-1 before:border-t after:flex-1 after:border-t">
			<span>or use an API key</span>
		</p>
	{/if}

	<div class="min-w-0 rounded-lg border bg-surface p-4 xs:p-6">
		<ApiKeyForm immichUrl={data.immichUrl} mode="signIn" primary={!data.sso} />
	</div>

	{#if data.sso}
		<details class="group text-sm text-muted">
			<summary
				class="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm font-medium transition-colors hover:text-text [&::-webkit-details-marker]:hidden"
				><Icon name="chevron-right" size={16} class="transition-transform group-open:rotate-90" />Setting up single
				sign-on?</summary
			>
			<div class="mt-3 grid gap-2">
				<p>
					The sign-in provider Immich uses has to allow this agent too. Add this address to the redirect URIs of
					Immich's client there:
				</p>
				<div class="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-surface py-1 pr-1 pl-3">
					<code class="min-w-0 mono wrap-break-word whitespace-normal text-text"
						>{#each data.ssoCallbackUrl.split(/(?<=\/)/) as part, i (i)}{part}<wbr />{/each}</code
					>
					<CopyButton value={data.ssoCallbackUrl} label="Copy address" iconOnly variant="ghost" />
				</div>
			</div>
		</details>
	{/if}
</main>

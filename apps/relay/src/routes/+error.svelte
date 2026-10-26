<script lang="ts">
	import { Button, EmptyState, TopBar } from '@shrim/ui';
	import { page } from '$app/state';
	import Page from '#lib/components/Page.svelte';

	const missing = $derived(page.status === 404);
</script>

<svelte:head><title>{missing ? 'Not found' : 'Something went wrong'} – shrim.pics</title></svelte:head>

<Page width="narrow">
	{#snippet topbar()}<TopBar width="content" />{/snippet}
	<EmptyState
		icon={missing ? 'search' : 'circle-alert'}
		tone={missing ? 'neutral' : 'danger'}
		title={missing ? "There's nothing here" : 'Something went wrong'}
		body={missing
			? 'Check the address, or start again from the home page.'
			: 'That one is on us. Try again in a moment.'}
	>
		{#snippet action()}
			<div class="flex flex-wrap justify-center gap-2">
				<Button href="/" variant="primary">Home page</Button>
				{#if !missing}<Button onclick={() => location.reload()}>Try again</Button>{/if}
			</div>
		{/snippet}
	</EmptyState>
	<p class="text-center text-xs text-subtle tabular">Error {page.status}</p>
</Page>

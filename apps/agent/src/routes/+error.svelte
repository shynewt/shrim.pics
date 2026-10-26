<script lang="ts">
	import { Button, EmptyState, TopBar } from '@shrim/ui';
	import { page } from '$app/state';

	const missing = $derived(page.status === 404);
</script>

<svelte:head><title>{missing ? 'Not found' : 'Something went wrong'} – shrim.pics agent</title></svelte:head>

<TopBar width="content" suffix="agent" home="/" />
<main class="mx-auto max-w-narrow px-(--gutter) py-16">
	<EmptyState
		icon={missing ? 'search' : 'circle-alert'}
		tone={missing ? 'neutral' : 'danger'}
		title={missing ? "There's nothing here" : 'Something went wrong'}
		body={missing
			? 'Check the address, or go back to your share links.'
			: 'The agent hit a problem. Try again in a moment; if it keeps happening, check its logs.'}
	>
		{#snippet action()}
			<div class="flex flex-wrap justify-center gap-2">
				<Button href="/" variant="primary">Share links</Button>
				{#if !missing}<Button onclick={() => location.reload()}>Try again</Button>{/if}
			</div>
		{/snippet}
	</EmptyState>
	<p class="text-center text-xs text-subtle tabular">Error {page.status}</p>
</main>

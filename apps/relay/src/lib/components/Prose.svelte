<script lang="ts">
	import type { Snippet } from 'svelte';
	import { TopBar } from '@shrim/ui';
	import Page from './Page.svelte';

	let { title, children }: { title: string; children: Snippet } = $props();
</script>

<svelte:head><title>{title} – shrim.pics</title></svelte:head>

<Page>
	{#snippet topbar()}<TopBar width="content"><a class="nav" href="/">Home</a></TopBar>{/snippet}
	<article class="max-w-measure leading-prose">
		<h1 class="mb-6">{title}</h1>
		{@render children()}
	</article>
</Page>

<style>
	/* In the components layer so a utility on the content still wins. */
	@layer components {
		article :global(h2) {
			margin: var(--space-10) 0 var(--space-3);
		}

		article :global(p),
		article :global(ul),
		article :global(ol) {
			margin-bottom: var(--space-4);
			color: var(--color-text-muted);
		}

		article :global(li + li) {
			margin-top: var(--space-1);
		}

		article :global(strong) {
			color: var(--color-text);
		}

		article :global(pre) {
			margin-bottom: var(--space-4);
			white-space: pre;
		}
	}
</style>

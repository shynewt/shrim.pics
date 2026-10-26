<script lang="ts">
	import type { Snippet } from 'svelte';
	import SiteFooter from './SiteFooter.svelte';

	let {
		width = 'content',
		topbar,
		children
	}: { width?: 'narrow' | 'content' | 'wide'; topbar: Snippet; children: Snippet } = $props();
</script>

<div class="flex min-h-dvh flex-col">
	{@render topbar()}
	<main
		class={[
			'mx-auto w-full px-(--gutter) pb-16',
			width === 'narrow' ? 'narrow pt-16' : 'pt-6 md:pt-10',
			width === 'content' && 'max-w-content',
			width === 'wide' && 'max-w-wide'
		]}
	>
		{@render children()}
	</main>
	<SiteFooter width={width === 'wide' ? 'wide' : 'content'} />
</div>

<style>
	.narrow {
		max-width: calc(var(--container-narrow) + 2 * var(--gutter));
	}
</style>

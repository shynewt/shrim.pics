<script lang="ts">
	import type { Snippet } from 'svelte';
	import Logo from './Logo.svelte';

	let {
		home = '/',
		suffix,
		width = 'wide',
		border = true,
		children
	}: {
		home?: string;
		/** Extra word after the wordmark, e.g. "agent". */
		suffix?: string;
		width?: 'wide' | 'content';
		border?: boolean;
		children?: Snippet;
	} = $props();
</script>

<header class={['topbar h-14 px-(--gutter)', border && 'border-b']}>
	<div class={['mx-auto flex h-full items-center justify-between gap-4', width]}>
		<a class="plain inline-flex items-center gap-2 rounded-sm" href={home}>
			<span class="inline-flex text-accent"><Logo size={20} /></span>
			<span class="text-md font-semibold tracking-tight text-text">shrim.pics</span>
			{#if suffix}<span class="-ml-1 text-md font-regular text-muted">{suffix}</span>{/if}
		</a>
		{#if children}<nav class="right flex min-w-0 items-center gap-5">{@render children()}</nav>{/if}
	</div>
</header>

<style>
	/* The content lines up with the page container below (its width minus the gutters). */
	.wide {
		max-width: calc(var(--container-wide) - 2 * var(--gutter));
	}
	.content {
		max-width: calc(var(--container-content) - 2 * var(--gutter));
	}

	/* Links passed in by the page. */
	.right :global(a.nav) {
		font-size: var(--text-sm);
		font-weight: var(--weight-medium);
		color: var(--color-text-muted);
		text-decoration: none;
		transition: color var(--duration-fast) var(--ease-out);
	}

	@media (hover: hover) {
		.right :global(a.nav:hover) {
			color: var(--color-text);
		}
	}

	.right > :global(:last-child .btn.ghost),
	.right > :global(.btn.ghost:last-child) {
		margin-inline-end: calc(var(--space-3) * -1);
	}
</style>

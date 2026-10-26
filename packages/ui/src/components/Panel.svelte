<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		title,
		description,
		action,
		children,
		flush = false,
		id
	}: {
		title?: string;
		description?: string | Snippet;
		action?: Snippet;
		children?: Snippet;
		/** Content runs edge to edge (lists with row dividers). */
		flush?: boolean;
		id?: string;
	} = $props();

	const header = $derived(!!(title || action));
</script>

<!-- `panel` stays as a hook: page layouts space panels with :global(.panel). -->
<section
	class={[
		'panel min-w-0 rounded-lg border bg-surface',
		!flush ? 'p-4 xs:p-6' : header ? 'px-4 pt-4 xs:px-6 xs:pt-6' : 'px-4 xs:px-6'
	]}
	{id}
	aria-labelledby={title && id ? `${id}-title` : undefined}
>
	{#if header}
		<header class="flex items-start justify-between gap-4">
			<div class="min-w-0">
				{#if title}<h2 class="text-lg tracking-normal" id={id ? `${id}-title` : undefined}>{title}</h2>{/if}
				{#if description}
					<p class="mt-1 max-w-measure text-sm text-muted">
						{#if typeof description === 'string'}{description}{:else}{@render description()}{/if}
					</p>
				{/if}
			</div>
			{#if action}<div class="action flex flex-none items-center gap-2">{@render action()}</div>{/if}
		</header>
	{/if}
	{#if children}
		<!-- Flush content cancels the panel padding, so row dividers touch the border. -->
		<div class={[header && 'mt-5', flush && '-mx-4 xs:-mx-6']}>{@render children()}</div>
	{/if}
</section>

<style>
	/* A trailing ghost button's label lines up with the content edge. */
	.action :global(.btn.ghost:last-child) {
		margin-inline-end: calc(var(--space-3) * -1);
	}
</style>

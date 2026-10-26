<script lang="ts">
	import type { Snippet } from 'svelte';
	import { type IconName } from './Icon.svelte';
	import IconTile from './IconTile.svelte';
	import Logo from './Logo.svelte';
	import Spinner from './Spinner.svelte';

	let {
		icon,
		tone = 'neutral',
		mascot = false,
		spinner = false,
		title,
		body,
		action
	}: {
		icon?: IconName;
		tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
		mascot?: boolean;
		spinner?: boolean;
		title?: string;
		body?: string | Snippet;
		action?: Snippet;
	} = $props();
</script>

<!-- `empty` (and its h2, p) stay as hooks: the viewer restyles them for its full-page states. -->
<div class="empty flex flex-col items-center px-6 py-12 text-center">
	<div class="mb-4 text-subtle empty:hidden">
		{#if spinner}
			<Spinner size={32} />
		{:else if mascot}
			<Logo size={48} />
		{:else if icon}
			<IconTile {icon} {tone} size="lg" />
		{/if}
	</div>
	{#if title}<h2 class="text-lg tracking-normal">{title}</h2>{/if}
	{#if body}
		<!-- eslint-disable-next-line better-tailwindcss/no-restricted-classes -- one-off measure for a short, centred sentence -->
		<p class="mt-2 max-w-[40ch] text-sm text-muted">
			{#if typeof body === 'string'}{body}{:else}{@render body()}{/if}
		</p>
	{/if}
	{#if action}<div class="mt-6">{@render action()}</div>{/if}
</div>

<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from './Icon.svelte';

	let {
		variant = 'neutral',
		icon,
		children
	}: {
		variant?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
		icon?: IconName;
		children: Snippet;
	} = $props();

	const variants = {
		neutral: 'bg-surface-sunken text-muted',
		accent: 'bg-accent-soft text-accent-on-soft',
		success: 'bg-success-soft text-success',
		warning: 'bg-warning-soft text-warning',
		danger: 'bg-danger-soft text-danger'
	};
</script>

<span
	class={[
		'badge inline-flex h-5.5 items-center gap-1 rounded-full px-2 text-xs font-medium whitespace-nowrap',
		variants[variant]
	]}
>
	{#if icon}<Icon name={icon} size={12} />{/if}
	{@render children()}
</span>

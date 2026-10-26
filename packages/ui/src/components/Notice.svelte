<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon, { type IconName } from './Icon.svelte';

	let {
		tone = 'info',
		children,
		action
	}: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: Snippet; action?: Snippet } = $props();

	const tones = {
		info: 'bg-surface-sunken text-text',
		warning: 'bg-warning-soft text-warning',
		danger: 'bg-danger-soft text-danger',
		success: 'bg-success-soft text-success'
	};

	const icons: Record<string, IconName> = {
		info: 'info',
		warning: 'triangle-alert',
		danger: 'circle-alert',
		success: 'check'
	};
</script>

<div
	class={['notice', tone, 'flex items-start gap-2 rounded-md px-4 py-3 text-sm', tones[tone]]}
	role={tone === 'danger' ? 'alert' : 'status'}
>
	<Icon name={icons[tone]} size={16} class="mt-0.5" />
	<div class="min-w-0 flex-1 [&_a]:text-inherit">{@render children()}</div>
	{#if action}<div class="-my-1 flex-none">{@render action()}</div>{/if}
</div>

<!-- A small soft square holding an icon: gives rows and tiles something to look at. -->
<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	let {
		icon,
		tone = 'neutral',
		size = 'md'
	}: {
		icon: IconName;
		tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
		size?: 'sm' | 'md' | 'lg';
	} = $props();

	const sizes = { sm: 'size-7 rounded-sm', md: 'size-9 rounded-md', lg: 'size-13 rounded-lg' };
	const tones = {
		neutral: 'bg-surface-sunken text-muted',
		accent: 'bg-accent-soft text-accent-on-soft',
		success: 'bg-success-soft text-success',
		warning: 'bg-warning-soft text-warning',
		danger: 'bg-danger-soft text-danger'
	};
</script>

<span class={['icon-tile inline-grid flex-none place-items-center', sizes[size], tones[tone]]} aria-hidden="true"
	><Icon name={icon} size={size === 'sm' ? 16 : size === 'lg' ? 24 : 20} /></span
>

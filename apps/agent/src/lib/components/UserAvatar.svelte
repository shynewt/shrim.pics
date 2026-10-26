<script lang="ts">
	let { name, size = 'md' }: { name: string; size?: 'sm' | 'md' } = $props();

	const initial = $derived(Array.from(name.trim())[0]?.toLocaleUpperCase() ?? '?');
</script>

<span
	class={[
		'inline-grid flex-none place-items-center rounded-full border bg-surface-sunken leading-none font-semibold text-muted',
		size === 'sm' ? 'size-5 text-xs' : 'size-7 text-sm'
	]}
	aria-hidden="true">{initial}</span
>

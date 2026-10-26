<script lang="ts">
	import { Logo } from '@shrim/ui';

	let { size = 'md' }: { size?: 'md' | 'lg' } = $props();
</script>

<span
	class={[
		'inline-grid flex-none place-items-center bg-accent-soft text-accent-text',
		size === 'lg' ? 'size-13 rounded-lg' : 'size-9 rounded-md'
	]}
	aria-hidden="true"><Logo size={size === 'lg' ? 28 : 20} /></span
>

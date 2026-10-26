<script lang="ts">
	import { easyId } from '@shrim/protocol';

	let { id, size = 'md' }: { id: string; size?: 'sm' | 'md' } = $props();
	const emoji = $derived(easyId(id));
</script>

<!-- `easy-id` stays as a hook. -->
<span
	class={[
		'easy-id inline-grid flex-none place-items-center bg-surface-sunken leading-none tracking-emoji select-all',
		size === 'md' ? 'h-9 w-13 rounded-md text-lg' : 'h-7 w-10 rounded-sm text-sm'
	]}
	role="img"
	aria-label="Easy ID {emoji}"
	title="Easy ID: the same two emoji in your agent and on your dashboard"
>
	{emoji}
</span>

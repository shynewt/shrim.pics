<!-- A group of SettingRows: bordered, or flush inside a panel. -->
<script lang="ts">
	import type { Snippet } from 'svelte';

	let { flush = false, label, children }: { flush?: boolean; label?: string; children: Snippet } = $props();
</script>

<ul
	class={['settings', 'overflow-hidden', flush ? 'border-t' : 'rounded-lg border bg-surface', '[&>li+li]:border-t']}
	role="list"
	aria-label={label}
>
	{@render children()}
</ul>

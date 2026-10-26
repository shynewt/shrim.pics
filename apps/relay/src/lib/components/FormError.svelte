<script lang="ts">
	import type { Snippet } from 'svelte';
	import { Icon } from '@shrim/ui';

	let { children }: { children: Snippet } = $props();
</script>

<div class="flex items-start gap-2 rounded-md bg-danger-soft p-3 text-sm text-danger [&_a]:text-inherit" role="alert">
	<Icon name="circle-alert" size={16} class="mt-0.5" />
	<p>{@render children()}</p>
</div>

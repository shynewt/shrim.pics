<!-- Small facts in a row ("Friends can add photos", "Expires 24 Nov"), each with an optional icon. -->
<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	let { items }: { items: Array<{ text: string; icon?: IconName }> } = $props();
</script>

<ul class="flex flex-wrap gap-x-4 gap-y-1 text-sm text-subtle tabular" role="list">
	{#each items as item (item.text)}
		<li class="inline-flex items-center gap-1.5">
			{#if item.icon}<Icon name={item.icon} size={16} />{/if}{item.text}
		</li>
	{/each}
</ul>

<!--
	Label, control, help text and error. The control is passed as a snippet
	that receives the ids it should use for aria-describedby.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		id,
		label,
		optional = false,
		help,
		error,
		aside,
		children
	}: {
		id: string;
		label: string;
		optional?: boolean;
		help?: string | Snippet;
		error?: string | null;
		aside?: Snippet;
		children: Snippet<[{ describedby: string | undefined; invalid: boolean }]>;
	} = $props();

	const describedby = $derived(error ? `${id}-error` : help ? `${id}-help` : undefined);
</script>

<div class="grid gap-1.5">
	<div class="flex items-baseline justify-between gap-3">
		<label for={id}>
			{label}
			{#if optional}<span class="font-regular text-subtle">(optional)</span>{/if}
		</label>
		{@render aside?.()}
	</div>
	{@render children({ describedby, invalid: !!error })}
	{#if error}
		<p class="flex items-start gap-1.5 text-sm text-danger" id="{id}-error">
			<Icon name="circle-alert" size={16} class="mt-0.5" />
			<span>{error}</span>
		</p>
	{:else if help}
		<p class="text-sm text-muted" id="{id}-help">
			{#if typeof help === 'string'}{help}{:else}{@render help()}{/if}
		</p>
	{/if}
</div>

<!-- A radio group drawn as cards. -->
<script lang="ts">
	import Icon, { type IconName } from './Icon.svelte';

	let {
		name,
		value = $bindable(),
		options,
		label
	}: {
		name: string;
		value?: string;
		options: { value: string; title: string; body: string; icon?: IconName }[];
		label: string;
	} = $props();
</script>

<div class="cards grid gap-3" role="radiogroup" aria-label={label}>
	{#each options as o (o.value)}
		{@const selected = value === o.value}
		<label
			class={[
				'relative grid cursor-pointer content-start gap-1 rounded-lg border p-4 pr-10 font-regular transition',
				'has-focus-visible:outline-2 has-focus-visible:outline-offset-2 has-focus-visible:outline-focus',
				selected ? 'border-text inset-ring inset-ring-text' : 'border-strong hover:border-field'
			]}
		>
			<input class="visually-hidden" type="radio" {name} value={o.value} bind:group={value} />
			{#if o.icon}<Icon name={o.icon} size={20} class="mb-2 {selected ? 'text-accent-text' : 'text-muted'}" />{/if}
			<span class="text-md font-medium text-text">{o.title}</span>
			<span class="text-sm text-muted">{o.body}</span>
			{#if selected}<span class="absolute top-4 right-4 text-text"><Icon name="check" size={16} /></span>{/if}
		</label>
	{/each}
</div>

<style>
	/* Side by side from 480px, as many equal columns as there are cards. */
	@media (min-width: 480px) {
		.cards {
			grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
			grid-auto-flow: column;
		}
	}
</style>

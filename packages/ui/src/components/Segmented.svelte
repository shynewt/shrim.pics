<!-- A small set of choices side by side (e.g. how long a link lasts). Radios underneath. -->
<script lang="ts">
	let {
		name,
		label,
		labelledby,
		options,
		value = $bindable()
	}: {
		name: string;
		/** Accessible name; or point `labelledby` at a visible label instead. */
		label?: string;
		labelledby?: string;
		options: { value: string; label: string }[];
		value?: string;
	} = $props();

	/** Phones: one column per option, at most 3; 4 and 8 options wrap as even rows of 2. */
	const columns = $derived.by(() => {
		const n = options.length;
		if (n <= 3) return n;
		return n % 3 !== 0 && n % 2 === 0 ? 2 : 3;
	});
	const grids: Record<number, string> = {
		1: 'max-xs:grid-cols-1',
		2: 'max-xs:grid-cols-2',
		3: 'max-xs:grid-cols-3'
	};
</script>

<!-- `segmented` stays as a hook. -->
<div
	class={[
		'segmented flex w-fit max-w-full flex-wrap gap-1 rounded-md bg-surface-sunken p-1 max-xs:grid max-xs:w-full',
		grids[columns]
	]}
	role="radiogroup"
	aria-label={labelledby ? undefined : label}
	aria-labelledby={labelledby}
>
	{#each options as o (o.value)}
		<label
			class={[
				'relative inline-flex h-8 cursor-pointer items-center rounded-sm px-3 text-sm font-medium transition-colors hover:text-text max-xs:touch-target max-xs:justify-center max-xs:px-2',
				'has-focus-visible:outline-2 has-focus-visible:outline-offset-1 has-focus-visible:outline-focus',
				value === o.value ? 'bg-surface text-text shadow-sm' : 'text-muted'
			]}
		>
			<input
				class="absolute inset-0 m-0 cursor-pointer opacity-0"
				type="radio"
				{name}
				value={o.value}
				bind:group={value}
			/>
			<span>{o.label}</span>
		</label>
	{/each}
</div>

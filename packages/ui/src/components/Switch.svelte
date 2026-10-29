<!-- An on/off switch. A real checkbox underneath, so forms and keyboards just work. -->
<script lang="ts">
	let {
		checked = $bindable(false),
		name,
		id,
		label,
		disabled = false,
		onchange
	}: {
		checked?: boolean;
		name?: string;
		id?: string;
		label?: string;
		disabled?: boolean;
		onchange?: (event: Event & { currentTarget: HTMLInputElement }) => void;
	} = $props();
</script>

<span class="relative inline-flex flex-none">
	<!-- Above the knob (z-1), whose transform would otherwise paint over it. -->
	<input
		class="absolute inset-0 z-1 m-0 size-full cursor-pointer opacity-0"
		type="checkbox"
		role="switch"
		{id}
		{name}
		{disabled}
		bind:checked
		{onchange}
		aria-label={label}
	/>
	<span
		class="track inline-flex h-6 w-10 items-center rounded-full bg-border-strong p-0.5 transition-colors"
		aria-hidden="true"><span class="knob size-5 rounded-full bg-surface shadow-sm transition-transform"></span></span
	>
</span>

<style>
	/* States follow the hidden checkbox next to the track. */
	input:checked + .track {
		background: var(--color-primary);
	}

	input:checked + .track .knob {
		transform: translateX(16px);
		background: var(--color-on-primary);
	}

	/* Hover darkens the track like an input's border; only where hover exists. */
	@media (hover: hover) {
		input:hover:not(:disabled) + .track {
			background: var(--color-border-field);
		}
		input:checked:hover:not(:disabled) + .track {
			background: var(--color-primary-hover);
		}
	}

	input:disabled {
		cursor: not-allowed;
	}

	input:disabled + .track {
		opacity: 0.5;
	}

	input:focus-visible + .track {
		outline: var(--focus-width) solid var(--color-focus);
		outline-offset: var(--focus-offset);
	}
</style>

<!-- A password or key field with a show/hide button. -->
<script lang="ts">
	import Icon from './Icon.svelte';

	let {
		id,
		name,
		autocomplete = 'off',
		mono = false,
		what = 'password',
		describedby,
		invalid = false
	}: {
		id: string;
		name: string;
		autocomplete?: 'new-password' | 'current-password' | 'off';
		mono?: boolean;
		/** Used in the show/hide button's label. */
		what?: string;
		describedby?: string;
		invalid?: boolean;
	} = $props();

	let shown = $state(false);
</script>

<div class="relative">
	<input
		{id}
		{name}
		type={shown ? 'text' : 'password'}
		class={['pr-10', { mono }]}
		{autocomplete}
		spellcheck="false"
		required
		aria-describedby={describedby}
		aria-invalid={invalid || undefined}
	/>
	<button
		class="absolute top-1 right-1 grid size-8 place-items-center rounded-sm text-muted transition-colors hover:bg-surface-sunken hover:text-text max-xs:touch-target"
		type="button"
		onclick={() => (shown = !shown)}
		aria-label={shown ? `Hide ${what}` : `Show ${what}`}
		title={shown ? `Hide ${what}` : `Show ${what}`}
	>
		<Icon name={shown ? 'eye-off' : 'eye'} size={16} />
	</button>
</div>

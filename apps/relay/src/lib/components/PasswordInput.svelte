<script lang="ts">
	import { Icon } from '@shrim/ui';

	let {
		id,
		name,
		autocomplete,
		describedby,
		invalid = false
	}: {
		id: string;
		name: string;
		autocomplete: 'new-password' | 'current-password';
		describedby?: string;
		invalid?: boolean;
	} = $props();

	let shown = $state(false);
</script>

<div class="relative">
	<input
		class="pr-10"
		{id}
		{name}
		type={shown ? 'text' : 'password'}
		{autocomplete}
		required
		aria-describedby={describedby}
		aria-invalid={invalid || undefined}
	/>
	<button
		class="absolute top-1 right-1 inline-grid size-8 place-items-center rounded-sm text-muted transition-colors hover:bg-surface-sunken hover:text-text max-xs:touch-target"
		type="button"
		onclick={() => (shown = !shown)}
		aria-label={shown ? 'Hide password' : 'Show password'}
		title={shown ? 'Hide password' : 'Show password'}
	>
		<Icon name={shown ? 'eye-off' : 'eye'} size={16} />
	</button>
</div>

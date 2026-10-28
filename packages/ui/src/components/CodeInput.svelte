<!-- Where people type a pairing code: XXXX-XXXX, any case, with or without the dash. -->
<script lang="ts">
	let {
		id,
		name = 'code',
		size = 'md',
		describedby,
		class: className
	}: {
		id: string;
		name?: string;
		size?: 'md' | 'lg';
		describedby?: string;
		class?: string | (string | false | undefined)[];
	} = $props();

	// Exactly wide enough for XXXX-XXXX: nine characters, their spacing, padding and border.
	const WIDTH = 'calc(9ch + 9 * var(--tracking-code) + 2 * var(--space-3) + 2 * var(--border-width) + 2px)';
</script>

<input
	{id}
	{name}
	class={[
		'mono tracking-code uppercase',
		size === 'lg' ? 'text-center text-xl leading-md' : 'flex-none text-md',
		className
	]}
	placeholder="____-____"
	autocomplete="one-time-code"
	autocapitalize="characters"
	spellcheck="false"
	maxlength="9"
	required
	aria-describedby={describedby}
	style:width={size === 'md' ? WIDTH : undefined}
/>

<!-- A short code to read and type on another device, one character per key. -->
<script lang="ts">
	let { code, dim = false }: { code: string; dim?: boolean } = $props();
	const spoken = $derived(code.replace('-', ', ').split('').join(' ').replace(/ , /g, ', '));
</script>

<!-- `code-display` stays as a hook (tests and pages find the code by it). -->
<div
	class={[
		'code-display inline-flex items-center mono text-xl font-semibold text-text select-all xs:text-2xl',
		dim && 'opacity-45'
	]}
	aria-label={spoken}
	role="img"
>
	{#each code as char, i (i)}<span
			class={char === '-'
				? 'dash text-center text-subtle'
				: 'key inline-grid place-items-center rounded-sm border bg-surface shadow-sm'}>{char}</span
		>{/each}
</div>

<style>
	/* Key-shaped boxes that scale with the font size. */
	.code-display {
		gap: 0.16em;
	}

	.key {
		width: 1.3em;
		height: 1.6em;
	}

	.dash {
		width: 0.7em;
	}
</style>

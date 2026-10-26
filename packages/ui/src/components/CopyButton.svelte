<script lang="ts">
	import { copyText } from '../clipboard.ts';
	import Button from './Button.svelte';

	let {
		value,
		label = 'Copy link',
		variant = 'secondary',
		size = 'sm',
		full = false,
		iconOnly = false,
		onfail
	}: {
		value: string;
		label?: string;
		variant?: 'primary' | 'secondary' | 'ghost';
		size?: 'sm' | 'md' | 'lg';
		full?: boolean;
		/** Just the icon; `label` becomes its accessible name. */
		iconOnly?: boolean;
		/** Called when the browser refuses to copy (e.g. plain http). */
		onfail?: () => void;
	} = $props();

	let copied = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	async function copy() {
		if (!(await copyText(value))) return onfail?.();
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 2000);
	}
</script>

{#if iconOnly}
	<Button {variant} {size} iconOnly label={copied ? 'Copied' : label} icon={copied ? 'check' : 'copy'} onclick={copy} />
{:else}
	<Button {variant} {size} {full} icon={copied ? 'check' : 'copy'} onclick={copy}>{copied ? 'Copied' : label}</Button>
{/if}
<span class="visually-hidden" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>

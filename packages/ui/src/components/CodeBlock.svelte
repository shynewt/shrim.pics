<script lang="ts">
	import { copyText } from '../clipboard.ts';
	import CopyFailed from './CopyFailed.svelte';
	import Icon from './Icon.svelte';

	let { code, label = 'Copy' }: { code: string; label?: string } = $props();

	let copied = $state(false);
	let failed = $state(false);
	/** More code to the right: fade the edge so it's clear you can scroll. */
	let clipped = $state(false);
	let timer: ReturnType<typeof setTimeout>;

	async function copy() {
		failed = !(await copyText(code));
		if (failed) return;
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 2000);
	}
</script>

<!-- `code-block` stays as a hook for page layouts. -->
<div class="code-block relative">
	<!-- Focusable so keyboard users can scroll long lines (WCAG 2.1.1). -->
	<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
	<pre
		class={['pr-12 mono whitespace-pre', { clipped }]}
		tabindex="0"
		aria-label="Code"
		{@attach (el) => {
			const check = () =>
				(clipped = el.scrollWidth > el.clientWidth + 1 && el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
			check();
			el.addEventListener('scroll', check, { passive: true });
			const ro = new ResizeObserver(check);
			ro.observe(el);
			return () => {
				el.removeEventListener('scroll', check);
				ro.disconnect();
			};
		}}>{code}</pre>
	<button
		class={[
			'absolute top-2 right-2 grid size-8 place-items-center rounded-sm bg-surface-sunken transition-colors hover:bg-surface-pressed max-xs:touch-target',
			copied ? 'text-success' : 'text-muted hover:text-text'
		]}
		type="button"
		onclick={copy}
		aria-label={copied ? 'Copied' : label}
		title={label}
	>
		<Icon name={copied ? 'check' : 'copy'} size={16} />
	</button>
	<span class="visually-hidden" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
	{#if failed}<div class="mt-1.5"><CopyFailed /></div>{/if}
</div>

<style>
	pre.clipped {
		mask-image: linear-gradient(to right, #000 calc(100% - 24px), transparent);
	}
</style>

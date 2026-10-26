<script lang="ts">
	import { copyText } from '../clipboard.ts';
	import CopyFailed from './CopyFailed.svelte';
	import Icon from './Icon.svelte';

	let {
		value,
		label = 'Copy',
		/** Highlight the part after # (share links). */
		link = false,
		/** Mask until revealed (tokens). */
		secret = false,
		compact = false,
		id
	}: { value: string; label?: string; link?: boolean; secret?: boolean; compact?: boolean; id?: string } = $props();

	let copied = $state(false);
	let failed = $state(false);
	let revealed = $state(false);
	let valueEl: HTMLSpanElement | null = null;
	let timer: ReturnType<typeof setTimeout>;

	const action =
		'relative inline-flex h-8 flex-none items-center justify-center gap-2 rounded-sm text-sm font-medium transition-colors hover:bg-surface-pressed max-xs:touch-target';

	const display = $derived(value.replace(/^https?:\/\//, ''));
	const shownHashAt = $derived(link ? display.indexOf('#') : -1);

	function selectValue() {
		if (!valueEl) return;
		const range = document.createRange();
		range.selectNodeContents(valueEl);
		const sel = window.getSelection();
		sel?.removeAllRanges();
		sel?.addRange(range);
	}

	async function copy() {
		failed = false;
		const ok = await copyText(value);
		if (!ok) {
			failed = true;
			if (!secret || revealed) selectValue();
			return;
		}
		copied = true;
		clearTimeout(timer);
		timer = setTimeout(() => (copied = false), 2000);
	}
</script>

<div class="copy-field grid min-w-0 gap-1.5">
	<div class={['flex min-w-0 items-center', !compact && 'h-10 rounded-md border bg-surface-sunken p-1 pl-3']}>
		<span
			class={['min-w-0 flex-1 cursor-text truncate mono text-sm select-all', compact ? 'text-subtle' : 'text-text']}
			{@attach (el) => {
				valueEl = el;
				return () => (valueEl = null);
			}}
			title={secret && !revealed ? undefined : value}
			{id}
		>
			{#if secret && !revealed}
				<span class="visually-hidden">Hidden token</span><span aria-hidden="true">••••••••••••••••••••••••</span>
			{:else if shownHashAt >= 0}
				{display.slice(0, shownHashAt)}<span class="text-accent-text">{display.slice(shownHashAt)}</span>
			{:else}
				{display}
			{/if}
		</span>
		{#if secret}
			<button
				class={[action, 'w-8 text-muted']}
				type="button"
				onclick={() => (revealed = !revealed)}
				aria-label={revealed ? 'Hide token' : 'Show token'}
				title={revealed ? 'Hide token' : 'Show token'}
			>
				<Icon name={revealed ? 'eye-off' : 'eye'} size={16} />
			</button>
		{/if}
		{#if !compact}<span class="m-1 w-px self-stretch bg-border" aria-hidden="true"></span>{/if}
		<button
			class={[action, 'px-3', copied ? 'text-success' : 'text-text', compact && 'ml-2']}
			type="button"
			onclick={copy}
		>
			<Icon name={copied ? 'check' : 'copy'} size={16} />
			<span>{copied ? 'Copied' : label}</span>
		</button>
	</div>
	<span class="visually-hidden" aria-live="polite">{copied ? 'Copied to clipboard' : ''}</span>
	{#if failed}<CopyFailed />{/if}
</div>

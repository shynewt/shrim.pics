<!--
	Native <dialog> with showModal(): focus trap, Esc and top layer for free.
	Bind `open` to show or hide it.
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import Icon from './Icon.svelte';

	let {
		open = $bindable(false),
		title,
		size = 'sm',
		dismissable = true,
		onclose,
		children,
		footer
	}: {
		open?: boolean;
		title: string;
		size?: 'sm' | 'md';
		/** Backdrop click closes it. Esc always asks via onclose. */
		dismissable?: boolean;
		onclose?: () => void;
		children: Snippet;
		footer?: Snippet;
	} = $props();

	const uid = $props.id();
	const titleId = `dialog-${uid}`;

	/** Keeps the native dialog in step with `open`. */
	function modal(el: HTMLDialogElement) {
		if (open && !el.open) el.showModal();
		if (!open && el.open) el.close();
	}

	function requestClose() {
		if (onclose) onclose();
		else open = false;
	}
</script>

<dialog
	{@attach modal}
	class={size}
	aria-labelledby={titleId}
	oncancel={(e) => {
		e.preventDefault();
		requestClose();
	}}
	onclose={(e) => {
		// The browser can close a modal by itself (e.g. a second Esc). Keep `open` in step:
		// ask to close like Esc would, or, if closing isn't allowed right now, show it again.
		if (!open) return;
		const el = e.currentTarget;
		requestClose();
		queueMicrotask(() => {
			if (open && !el.open) el.showModal();
		});
	}}
	onclick={(e) => {
		if (dismissable && e.target === e.currentTarget) requestClose();
	}}
>
	{#if open}
		<div class="panel grid gap-4 overflow-auto rounded-xl bg-surface shadow-lg max-xs:rounded-b-none">
			<header class="flex items-start justify-between gap-4">
				<h2 class="pt-1 text-lg tracking-normal" id={titleId}>{title}</h2>
				<button
					class="relative -mt-2 -mr-2 inline-flex size-10 flex-none items-center justify-center rounded-md text-muted transition-colors hover:bg-surface-sunken hover:text-text max-xs:touch-target"
					type="button"
					aria-label="Close"
					title="Close"
					onclick={requestClose}
				>
					<Icon name="x" size={20} />
				</button>
			</header>
			<div class="min-w-0 text-muted">{@render children()}</div>
			{#if footer}
				<footer
					class="mt-2 flex flex-wrap items-center justify-end gap-2 empty:hidden max-xs:flex-col-reverse max-xs:items-stretch"
				>
					{@render footer()}
				</footer>
			{/if}
		</div>
	{/if}
</dialog>

<style>
	dialog {
		width: calc(100% - 2 * var(--gutter));
		margin: auto;
	}

	dialog.sm {
		max-width: 440px;
	}
	dialog.md {
		max-width: 560px;
	}

	dialog[open] {
		animation: enter var(--duration-slow) var(--ease-out);
	}
	dialog[open]::backdrop {
		animation: fade var(--duration-slow) var(--ease-out);
	}

	/* Content can use these to reach the panel's edges (e.g. a footer band). */
	.panel {
		--dialog-pad-x: var(--space-6);
		--dialog-pad-bottom: var(--space-6);
		padding: var(--space-6) var(--dialog-pad-x) var(--dialog-pad-bottom);
		max-height: calc(100dvh - 2 * var(--space-6));
	}

	@media (max-width: 479px) {
		dialog {
			width: 100%;
			max-width: none !important;
			margin: auto 0 0;
		}
		.panel {
			--dialog-pad-x: var(--space-4);
			padding-top: var(--space-5);
		}
		footer :global(.btn) {
			width: 100%;
		}
	}

	@keyframes enter {
		from {
			opacity: 0;
			transform: scale(0.98);
		}
	}
	@keyframes fade {
		from {
			opacity: 0;
		}
	}
</style>

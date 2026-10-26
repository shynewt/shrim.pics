<script lang="ts">
	import { dismiss, toasts, type Toast } from '../toasts.svelte.ts';
	import Icon from './Icon.svelte';

	/** Dismisses a toast after its lifetime; hovering or focusing pauses the clock. */
	const lifetime = (t: Toast) => (node: HTMLElement) => {
		let remaining = t.kind === 'error' ? 6000 : 4000;
		let started = Date.now();
		let timer = setTimeout(() => dismiss(t.id), remaining);
		// Hover and focus can overlap: the clock runs again only when both have let go.
		let holds = 0;
		const pause = () => {
			if (holds++ > 0) return;
			clearTimeout(timer);
			remaining -= Date.now() - started;
		};
		const resume = () => {
			if (--holds > 0) return;
			holds = 0;
			started = Date.now();
			timer = setTimeout(() => dismiss(t.id), Math.max(remaining, 1000));
		};
		node.addEventListener('mouseenter', pause);
		node.addEventListener('mouseleave', resume);
		node.addEventListener('focusin', pause);
		node.addEventListener('focusout', resume);
		return () => clearTimeout(timer);
	};
</script>

<!--
	Two live regions in one stack: confirmations are polite (`status`), errors interrupt (`alert`).
	Both are always in the page, so screen readers hear every toast that lands in them.
-->
<div class="toaster pointer-events-none fixed z-toast flex w-max flex-col">
	{@render region('success')}
	{@render region('error')}
</div>

{#snippet region(kind: Toast['kind'])}
	<!-- The second region only adds its gap when it holds a toast, so a lone toast sits at the edge. -->
	<div
		class={['flex flex-col gap-2', kind === 'error' && 'not-empty:mt-2']}
		role={kind === 'error' ? 'alert' : 'status'}
		aria-live={kind === 'error' ? 'assertive' : 'polite'}
	>
		{#each toasts.filter((t) => t.kind === kind) as t (t.id)}
			<div
				class="toast pointer-events-auto flex max-w-100 min-w-60 items-center gap-3 rounded-lg bg-inverse px-4 py-3 text-sm text-on-inverse shadow-md"
				{@attach lifetime(t)}
			>
				<Icon
					name={t.kind === 'error' ? 'circle-alert' : 'check'}
					size={16}
					class={t.kind === 'error' ? 'text-danger-soft' : undefined}
				/>
				<span class="flex-1">{t.message}</span>
				{#if t.kind === 'error'}
					<!-- 32px, pulled into the padding so the toast keeps its height. -->
					<button
						class="relative -my-1.5 -mr-2 inline-grid size-8 flex-none place-items-center rounded-sm text-on-inverse-muted transition-colors hover:text-on-inverse max-xs:touch-target"
						type="button"
						aria-label="Close"
						title="Close"
						onclick={() => dismiss(t.id)}
					>
						<Icon name="x" size={16} />
					</button>
				{/if}
			</div>
		{/each}
	</div>
{/snippet}

<style>
	.toaster {
		left: 50%;
		bottom: var(--space-4);
		transform: translateX(-50%);
		align-items: center;
		max-width: calc(100% - 2 * var(--space-4));
	}

	/* Each region lines its toasts up like the stack does. */
	.toaster > div {
		align-items: inherit;
	}

	@media (min-width: 768px) {
		.toaster {
			left: auto;
			right: var(--space-6);
			bottom: var(--space-6);
			transform: none;
			align-items: flex-end;
		}
	}

	.toast {
		animation: rise var(--duration-slow) var(--ease-out);
	}

	@keyframes rise {
		from {
			opacity: 0;
			transform: translateY(8px);
		}
	}
</style>

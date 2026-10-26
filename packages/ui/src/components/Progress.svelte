<script lang="ts">
	let {
		value = null,
		state = 'active',
		label,
		size = 'sm',
		onDark = false
	}: {
		/** 0–100, or null for indeterminate */
		value?: number | null;
		state?: 'active' | 'done' | 'error';
		label: string;
		/** `sm` (4px) inside rows and tiles; `md` (6px) when the bar stands on its own. */
		size?: 'sm' | 'md';
		onDark?: boolean;
	} = $props();
</script>

<!-- `track` stays as a hook. -->
<div
	class={[
		'track relative overflow-hidden rounded-full',
		size === 'md' ? 'h-1.5' : 'h-1',
		onDark ? 'bg-scrim-control' : 'bg-surface-sunken',
		{ error: state === 'error', indeterminate: value === null }
	]}
	role="progressbar"
	aria-label={label}
	aria-valuemin={0}
	aria-valuemax={100}
	aria-valuenow={value ?? undefined}
>
	<div
		class={['fill h-full rounded-full', { active: 'bg-accent', done: 'bg-success', error: 'bg-danger' }[state]]}
		style:width={value === null ? undefined : `${Math.max(0, Math.min(100, value))}%`}
	></div>
</div>

<style>
	.fill {
		transition: width var(--duration-base) linear;
	}

	/* An error freezes the bar where it stopped. */
	.error .fill {
		transition: none;
	}

	.indeterminate .fill {
		width: 30%;
		animation: slide 1.2s var(--ease-in-out) infinite;
	}

	@keyframes slide {
		from {
			transform: translateX(-100%);
		}
		to {
			transform: translateX(340%);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		.indeterminate .fill {
			width: 100%;
			opacity: 0.4;
			animation: none;
		}
	}
</style>

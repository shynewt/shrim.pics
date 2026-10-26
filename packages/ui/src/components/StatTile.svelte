<!-- An at-a-glance tile: what it is, how it's doing, one line of detail, maybe one action. -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import type { IconName } from './Icon.svelte';
	import IconTile from './IconTile.svelte';

	let {
		icon,
		tone = 'neutral',
		label,
		value,
		detail,
		status,
		action
	}: {
		icon: IconName;
		tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
		label: string;
		value: string;
		detail?: string;
		status?: Snippet;
		action?: Snippet;
	} = $props();
</script>

<section class="stat min-w-0 rounded-lg border bg-surface p-4 sm:p-5" aria-label={label}>
	<div class="icon"><IconTile {icon} {tone} /></div>
	{#if status}<div class="status">{@render status()}</div>{/if}
	<div class="text min-w-0 sm:mt-4">
		<p class="text-sm text-muted">{label}</p>
		<p class="text-lg font-semibold">{value}</p>
		{#if detail}<p class="text-sm text-subtle">{detail}</p>{/if}
	</div>
	{#if action}<div class="action pt-3 sm:self-end sm:pt-4">{@render action()}</div>{/if}
</section>

<style>
	/* The layout as named areas. Phones: a compact row (icon, text, status). Wider: a tile. */
	.stat {
		display: grid;
		grid-template-columns: auto minmax(0, 1fr) auto;
		grid-template-areas:
			'icon text status'
			'. action action';
		align-items: center;
		column-gap: var(--space-4);
	}

	@media (min-width: 640px) {
		.stat {
			grid-template-columns: minmax(0, 1fr) auto;
			grid-template-rows: auto 1fr auto;
			grid-template-areas:
				'icon status'
				'text text'
				'action action';
			align-items: start;
		}
	}

	.icon {
		grid-area: icon;
		align-self: start;
	}

	.status {
		grid-area: status;
		align-self: start;
	}

	.text {
		grid-area: text;
	}

	.action {
		grid-area: action;
	}
</style>

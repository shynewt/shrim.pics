<!--
	One row: icon, title, a line of description, and whatever goes on the right.
	With `control`, the whole row is a label for it (switches, checkboxes).
-->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { type IconName } from './Icon.svelte';
	import IconTile from './IconTile.svelte';

	let {
		icon,
		tone = 'neutral',
		title,
		description,
		trailing,
		control,
		children,
		compact = false
	}: {
		icon?: IconName;
		tone?: 'neutral' | 'accent' | 'success' | 'warning' | 'danger';
		title: string;
		description?: string | Snippet;
		trailing?: Snippet;
		/** A form control on the right; the whole row toggles it. */
		control?: Snippet;
		/** Extra content under the description (e.g. a revealed form). */
		children?: Snippet;
		/** Keep `trailing` on the right on phones too (badges, small toggles). */
		compact?: boolean;
	} = $props();
</script>

{#snippet body()}
	{#if icon}<IconTile {icon} {tone} />{/if}
	<span class="grid min-w-0 flex-1 gap-0.5">
		<span class={['text-md font-medium', tone === 'danger' ? 'text-danger' : 'text-text']}>{title}</span>
		{#if description}
			<span class="text-sm text-muted">
				{#if typeof description === 'string'}{description}{:else}{@render description()}{/if}
			</span>
		{/if}
	</span>
{/snippet}

<li class="p-4 xs:px-6">
	{#if control}
		<label class="flex min-w-0 cursor-pointer items-center gap-4 font-regular">
			{@render body()}
			<span class="flex flex-none items-center gap-2">{@render control()}</span>
		</label>
	{:else}
		<!-- Phones: the trailing actions drop under the text, lined up with it (past the 36px tile and its gap). -->
		<div class={['flex min-w-0 items-center gap-4 font-regular', !compact && 'max-xs:flex-wrap']}>
			{@render body()}
			{#if trailing}
				<span
					class={['flex flex-none items-center gap-2', !compact && ['wraps max-xs:w-full', icon && 'max-xs:pl-13']]}
				>
					{@render trailing()}
				</span>
			{/if}
		</div>
	{/if}
	{#if children}<div class={['mt-4', icon && 'xs:pl-13']}>{@render children()}</div>{/if}
</li>

<style>
	@media (max-width: 479px) {
		/* A text button under the description lines up with the text, not its own padding. */
		.wraps > :global(.btn.ghost:first-child),
		.wraps > :global(.btn.ghost-danger:first-child) {
			margin-left: calc(var(--space-3) * -1);
		}
	}
</style>

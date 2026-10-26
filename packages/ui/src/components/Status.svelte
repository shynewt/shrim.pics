<script lang="ts">
	import type { Snippet } from 'svelte';

	let {
		state,
		label,
		detail,
		live = false
	}: {
		state: 'online' | 'connecting' | 'offline' | 'error';
		label: string;
		detail?: string | Snippet;
		/**
		 * Announce changes politely (`role="status"`). Only for an indicator that changes while the page
		 * is open; keep the same Status mounted and change its props, so the live region persists.
		 */
		live?: boolean;
	} = $props();

	const dots = {
		online: 'bg-status-online ring-3 ring-success-soft',
		connecting: 'bg-status-connecting animate-pulse',
		offline: 'bg-status-offline',
		error: 'bg-status-error'
	};
</script>

<div class="grid min-w-0 gap-0.5" role={live ? 'status' : undefined}>
	<span class="inline-flex items-start gap-2">
		<span class={['mt-1.5 size-2 flex-none rounded-full', dots[state]]} aria-hidden="true"></span>
		<!-- `label` stays as a hook (the agent's status line tones it down). -->
		<span class="label text-sm font-medium text-text">{label}</span>
	</span>
	{#if detail}
		<!-- Lined up with the label: dot (8px) plus gap. -->
		<span class="pl-4 text-sm text-muted">
			{#if typeof detail === 'string'}{detail}{:else}{@render detail()}{/if}
		</span>
	{/if}
</div>

<!-- A numbered setup sequence. Each step is a snippet; only the current one shows its body. -->
<script lang="ts" module>
	import type { Snippet } from 'svelte';

	export interface Step {
		title: string;
		state: 'upcoming' | 'current' | 'done';
		/** Shown under the title. For done steps, the one-line summary. */
		summary?: string | Snippet;
		body?: Snippet;
	}
</script>

<script lang="ts">
	import Icon from './Icon.svelte';

	let { steps }: { steps: Step[] } = $props();

	const markers = {
		upcoming: 'border-strong text-subtle',
		current: 'border-primary bg-primary text-on-primary',
		done: 'border-success-soft bg-success-soft text-success'
	};
</script>

<ol class="steps grid" role="list">
	{#each steps as step, i (step.title)}
		<!-- eslint-disable better-tailwindcss/no-restricted-classes -- one-off geometry: a 28px column for the marker -->
		<li
			class="grid min-w-0 grid-cols-[28px_1fr] gap-x-3 border-t px-4 py-5 first:border-t-0 xs:px-6"
			aria-current={step.state === 'current' ? 'step' : undefined}
		>
			<!-- eslint-enable better-tailwindcss/no-restricted-classes -->
			<span
				class={['grid size-7 place-items-center rounded-full border text-sm font-semibold', markers[step.state]]}
				aria-hidden="true"
			>
				{#if step.state === 'done'}<Icon name="check" size={16} />{:else}{i + 1}{/if}
			</span>
			<div class="min-w-0 pt-0.5">
				<h2 class={['text-lg tracking-normal', step.state === 'upcoming' && 'text-subtle']}>
					{step.title}
					{#if step.state === 'done'}<span class="visually-hidden">(done)</span>{/if}
				</h2>
				{#if step.summary}
					<div class="mt-1 text-sm text-muted">
						{#if typeof step.summary === 'string'}{step.summary}{:else}{@render step.summary()}{/if}
					</div>
				{/if}
			</div>
			{#if step.state === 'current' && step.body}
				<!-- Under the title on wide screens; the full width on phones, where every pixel counts. -->
				<div class="col-span-full mt-5 min-w-0 xs:col-start-2">{@render step.body()}</div>
			{/if}
		</li>
	{/each}
</ol>

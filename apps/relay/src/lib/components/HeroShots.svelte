<!-- Images live in static/landing (see CREDITS.txt). -->
<script lang="ts">
	import { Icon } from '@shrim/ui';

	let { host, demo = null }: { host: string; demo?: string | null } = $props();

	/** Phones don't show this figure, and hidden images still download without it. */
	const blank = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
	const viewer = (scheme: 'light' | 'dark') =>
		[800, 1400, 2240].map((w) => `/landing/viewer-${scheme}-${w}.webp ${w}w`).join(', ');
	const sizes = '(min-width: 1120px) 540px, (min-width: 1024px) 48vw, calc(100vw - 48px)';
</script>

<figure class="relative hidden min-w-0 pb-16 sm:block">
	<!-- A full page load, like a friend opening the link. -->
	<svelte:element
		this={demo ? 'a' : 'div'}
		href={demo}
		data-sveltekit-reload={demo ? '' : undefined}
		aria-label={demo ? 'Open the example album' : undefined}
		class={[
			'group plain mr-8 block overflow-hidden rounded-lg border bg-surface shadow-md',
			demo && 'transition duration-base hover:border-strong hover:shadow-lg'
		]}
	>
		<div class="flex h-8 min-w-0 items-center gap-3 border-b bg-surface-sunken px-3" aria-hidden="true">
			<span class="flex flex-none gap-1.5">
				{#each [1, 2, 3] as dot (dot)}<i class="size-2 rounded-full bg-border-strong"></i>{/each}
			</span>
			<span class="min-w-0 flex-1 truncate mono text-xs text-muted"
				>{host}/s/Xk3f9QaPz2<span class="text-accent-text">#k8Fz2pQwR7vLm3x</span></span
			>
			{#if demo}
				<span
					class="flex flex-none items-center text-xs font-medium text-subtle transition-colors group-hover:text-text"
					>Open<Icon name="chevron-right" size={12} /></span
				>
			{/if}
		</div>
		<picture>
			<source media="(max-width: 639px)" srcset={blank} />
			<source media="(prefers-color-scheme: dark)" srcset={viewer('dark')} {sizes} />
			<img
				class="w-full"
				src="/landing/viewer-light-1400.webp"
				srcset={viewer('light')}
				{sizes}
				width="2240"
				height="1480"
				alt="A shared album called Spring in Seville, open in a browser: holiday photos grouped by day."
			/>
		</picture>
	</svelte:element>

	<div class="phone absolute right-0 bottom-0 border bg-scrim p-1 shadow-lg">
		<picture>
			<source media="(max-width: 639px)" srcset={blank} />
			<img class="w-full" src="/landing/lightbox.webp" width="440" height="880" alt="The same album on a phone." />
		</picture>
	</div>

	<figcaption class="absolute bottom-6 left-0 flex max-w-2/3 items-center gap-2 text-sm text-muted">
		<Icon name="key-round" size={16} class="flex-none text-accent-text" />
		<span>The key after <span class="mono text-accent-text">#</span> never leaves your browser.</span>
	</figcaption>
</figure>

<style>
	/* The phone's size and its nested corners (screen radius = frame radius - frame padding). */
	.phone {
		width: 27%;
		max-width: 13.75rem;
		border-radius: calc(var(--radius-xl) * 1.5);
	}

	.phone img {
		border-radius: calc(var(--radius-xl) * 1.5 - var(--space-1));
	}
</style>

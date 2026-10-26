<!-- Images live in static/landing (see CREDITS.txt). -->
<script lang="ts">
	let { host }: { host: string } = $props();

	/** Keeps the browser window's image from loading on phones, where it's hidden. */
	const blank = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
	const viewer = (scheme: 'light' | 'dark') =>
		[800, 1400, 2240].map((w) => `/landing/viewer-${scheme}-${w}.webp ${w}w`).join(', ');
	const sizes = '(min-width: 1120px) 540px, (min-width: 1024px) 48vw, calc(100vw - 48px)';
</script>

<figure class="relative min-w-0 sm:pb-16">
	<div class="mr-8 hidden overflow-hidden rounded-lg border bg-surface shadow-md sm:block">
		<div class="flex h-8 min-w-0 items-center gap-3 border-b bg-surface-sunken px-3" aria-hidden="true">
			<span class="flex flex-none gap-1.5">
				{#each [1, 2, 3] as dot (dot)}<i class="size-2 rounded-full bg-border-strong"></i>{/each}
			</span>
			<span class="truncate mono text-xs text-muted"
				>{host}/s/Xk3f9QaPz2<span class="text-accent-text">#k8Fz2pQwR7vLm3x</span></span
			>
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
	</div>

	<div class="phone border bg-scrim p-1.5 shadow-lg sm:absolute sm:right-0 sm:bottom-0 sm:p-1">
		<picture>
			<source
				media="(max-width: 639px) and (prefers-color-scheme: dark)"
				srcset="/landing/phone-dark.webp"
				width="560"
				height="1120"
			/>
			<source media="(max-width: 639px)" srcset="/landing/phone-light.webp" width="560" height="1120" />
			<img class="w-full" src="/landing/lightbox.webp" width="440" height="880" alt="The same album on a phone." />
		</picture>
	</div>

	<figcaption class="absolute bottom-4 left-0 hidden max-w-3/5 items-baseline gap-2 text-sm text-muted sm:flex">
		<span class="h-0.5 w-4 flex-none self-center rounded-full bg-accent" aria-hidden="true"></span>
		<span
			>The part after <span class="mono text-accent-text">#</span> never leaves the browser. It's the key to the photos.</span
		>
	</figcaption>
</figure>

<style>
	/* The phone's size and its nested corners (screen radius = frame radius - frame padding). */
	.phone {
		width: min(72%, 18rem);
		border-radius: calc(var(--radius-xl) * 2);
	}

	.phone img {
		border-radius: calc(var(--radius-xl) * 2 - var(--space-1-5));
	}

	@media (min-width: 640px) {
		.phone {
			width: 27%;
			max-width: 13.75rem;
			border-radius: calc(var(--radius-xl) * 1.5);
		}

		.phone img {
			border-radius: calc(var(--radius-xl) * 1.5 - var(--space-1));
		}
	}
</style>

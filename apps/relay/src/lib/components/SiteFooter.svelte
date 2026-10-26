<script lang="ts">
	import { Logo } from '@shrim/ui';
	import { page } from '$app/state';

	let { width = 'wide' }: { width?: 'narrow' | 'content' | 'wide' } = $props();
	const sourceUrl = $derived(page.data.sourceUrl as string | null);
</script>

<footer class="mt-auto border-t px-(--gutter) pt-8 pb-12 text-sm text-muted">
	<div class={['mx-auto flex flex-col gap-4 xs:flex-row xs:items-center xs:justify-between', width]}>
		<a class="plain inline-flex items-center gap-2 text-muted transition-colors hover:text-text" href="/">
			<Logo size={16} />
			<span>shrim.pics</span>
		</a>
		<nav
			class="flex flex-wrap gap-x-5 gap-y-2 [&_a]:text-muted [&_a]:no-underline [&_a]:transition-colors [&_a]:hover:text-text [&_a]:hover:underline"
		>
			{#if sourceUrl}<a href={sourceUrl}>Source code</a>{/if}
			<a href="/self-host">Self-host</a>
			<a href="/privacy">Privacy</a>
			<a href="/terms">Terms</a>
			<a href="/legal">Legal notice</a>
			<a href="/report">Report a link</a>
		</nav>
	</div>
	<p class={['mx-auto mt-6 text-xs text-subtle', width]}>
		shrim.pics is an independent project, not affiliated with Immich or FUTO.
	</p>
</footer>

<style>
	/* The content lines up with the page column above (its width minus the gutters), like TopBar. */
	.wide,
	.narrow {
		max-width: calc(var(--container-wide) - 2 * var(--gutter));
	}
	.content {
		max-width: calc(var(--container-content) - 2 * var(--gutter));
	}
</style>

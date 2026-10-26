<script lang="ts">
	import '@shrim/ui/app.css';
	import { NoScript, Toaster } from '@shrim/ui';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<svelte:head><title>shrim.pics agent</title></svelte:head>

<NoScript what="The agent page" />
{@render children()}
<Toaster />

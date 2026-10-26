<script lang="ts">
	import '@shrim/ui/app.css';
	import { NoScript, Toaster } from '@shrim/ui';
	import type { LayoutProps } from './$types';

	let { children }: LayoutProps = $props();
</script>

<NoScript />
{@render children()}
<Toaster />

<!-- A QR code made on this device (never fetched: it may hold a secret). -->
<script lang="ts">
	import { encode } from 'uqr';

	let {
		value,
		size = 160,
		label = 'QR code for the share link'
	}: { value: string; size?: number; label?: string } = $props();

	const qr = $derived(encode(value, { ecc: 'M', border: 4 }));
	const path = $derived.by(() => {
		let d = '';
		qr.data.forEach((row, y) =>
			row.forEach((on, x) => {
				if (on) d += `M${x} ${y}h1v1h-1z`;
			})
		);
		return d;
	});
</script>

<div class="qr flex-none rounded-md border bg-qr-bg p-3" style:--size="{size}px">
	<svg class="bg-qr-bg" viewBox="0 0 {qr.size} {qr.size}" role="img" aria-label={label} shape-rendering="crispEdges">
		<path class="fill-qr-fg" d={path} />
	</svg>
</div>

<style>
	.qr {
		width: calc(var(--size) + 2 * var(--space-3));
	}

	svg {
		width: var(--size);
		height: var(--size);
	}
</style>

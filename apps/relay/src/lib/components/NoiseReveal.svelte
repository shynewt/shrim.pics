<!--
	The same photos twice: as shrim.pics gets them and as friends see them, split by the key.
	The noise is real ciphertext: each photo is encrypted here with a throwaway key, one grey pixel per byte.
-->
<script lang="ts">
	let { photos, keyText }: { photos: { src: string; alt: string }[]; keyText: string } = $props();

	let at = $state(40);

	function ciphertext(src: string) {
		return (canvas: HTMLCanvasElement) => {
			let gone = false;
			void (async () => {
				const bytes = await fetch(src).then((r) => r.arrayBuffer());
				const key = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt']);
				const iv = crypto.getRandomValues(new Uint8Array(12));
				const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, bytes));
				const ctx = canvas.getContext('2d');
				if (gone || !ctx) return;
				const image = ctx.createImageData(canvas.width, canvas.height);
				for (let i = 0; i < canvas.width * canvas.height; i++) {
					// Squeezed into mid greys: static, not glare.
					const v = 96 + (sealed[i % sealed.length] * 72) / 255;
					image.data.set([v, v, v, 255], i * 4);
				}
				ctx.putImageData(image, 0, 0);
			})().catch(() => {});
			return () => (gone = true);
		};
	}
</script>

<figure class="reveal relative pt-8">
	<div class="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
		{#each photos as p (p.src)}
			<img class="aspect-3/2 w-full rounded-sm object-cover" src={p.src} alt={p.alt} loading="lazy" />
		{/each}
	</div>
	<div
		class="absolute inset-x-0 top-8 grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3"
		style:clip-path="inset(0 {100 - at}% 0 0)"
		aria-hidden="true"
	>
		{#each photos as p (p.src)}
			<canvas
				class="aspect-3/2 w-full rounded-sm bg-surface-sunken"
				width="150"
				height="100"
				{@attach ciphertext(p.src)}
			></canvas>
		{/each}
	</div>
	<div
		class="key-line pointer-events-none absolute top-0 bottom-0 w-0.5 bg-accent"
		style:left="{at}%"
		aria-hidden="true"
	>
		<span class="absolute top-0 left-2 mono text-sm whitespace-nowrap text-accent-text">{keyText}</span>
	</div>
	<input
		class="absolute inset-0 size-full cursor-ew-resize touch-pan-y opacity-0"
		type="range"
		min="0"
		max="100"
		bind:value={at}
		aria-label="Move the key across the photos"
	/>
</figure>

<style>
	/* Hard-edged pixels: smoothed, ciphertext looks like blur instead of static. */
	canvas {
		image-rendering: pixelated;
	}

	/* The range input is invisible; its focus shows on the line instead. */
	.reveal:has(input:focus-visible) .key-line {
		outline: 2px solid var(--color-focus);
		outline-offset: 2px;
	}
</style>

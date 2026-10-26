<script lang="ts">
	import { formatDate } from '@shrim/ui';

	let { weeks, label }: { weeks: { start: number; count: number }[]; label: string } = $props();

	const H = 32;
	const GAP = 2;
	const max = $derived(Math.max(1, ...weeks.map((w) => w.count)));
	const total = $derived(weeks.reduce((n, w) => n + w.count, 0));
	const width = $derived(weeks.length * 10 - GAP);
</script>

<svg
	class="h-8 w-full"
	viewBox="0 0 {width} {H}"
	preserveAspectRatio="none"
	role="img"
	aria-label="{label}: {total} in the last {weeks.length} weeks, {weeks.at(-1)?.count ?? 0} this week"
>
	{#each weeks as w, i (w.start)}
		{@const h = w.count === 0 ? 1 : Math.max(3, (w.count / max) * H)}
		{@const now = i === weeks.length - 1}
		<g class="group">
			<title>Week of {formatDate(w.start)}: {w.count}</title>
			<!-- Hit area: the full column, so thin bars are easy to hover. -->
			<rect class="fill-transparent" x={i * 10} y="0" width={10 - GAP} height={H} />
			<rect
				class={[
					'transition-colors',
					now ? 'fill-accent group-hover:fill-accent-text' : 'fill-border-strong group-hover:fill-text-muted'
				]}
				x={i * 10}
				y={H - h}
				width={10 - GAP}
				height={h}
				rx="1.5"
			/>
		</g>
	{/each}
</svg>

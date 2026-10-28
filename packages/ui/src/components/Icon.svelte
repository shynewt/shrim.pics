<!--
	Inline icons. Shapes copied from Lucide (https://lucide.dev, ISC license).
-->
<script lang="ts" module>
	type Shape = [tag: string, attrs: Record<string, string>];

	const icons = {
		'arrow-left': [
			['path', { d: 'm12 19-7-7 7-7' }],
			['path', { d: 'M19 12H5' }]
		],
		ban: [
			['circle', { cx: '12', cy: '12', r: '10' }],
			['path', { d: 'M4.929 4.929 19.07 19.071' }]
		],
		check: [['path', { d: 'M20 6 9 17l-5-5' }]],
		'chevron-left': [['path', { d: 'm15 18-6-6 6-6' }]],
		'chevron-right': [['path', { d: 'm9 18 6-6-6-6' }]],
		'circle-alert': [
			['circle', { cx: '12', cy: '12', r: '10' }],
			['line', { x1: '12', x2: '12', y1: '8', y2: '12' }],
			['line', { x1: '12', x2: '12.01', y1: '16', y2: '16' }]
		],
		clock: [
			['circle', { cx: '12', cy: '12', r: '10' }],
			['path', { d: 'M12 6v6l4 2' }]
		],
		'cloud-off': [
			['path', { d: 'M10.94 5.274A7 7 0 0 1 15.71 10h1.79a4.5 4.5 0 0 1 4.222 6.057' }],
			['path', { d: 'M18.796 18.81A4.5 4.5 0 0 1 17.5 19H9A7 7 0 0 1 5.79 5.78' }],
			['path', { d: 'm2 2 20 20' }]
		],
		copy: [
			['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }],
			['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }]
		],
		'credit-card': [
			['rect', { width: '20', height: '14', x: '2', y: '5', rx: '2' }],
			['line', { x1: '2', x2: '22', y1: '10', y2: '10' }],
			['path', { d: 'M6 14h2' }]
		],
		download: [
			['path', { d: 'M12 15V3' }],
			['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }],
			['path', { d: 'm7 10 5 5 5-5' }]
		],
		'external-link': [
			['path', { d: 'M15 3h6v6' }],
			['path', { d: 'M10 14 21 3' }],
			['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }]
		],
		'eye-off': [
			['path', { d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49' }],
			['path', { d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242' }],
			['path', { d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143' }],
			['path', { d: 'm2 2 20 20' }]
		],
		eye: [
			[
				'path',
				{ d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' }
			],
			['circle', { cx: '12', cy: '12', r: '3' }]
		],
		flag: [
			[
				'path',
				{
					d: 'M4 22V4a1 1 0 0 1 .4-.8A6 6 0 0 1 8 2c3 0 5 2 7.333 2q2 0 3.067-.8A1 1 0 0 1 20 4v10a1 1 0 0 1-.4.8A6 6 0 0 1 16 16c-3 0-5-2-8-2a6 6 0 0 0-4 1.528'
				}
			]
		],
		house: [
			['path', { d: 'M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8' }],
			[
				'path',
				{
					d: 'M3 10a2 2 0 0 1 .709-1.528l7-5.999a2 2 0 0 1 2.582 0l7 5.999A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'
				}
			]
		],
		image: [
			['rect', { width: '18', height: '18', x: '3', y: '3', rx: '2', ry: '2' }],
			['circle', { cx: '9', cy: '9', r: '2' }],
			['path', { d: 'm21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21' }]
		],
		info: [
			['circle', { cx: '12', cy: '12', r: '10' }],
			['path', { d: 'M12 16v-4' }],
			['path', { d: 'M12 8h.01' }]
		],
		'key-round': [
			[
				'path',
				{
					d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z'
				}
			],
			['circle', { cx: '16.5', cy: '7.5', r: '.5', fill: 'currentColor' }]
		],
		laptop: [
			[
				'path',
				{
					d: 'M20 16V7a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v9m16 0H4m16 0 1.28 2.55a1 1 0 0 1-.9 1.45H3.62a1 1 0 0 1-.9-1.45L4 16'
				}
			]
		],
		link: [
			['path', { d: 'M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71' }],
			['path', { d: 'M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71' }]
		],
		lock: [
			['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }],
			['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]
		],
		'log-out': [
			['path', { d: 'm16 17 5-5-5-5' }],
			['path', { d: 'M21 12H9' }],
			['path', { d: 'M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4' }]
		],
		mail: [
			['path', { d: 'm22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7' }],
			['rect', { x: '2', y: '4', width: '20', height: '16', rx: '2' }]
		],
		'map-pin': [
			[
				'path',
				{ d: 'M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0' }
			],
			['circle', { cx: '12', cy: '10', r: '3' }]
		],
		pause: [
			['rect', { x: '14', y: '3', width: '5', height: '18', rx: '1' }],
			['rect', { x: '5', y: '3', width: '5', height: '18', rx: '1' }]
		],
		pencil: [
			[
				'path',
				{
					d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z'
				}
			],
			['path', { d: 'm15 5 4 4' }]
		],
		play: [['path', { d: 'M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z' }]],
		plus: [
			['path', { d: 'M5 12h14' }],
			['path', { d: 'M12 5v14' }]
		],
		'qr-code': [
			['rect', { width: '5', height: '5', x: '3', y: '3', rx: '1' }],
			['rect', { width: '5', height: '5', x: '16', y: '3', rx: '1' }],
			['rect', { width: '5', height: '5', x: '3', y: '16', rx: '1' }],
			['path', { d: 'M21 16h-3a2 2 0 0 0-2 2v3' }],
			['path', { d: 'M21 21v.01' }],
			['path', { d: 'M12 7v3a2 2 0 0 1-2 2H7' }],
			['path', { d: 'M3 12h.01' }],
			['path', { d: 'M12 3h.01' }],
			['path', { d: 'M12 16v.01' }],
			['path', { d: 'M16 12h1' }],
			['path', { d: 'M21 12v.01' }],
			['path', { d: 'M12 21v-1' }]
		],
		'refresh-cw': [
			['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
			['path', { d: 'M21 3v5h-5' }],
			['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
			['path', { d: 'M8 16H3v5' }]
		],
		search: [
			['path', { d: 'm21 21-4.34-4.34' }],
			['circle', { cx: '11', cy: '11', r: '8' }]
		],
		server: [
			['rect', { width: '20', height: '8', x: '2', y: '2', rx: '2', ry: '2' }],
			['rect', { width: '20', height: '8', x: '2', y: '14', rx: '2', ry: '2' }],
			['line', { x1: '6', x2: '6.01', y1: '6', y2: '6' }],
			['line', { x1: '6', x2: '6.01', y1: '18', y2: '18' }]
		],
		settings: [
			[
				'path',
				{
					d: 'M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 3.319-1.915'
				}
			],
			['circle', { cx: '12', cy: '12', r: '3' }]
		],
		'share-2': [
			['circle', { cx: '18', cy: '5', r: '3' }],
			['circle', { cx: '6', cy: '12', r: '3' }],
			['circle', { cx: '18', cy: '19', r: '3' }],
			['line', { x1: '8.59', x2: '15.42', y1: '13.51', y2: '17.49' }],
			['line', { x1: '15.41', x2: '8.59', y1: '6.51', y2: '10.49' }]
		],
		shield: [
			[
				'path',
				{
					d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z'
				}
			]
		],
		'trash-2': [
			['path', { d: 'M10 11v6' }],
			['path', { d: 'M14 11v6' }],
			['path', { d: 'M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6' }],
			['path', { d: 'M3 6h18' }],
			['path', { d: 'M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2' }]
		],
		smartphone: [
			['rect', { width: '14', height: '20', x: '5', y: '2', rx: '2', ry: '2' }],
			['path', { d: 'M12 18h.01' }]
		],
		'triangle-alert': [
			['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
			['path', { d: 'M12 9v4' }],
			['path', { d: 'M12 17h.01' }]
		],
		unplug: [
			['path', { d: 'm19 5 3-3' }],
			['path', { d: 'm2 22 3-3' }],
			['path', { d: 'M6.3 20.3a2.4 2.4 0 0 0 3.4 0L12 18l-6-6-2.3 2.3a2.4 2.4 0 0 0 0 3.4Z' }],
			['path', { d: 'M7.5 13.5 10 11' }],
			['path', { d: 'M10.5 16.5 13 14' }],
			['path', { d: 'm12 6 6 6 2.3-2.3a2.4 2.4 0 0 0 0-3.4l-2.6-2.6a2.4 2.4 0 0 0-3.4 0Z' }]
		],
		upload: [
			['path', { d: 'M12 3v12' }],
			['path', { d: 'm17 8-5-5-5 5' }],
			['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }]
		],
		users: [
			['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }],
			['path', { d: 'M16 3.128a4 4 0 0 1 0 7.744' }],
			['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }],
			['circle', { cx: '9', cy: '7', r: '4' }]
		],
		wallet: [
			[
				'path',
				{
					d: 'M19 7V4a1 1 0 0 0-1-1H5a2 2 0 0 0 0 4h15a1 1 0 0 1 1 1v4h-3a2 2 0 0 0 0 4h3a1 1 0 0 0 1-1v-2a1 1 0 0 0-1-1'
				}
			],
			['path', { d: 'M3 5v14a2 2 0 0 0 2 2h15a1 1 0 0 0 1-1v-4' }]
		],
		x: [
			['path', { d: 'M18 6 6 18' }],
			['path', { d: 'm6 6 12 12' }]
		]
	} satisfies Record<string, Shape[]>;

	export type IconName = keyof typeof icons;
</script>

<script lang="ts">
	let {
		name,
		size = 20,
		filled = false,
		class: className
	}: {
		name: IconName;
		size?: number;
		filled?: boolean;
		/** Extra classes (spacing, colour). `icon` stays as the hook apps target. */
		class?: string;
	} = $props();
</script>

<svg
	class={['icon flex-none', className]}
	viewBox="0 0 24 24"
	width={size}
	height={size}
	fill={filled ? 'currentColor' : 'none'}
	stroke="currentColor"
	stroke-linecap="round"
	stroke-linejoin="round"
	aria-hidden="true"
	focusable="false"
>
	{#each icons[name] as [tag, attrs], i (i)}
		<svelte:element this={tag} {...attrs} />
	{/each}
</svg>

<style>
	.icon {
		stroke-width: var(--icon-stroke);
	}
</style>

<!-- The agent calls out through your router, friends call us, and nothing ever calls into your home. -->
<script lang="ts">
	import { Icon, Logo } from '@shrim/ui';

	let { host }: { host: string } = $props();
	const uid = $props.id();

	const node = 'grid content-start gap-1 rounded-lg border bg-surface p-5 shadow-sm';
</script>

<figure class="flex flex-col lg:flex-row lg:items-center">
	<div class="rounded-xl border-drop border-strong p-3 lg:w-72 lg:flex-none">
		<p class="mb-3 flex items-center gap-1.5 px-2 text-sm text-muted"><Icon name="house" size={16} />Your home</p>
		<div class={node}>
			<span class="mb-2 text-muted"><Icon name="server" size={24} /></span>
			<span class="font-medium">Your server</span>
			<span class="text-sm text-muted">Immich and the agent</span>
		</div>
		<p class="mt-3 flex items-center gap-1.5 px-2 text-sm font-medium text-success">
			<Icon name="shield" size={16} />Router: no ports open
		</p>
	</div>

	{@render arrow('connects out', 'right')}

	<div class={[node, 'lg:w-64 lg:flex-none']}>
		<span class="mb-2 text-accent"><Logo size={24} /></span>
		<span class="font-medium">{host}</span>
		<span class="text-sm text-muted">Passes the data along</span>
		<svg class="mt-3 h-6 w-full rounded-xs" aria-hidden="true">
			<filter id="{uid}-noise">
				<feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" stitchTiles="stitch" />
				<feColorMatrix type="saturate" values="0" />
			</filter>
			<rect width="100%" height="100%" filter="url(#{uid}-noise)" />
		</svg>
		<span class="mt-1 text-sm font-medium">Sees only noise</span>
	</div>

	{@render arrow('opens the link', 'left')}

	<div class={[node, 'lg:w-64 lg:flex-none']}>
		<span class="mb-2 flex gap-2 text-muted"><Icon name="smartphone" size={24} /><Icon name="laptop" size={24} /></span>
		<span class="font-medium">Your friends</span>
		<span class="text-sm text-muted">On a phone or a computer</span>
		<span class="mt-3 text-sm font-medium">No app to install</span>
	</div>

	<figcaption class="visually-hidden">
		Your server connects out to {host} through your router, and your friends open the link at {host}. Nothing connects
		into your home.
	</figcaption>
</figure>

<!-- Phones stack the boxes, so the arrow turns to point down (out to us) or up (friends in to us). -->
{#snippet arrow(label: string, to: 'right' | 'left')}
	<div
		class="flex items-center justify-center gap-2 py-3 text-sm text-muted lg:flex-1 lg:flex-col lg:gap-1.5 lg:py-0"
		aria-hidden="true"
	>
		<Icon name="chevron-right" size={16} class="text-subtle lg:hidden {to === 'right' ? 'rotate-90' : '-rotate-90'}" />
		<span class="whitespace-nowrap">{label}</span>
		<span class={['flex w-full items-center max-lg:hidden', to === 'left' && 'flex-row-reverse']}>
			<span class="h-px flex-1 bg-border-strong"></span>
			<Icon
				name={to === 'right' ? 'chevron-right' : 'chevron-left'}
				size={16}
				class="text-border-strong {to === 'right' ? '-ml-2.5' : '-mr-2.5'}"
			/>
		</span>
	</div>
{/snippet}

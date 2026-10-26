<script lang="ts">
	import { Button, Icon, IconTile, TopBar, toast, type IconName } from '@shrim/ui';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import BrandMark from '#lib/components/BrandMark.svelte';
	import HeroShots from '#lib/components/HeroShots.svelte';
	import LinkAnatomy from '#lib/components/LinkAnatomy.svelte';
	import SiteFooter from '#lib/components/SiteFooter.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const hosted = $derived(data.billing !== 'off');
	const start = $derived(data.account ? '/dashboard' : '/signup');
	const host = $derived(page.url.host);

	onMount(() => {
		if (page.url.searchParams.get('deleted') === '1') {
			toast('Your account was deleted');
			void goto('/', { replace: true, shallow: true });
		}
	});

	const why: { icon: IconName; title: string; body: string }[] = [
		{
			icon: 'map-pin',
			title: 'For the people you just met',
			body: 'Back from a trip with a great group? Send them the whole album, not the address of your server.'
		},
		{
			icon: 'users',
			title: "Everyone's photos, one album",
			body: 'After a wedding or a weekend away, friends add their shots. They land straight in your Immich.'
		},
		{
			icon: 'shield',
			title: 'Nothing to open on your router',
			body: 'The agent dials out, like your browser does. No port forwarding, no reverse proxy, no VPN for guests.'
		},
		{
			icon: 'eye-off',
			title: 'Your domain stays yours',
			body: "An Immich link shows your server's address to everyone it's forwarded to. A shrim.pics link doesn't."
		},
		{
			icon: 'cloud-off',
			title: 'No big cloud in between',
			body: 'Nothing gets copied to Google Photos or iCloud. Photos stream from your server, encrypted.'
		},
		{
			icon: 'link',
			title: 'Friends just tap the link',
			body: 'No app, no account. It opens in any browser, on a phone or a computer.'
		}
	];

	const glance = $derived<{ icon: IconName; text: string; href?: string }[]>([
		{ icon: 'lock', text: 'End-to-end encrypted' },
		{ icon: 'shield', text: 'No open ports' },
		{ icon: 'link', text: 'No app for friends' },
		{ icon: 'eye-off', text: 'No trackers' },
		{ icon: 'server', text: 'Open source, self-hostable', href: data.sourceUrl ?? '/self-host' },
		{ icon: 'map-pin', text: `Hosted in ${data.operator.region}` }
	]);

	const faq = $derived([
		{
			q: 'Do my photos leave my server?',
			a: 'Only when someone opens your link. The agent encrypts each photo on your server, it passes through shrim.pics still encrypted, and your friend’s browser unlocks it. We don’t store photos, and we can’t open them.'
		},
		{
			q: 'Do my friends need an account or an app?',
			a: 'No. They open the link in any recent browser, on a phone or a computer.'
		},
		{
			q: 'Can I stop sharing?',
			a: 'Yes, any time. Revoke the link in your agent and it stops working straight away. Deleting the share link in Immich does the same.'
		},
		{
			q: 'What happens when my server is off?',
			a: 'The album can’t open while your server or the agent is offline. Friends see a short note asking them to try again later. We don’t keep a copy anywhere.'
		},
		{
			q: 'What if I lose the link?',
			a: 'Open your agent and copy it again. If you think the wrong people have it, revoke it and make a new one. We can’t recover a link for you, because we never see the key.'
		},
		{
			q: 'Who makes shrim.pics?',
			a: 'People who run Immich at home, like you. We share our own albums with shrim.pics, so we want it to be great: simple for you, easy for your friends, and private for everyone.'
		},
		{
			q: 'Is this made by the Immich team?',
			a: 'No. shrim.pics is an independent project, not affiliated with Immich or FUTO. It works next to your Immich server and uses Immich’s own share links.'
		},
		{
			q: 'Is it really private?',
			a: 'We built it so we can’t see your photos, album names or server address. The privacy page lists exactly what we can see. The one thing you have to trust is that we serve the published code. If you’d rather not, run your own copy.'
		},
		...(hosted
			? [
					{
						q: `What does the ${data.price} pay for?`,
						a: 'Running the server that passes your photos along, and nothing else. No ads, no selling data. Cancel any time, and if you change your mind within 14 days you get your money back.'
					}
				]
			: [])
	]);

	// Wider than Page's column.
	const container = 'mx-auto w-full max-w-wide px-(--gutter)';
	const section = [container, 'mt-16 md:mt-24'];
	const card = 'flex flex-col rounded-lg border bg-surface p-6';
	const media = 'relative mb-5 aspect-16/10 overflow-hidden rounded-lg border bg-surface-sunken';
</script>

<svelte:head>
	<title>shrim.pics – Share Immich albums with a private link</title>
	<meta
		name="description"
		content="Share an Immich album with a link. Friends see the photos, never your server's address. Encrypted end to end."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:title" content="shrim.pics – Share Immich albums with a private link" />
	<meta
		property="og:description"
		content="Friends open one link and see the album. They never see your server's address, and we can't see your photos."
	/>
	<meta property="og:url" content={page.url.origin} />
	<meta property="og:image" content="{page.url.origin}/og.png" />
	<meta property="og:image:width" content="1200" />
	<meta property="og:image:height" content="630" />
	<meta property="og:image:alt" content="A shared Immich album, open in a browser and on a phone." />
	<meta name="twitter:card" content="summary_large_image" />
</svelte:head>

<div class="flex min-h-dvh flex-col">
	<TopBar border={false}>
		<a class="nav max-xs:hidden" href="/self-host">Self-host</a>
		{#if data.account}
			<Button href="/dashboard" variant="primary" size="sm">Dashboard</Button>
		{:else}
			<a class="nav" href="/login">Sign in</a>
			<Button href="/signup" variant="primary" size="sm">Get started</Button>
		{/if}
	</TopBar>

	<main class="pb-24">
		<section class={[container, 'hero grid items-center gap-12 pt-12 md:pt-20 lg:gap-16']}>
			<div>
				<h1 class="max-w-headline text-hero tracking-tighter">
					Share Immich albums with a link. Keep your server to yourself.
				</h1>
				<p class="mt-5 max-w-lead text-lg text-muted">
					Friends open one link and see the album. They can add their own photos too. They never see your server's
					address, and we can't see your photos.
				</p>
				<div class="mt-8 flex flex-wrap gap-3">
					<Button href={start} variant="primary" size="lg" class="max-xs:w-full">Get started</Button>
					<Button href="/self-host" variant="secondary" size="lg" class="max-xs:w-full">Self-host for free</Button>
				</div>
				{#if data.demo}
					<!-- A full page load, like a friend opening the link. -->
					<a class="mt-5 inline-flex items-center gap-2 font-medium text-text" href={data.demo} data-sveltekit-reload>
						<Icon name="image" size={16} class="text-subtle" />See an example album<Icon
							name="chevron-right"
							size={16}
							class="text-subtle"
						/>
					</a>
				{/if}
			</div>
			<HeroShots {host} />
		</section>

		<section class={container} aria-label="At a glance">
			<ul
				class="glance mt-12 grid gap-x-3 gap-y-4 rounded-lg border bg-surface p-5 lg:justify-between lg:px-6 lg:py-4"
				role="list"
			>
				{#each glance as g (g.text)}
					<!-- Top-aligned: on phones a fact can take two lines. -->
					<li class="flex items-start gap-2 text-sm font-medium text-text">
						<Icon name={g.icon} size={16} class="mt-0.5 text-accent-text" />
						{#if g.href}<a class="text-inherit" href={g.href}>{g.text}</a>{:else}<span>{g.text}</span>{/if}
					</li>
				{/each}
			</ul>
		</section>

		<section class={section} aria-labelledby="why">
			<h2 class="text-3xl tracking-tighter" id="why">Why people use it</h2>
			<div class="mt-8 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
				{#each why as w (w.title)}
					<div class="rounded-lg border bg-surface p-6">
						<IconTile icon={w.icon} tone="accent" />
						<h3 class="mt-5 text-lg">{w.title}</h3>
						<p class="mt-1 text-muted">{w.body}</p>
					</div>
				{/each}
			</div>
		</section>

		<section class={section} aria-labelledby="how">
			<h2 class="text-3xl tracking-tighter" id="how">How it works</h2>
			<ol class="mt-8 grid gap-6 md:grid-cols-3 md:gap-8" role="list">
				<li>
					<!-- Three narrow columns (md only): smaller type keeps the commands on one line each. -->
					<div class={[media, 'grid content-center p-6 md:max-lg:p-4']} aria-hidden="true">
						<pre class="border-0 bg-transparent p-0 mono text-sm leading-md text-text md:max-lg:text-xs"><span
								class="text-subtle">$</span
							> docker compose up -d
<span class="text-success">✔</span> shrim-agent  Started</pre>
					</div>
					{@render stepTitle(1, 'Add the agent next to Immich')}
					<p class="mt-2 text-muted">A small container that runs beside Immich and dials out to us.</p>
				</li>
				<li>
					<div class={[media, 'grid place-items-center p-4']}>
						<picture>
							<source media="(prefers-color-scheme: dark)" srcset="/landing/step-code-dark.webp" />
							<img
								class="w-full"
								src="/landing/step-code-light.webp"
								width="806"
								height="224"
								loading="lazy"
								alt="The agent showing a pairing code, waiting for approval."
							/>
						</picture>
					</div>
					{@render stepTitle(2, 'Connect it with a code')}
					<p class="mt-2 text-muted">Approve the short code it shows, and you're connected.</p>
				</li>
				<li>
					<div class={media}>
						<picture class="absolute top-6 left-6 w-7/5">
							<source media="(prefers-color-scheme: dark)" srcset="/landing/step-ready-dark.webp" />
							<img
								class="w-full rounded-tl-xl shadow-lg"
								src="/landing/step-ready-light.webp"
								width="840"
								height="398"
								loading="lazy"
								alt="The agent's “Your link is ready” window, with the share link and a Copy link button."
							/>
						</picture>
					</div>
					{@render stepTitle(3, 'Pick an album and send the link')}
					<p class="mt-2 text-muted">
						Choose what friends can do, then send the link.
						{#if data.demo}<a class="link-muted" href={data.demo} data-sveltekit-reload>See what friends get</a>{/if}
					</p>
				</li>
			</ol>
			<p class="mt-8 text-sm text-subtle">
				About ten minutes if you run Immich with Docker. <a class="link-muted" href="/self-host">Setup guide</a>
			</p>
		</section>

		<section class={section} aria-labelledby="privacy">
			<h2 class="text-3xl tracking-tighter" id="privacy">Private by design</h2>
			<div class="mt-8"><LinkAnatomy {host} /></div>
			<div class="mt-6 grid gap-6 md:grid-cols-2">
				<div class={card}>
					<h3>We can't see</h3>
					<ul class="mt-4 grid gap-3" role="list">
						{@render point('lock', 'Your photos and videos')}
						{@render point('lock', 'Album names and descriptions')}
						{@render point('lock', 'File names, dates and places')}
						{@render point('lock', "Your server's address")}
					</ul>
				</div>
				<div class={card}>
					<h3>We can see</h3>
					<ul class="mt-4 grid gap-3" role="list">
						{@render point('eye', "That a link exists, and when it's opened")}
						{@render point('eye', 'How many files pass through, and how big')}
						{@render point('eye', 'When your agent is online')}
						{@render point('eye', 'Your email address and payment status')}
					</ul>
					<a class="mt-6 self-start text-sm link-muted" href="/privacy">Privacy policy</a>
				</div>
			</div>
		</section>

		{#if hosted}
			<section class={section} aria-labelledby="pricing">
				<h2 class="text-3xl tracking-tighter" id="pricing">Pricing</h2>
				<div class="mt-8 grid gap-6 md:grid-cols-2">
					<div class={card}>
						<h3>shrim.pics</h3>
						{@render price(data.price, 'a year')}
						<ul class="mt-4 mb-6 grid flex-1 content-start gap-3" role="list">
							{@render point('check', 'As many links and albums as you like')}
							{@render point('check', 'Friends can add photos')}
							{@render point('check', 'We run the server in the middle, you run the agent')}
							{@render point('check', 'Cancel any time, full refund within 14 days')}
						</ul>
						<Button href={start} variant="primary" full>Get started</Button>
					</div>
					<div class={card}>
						<h3>On your own server</h3>
						{@render price('Free', 'forever')}
						<ul class="mt-4 mb-6 grid flex-1 content-start gap-3" role="list">
							{@render point('check', 'Run every part yourself')}
							{@render point('check', 'Use your own domain')}
							{@render point('check', 'The same apps and the same encryption')}
						</ul>
						<Button href="/self-host" variant="secondary" full>Read the self-host guide</Button>
					</div>
				</div>
			</section>
		{/if}

		{#if data.operator.name}
			<p class={[container, 'mt-6 text-sm text-muted']}>
				{host} is made and run by {data.operator.name}.
				{#if data.operator.email}<a href="mailto:{data.operator.email}">{data.operator.email}</a>{/if}
			</p>
		{/if}

		<section class={section} aria-labelledby="faq">
			<h2 class="text-3xl tracking-tighter" id="faq">Questions</h2>
			<div class="mt-8 max-w-measure border-t">
				{#each faq as item (item.q)}
					<details class="group border-b">
						<summary
							class="flex cursor-pointer list-none items-center justify-between gap-4 py-4 font-medium [&::-webkit-details-marker]:hidden"
							>{item.q}<Icon
								name="chevron-right"
								size={16}
								class="text-subtle transition-transform group-open:rotate-90"
							/></summary
						>
						<p class="pb-5 text-muted">{item.a}</p>
					</details>
				{/each}
			</div>
		</section>

		<section class={section}>
			<div class="grid justify-items-center gap-3 rounded-xl border bg-surface px-6 py-12 text-center">
				<BrandMark size="lg" />
				<h2 class="mt-2 text-3xl tracking-tighter">Ready to share an album?</h2>
				<p class="text-muted">
					Setup takes about ten minutes. {hosted ? `${data.price} a year, or free on your own server.` : ''}
				</p>
				<div class="mt-4 flex flex-wrap justify-center gap-3 max-xs:w-full">
					<Button href={start} variant="primary" size="lg" class="max-xs:w-full">Get started</Button>
					<Button href="/self-host" size="lg" class="max-xs:w-full">Self-host for free</Button>
				</div>
			</div>
		</section>
	</main>

	<SiteFooter />
</div>

{#snippet stepTitle(n: number, text: string)}
	<h3 class="flex items-center gap-3 text-lg">
		<span
			class="inline-grid size-7 flex-none place-items-center rounded-full border border-strong text-sm font-semibold text-muted"
			aria-hidden="true">{n}</span
		>{text}
	</h3>
{/snippet}

{#snippet point(icon: IconName, text: string)}
	<li class="flex items-start gap-3"><Icon name={icon} size={16} class="mt-1 text-subtle" />{text}</li>
{/snippet}

<!-- The price line keeps the big figure's line height: the small unit sits on its baseline. -->
{#snippet price(amount: string, unit: string)}
	<p class="mt-2 flex items-baseline gap-2 text-3xl font-semibold tracking-tighter">
		{amount}<span class="text-md leading-3xl font-regular tracking-normal text-muted">{unit}</span>
	</p>
{/snippet}

<style>
	.glance {
		grid-template-columns: repeat(2, minmax(0, 1fr));
	}

	@media (min-width: 640px) {
		.glance {
			grid-template-columns: repeat(3, minmax(0, 1fr));
		}
	}

	@media (min-width: 1024px) {
		.hero {
			grid-template-columns: 5fr 6fr;
		}

		.glance {
			grid-template-columns: repeat(6, auto);
		}
	}
</style>

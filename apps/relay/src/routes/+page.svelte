<script lang="ts">
	import { Button, Icon, TopBar, toast, type IconName } from '@shrim/ui';
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import HeroShots from '#lib/components/HeroShots.svelte';
	import ConnectionDiagram from '#lib/components/ConnectionDiagram.svelte';
	import NoiseReveal from '#lib/components/NoiseReveal.svelte';
	import displayFont from '@shrim/ui/assets/fonts/familjen-grotesk.woff2?url';
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

	const why: { title: string; body: string }[] = [
		{
			title: 'Share an album with anyone',
			body: "Send friends and family a link. They see the photos, but never your server's address or domain."
		},
		{
			title: 'No ports to open',
			body: "Works even if Immich is only reachable at home or over a VPN. The agent connects out, so there's nothing to forward or expose."
		},
		{
			title: 'Encrypted end to end',
			body: "Photos are encrypted on your server and only unlocked in your friends' browsers. We can't see them."
		},
		{
			title: 'Nothing to install for friends',
			body: 'The link opens in any browser, on a phone or a computer. No app, no account.'
		},
		{
			title: 'Friends can add their photos',
			body: 'If you allow it, friends upload their photos from a wedding or a trip straight into your Immich album.'
		},
		{
			title: 'You stay in control',
			body: 'Your photos stay on your server. Set an expiry date, or turn a link off at any time.'
		}
	];

	const seville = [
		['plaza-de-espana', 'Plaza de España, with its canal and towers'],
		['tapas', 'Tapas on a bar counter'],
		['plaza-tiles', 'Tiled benches at Plaza de España'],
		['orange-trees', 'An orange tree in front of a yellow building'],
		['triana', 'Houses with balconies, painted white and yellow'],
		['cathedral-arch', 'The cathedral through a Moorish arch'],
		['market', 'A market stall with oranges'],
		['plaza-arches', 'Arches framing the tower of Plaza de España']
	].map(([name, alt]) => ({ src: `/landing/seville/${name}.webp`, alt }));

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
			q: 'Can my family use it too?',
			a: `Yes. Everyone with an account on your Immich server signs in to the agent with their own Immich account and shares their own albums.${hosted ? ' One plan covers the whole server.' : ''}`
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
			a: 'Copy it again from your agent, or from the share link’s description in Immich. If you think the wrong people have it, revoke it and make a new one. We can’t recover a link for you, because we never see the key.'
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
	const media = 'relative mb-5 aspect-16/10 overflow-hidden rounded-lg border bg-surface-sunken';
</script>

<svelte:head>
	<title>shrim.pics – Share Immich albums with a private link</title>
	<link rel="preload" href={displayFont} as="font" type="font/woff2" crossorigin="anonymous" />
	<meta
		name="description"
		content="Share an Immich album with a link. Friends see the photos, never your server's address. Encrypted end to end."
	/>
	<meta property="og:type" content="website" />
	<meta property="og:title" content="shrim.pics – Share Immich albums with a private link" />
	<meta
		property="og:description"
		content="No public domain, no open ports, nothing exposed to the internet. Friends just open a link, and only they can see the photos."
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
		{#if hosted}<a class="nav max-xs:hidden" href="#pricing">Pricing</a>{/if}
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
				<h1 class="max-w-headline font-display text-hero tracking-tighter">
					Share Immich albums with a link. Keep your server private.
				</h1>
				<p class="mt-5 max-w-lead text-lg text-muted">
					No public domain, no open ports, nothing exposed to the internet. Friends just open a link, and only they can
					see the photos.
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
			<HeroShots {host} demo={data.demo} />
		</section>

		<section class={section} aria-labelledby="why">
			<h2 class="font-display text-3xl tracking-tighter" id="why">Why people use it</h2>
			<dl class="mt-10 grid gap-x-12 gap-y-9 md:grid-cols-2 lg:grid-cols-3">
				{#each why as w (w.title)}
					<div class="max-w-measure">
						<dt class="text-lg font-semibold">{w.title}</dt>
						<dd class="mt-2 text-muted">{w.body}</dd>
					</div>
				{/each}
			</dl>
		</section>

		<section class={section} aria-labelledby="noise">
			<h2 class="font-display text-3xl tracking-tighter" id="noise">We see noise. Your friends see the photos.</h2>
			<p class="mt-3 max-w-lead text-muted">
				Your photos are encrypted before they leave your server, so {host} only ever gets encrypted data.
			</p>
			<div class="mt-6">
				<NoiseReveal photos={seville} keyText="#k8Fz2pQwR7" />
				<div class="mt-3 flex justify-between gap-4 text-sm text-muted">
					<span>What reaches {host}</span>
					<span class="text-right">What your friends see</span>
				</div>
			</div>
			<p class="mt-10 mono text-xl wrap-anywhere lg:text-2xl">
				<span class="visually-hidden">Example share link: </span><span class="text-subtle">https://</span
				>{host}/s/Xk3f9QaPz2<wbr /><span class="text-accent-text">#k8Fz2pQwR7vLm3xY</span>
			</p>
			<p class="mt-4 max-w-lead text-lg">
				Everything after the <span class="text-accent-text">#</span> is the key. Browsers never send it to a server, so we
				can't see your photos, album names or file details, even if we wanted to.
			</p>
			<p class="mt-4 max-w-lead text-sm text-subtle">
				We only see that a link exists, when it's opened and how much data passes through. {#if data.demo}Check it
					yourself: open the <a href={data.demo} data-sveltekit-reload>example album</a> with your browser's network panel
					open.{/if}
				The <a href="/privacy">privacy policy</a> has the details.
			</p>
		</section>

		<section class={section} aria-labelledby="ports">
			<h2 class="font-display text-3xl tracking-tighter" id="ports">No ports to open</h2>
			<p class="mt-3 max-w-lead text-muted">
				The agent connects out to {host}, like your browser does. No port forwarding, no reverse proxy, and your home
				address stays private.
			</p>
			<div class="mt-8"><ConnectionDiagram {host} /></div>
		</section>

		<section class={section} aria-labelledby="how">
			<h2 class="font-display text-3xl tracking-tighter" id="how">Set it up in three steps</h2>
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
					<div class={[media, 'grid content-center p-6 md:max-lg:p-4']} aria-hidden="true">
						<pre
							class="border-0 bg-transparent p-0 mono text-sm leading-md text-text md:max-lg:text-xs">SHRIM_SETUP_TOKEN: <span
								class="text-accent-text">shr_setup_7Kq…</span
							>
<span class="text-success">●</span> Connected to shrim.pics</pre>
					</div>
					{@render stepTitle(2, 'It connects to your account')}
					<p class="mt-2 text-muted">The snippet from your dashboard carries a one-time token. No code to type.</p>
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
					{@render stepTitle(3, 'Share an album')}
					<p class="mt-2 text-muted">
						Pick an album in the agent, or share it in Immich as usual: the link to send shows up in its description.
						{#if data.demo}<a class="link-muted" href={data.demo} data-sveltekit-reload>See what friends get</a>{/if}
					</p>
				</li>
			</ol>
			<p class="mt-8 text-sm text-subtle">
				About ten minutes if you run Immich with Docker. <a class="link-muted" href="/self-host">Setup guide</a>
			</p>
		</section>

		{#if hosted}
			<section class={section} aria-labelledby="pricing">
				<h2 class="font-display text-3xl tracking-tighter" id="pricing">Pricing</h2>
				<div class="mt-10 grid gap-x-12 gap-y-12 md:grid-cols-2">
					<div class="flex flex-col">
						<h3>shrim.pics</h3>
						{@render price(data.price, data.vatIncluded ? 'a year, incl. VAT' : 'a year')}
						<ul class="mt-4 mb-6 grid flex-1 content-start gap-3" role="list">
							{@render point('check', 'Everyone on your Immich server, one plan')}
							{@render point('check', 'As many links and albums as you like')}
							{@render point('check', 'Friends can add photos')}
							{@render point('check', 'We run the server in the middle, you run the agent')}
							{@render point('check', 'Cancel any time, full refund within 14 days')}
						</ul>
						<Button href={start} variant="primary" class="self-start">Get started</Button>
					</div>
					<div class="flex flex-col md:border-l md:pl-12">
						<h3>On your own server</h3>
						{@render price('Free', 'forever')}
						<ul class="mt-4 mb-6 grid flex-1 content-start gap-3" role="list">
							{@render point('check', 'Run every part yourself')}
							{@render point('check', 'Use your own domain')}
							{@render point('check', 'The same apps and the same encryption')}
						</ul>
						<Button href="/self-host" variant="secondary" class="self-start">Read the self-host guide</Button>
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
			<h2 class="font-display text-3xl tracking-tighter" id="faq">Questions</h2>
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

		<section class={section} aria-labelledby="start">
			<h2 class="font-display text-4xl tracking-tighter" id="start">Try it with one album.</h2>
			<p class="mt-3 max-w-lead text-lg text-muted">
				Setup takes about ten minutes. Friends need nothing but the link.
			</p>
			<div class="mt-8 flex flex-wrap gap-3">
				<Button href={start} variant="primary" size="lg" class="max-xs:w-full">Get started</Button>
				<Button href="/self-host" size="lg" class="max-xs:w-full">Self-host for free</Button>
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
	<p class="mt-2 flex items-baseline gap-2 font-display text-3xl font-semibold tracking-tighter">
		{amount}<span class="font-sans text-md leading-3xl font-regular tracking-normal text-muted">{unit}</span>
	</p>
{/snippet}

<style>
	@media (min-width: 1024px) {
		.hero {
			grid-template-columns: 5fr 6fr;
		}
	}
</style>

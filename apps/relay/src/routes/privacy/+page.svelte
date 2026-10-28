<script lang="ts">
	import { page } from '$app/state';
	import Fill from '#lib/components/Fill.svelte';
	import Prose from '#lib/components/Prose.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const op = $derived(data.operator);
	const host = $derived(page.url.host);
	const paid = $derived(data.billing !== 'off');
</script>

<Prose title="Privacy">
	<p class="text-sm leading-prose text-subtle">Last updated <Fill value={op.termsDate} env="SHRIM_TERMS_DATE" /></p>

	<p>
		{host} is built so that we can't see what you share. This page explains, in plain words, the little we do see, why, how
		long we keep it, and what you can do about it.
	</p>

	<h2>The short version</h2>
	<ul>
		<li>Your photos, videos, album names, captions, dates and places are encrypted. We can't read them.</li>
		<li>
			We keep what's needed to run your account: your email,{paid ? ' your plan,' : ''} and a few facts about each link.
		</li>
		<li>No ads, no trackers, no analytics, nothing loaded from other companies.</li>
		<li>One cookie, only to keep you signed in.</li>
		<li>You can download your data or delete your account from your dashboard at any time.</li>
	</ul>

	<h2>Who is responsible</h2>
	<p>
		<strong><Fill value={op.name} env="SHRIM_OPERATOR_NAME" /></strong>,
		<Fill value={op.address} env="SHRIM_OPERATOR_ADDRESS" />, is responsible for your data (the "controller"). For any
		privacy question or request, write to <Fill value={op.email} env="SHRIM_OPERATOR_EMAIL" />.
	</p>

	<h2>What we can't see</h2>
	<p>
		Everything in a shared album is encrypted on your server before it leaves your home, and decrypted in the browser of
		the person opening the link. The key is the part of the link after the <strong>#</strong>, and browsers never send
		that part to any server, including ours. So we can't see:
	</p>
	<ul>
		<li>your photos and videos, or anything friends upload;</li>
		<li>album names, descriptions, file names, dates, camera details and places;</li>
		<li>the address of your Immich server.</li>
	</ul>
	<p>
		The one exception: if someone sends us the full link, key included, we can open that album like anyone else with the
		link. That only happens when someone reports a link (see below).
	</p>

	<h2>What we keep, and why</h2>

	<h3>Your account</h3>
	<p>
		Your email address, your password (stored scrambled with a one-way hash, so even we can't read it), when you signed
		up{paid ? ', and the state of your plan' : ''}. We need these to run your account{paid ? ' and your plan' : ''} (the contract
		between us). Kept until you delete your account.
	</p>

	<h3>Your agent</h3>
	<p>
		A scrambled copy of your agent's connection token, when it was made, and when your agent was last online. We use
		this to connect your agent and to show you its status. Kept until you delete your account.
	</p>

	<h3>Your links</h3>
	<p>
		For each link: a random ID, when it was made, when it expires, whether it allows uploads, whether it was turned off,
		how often it was opened, and how much data went through it. Not what's inside. We use this to run the links, to show
		you how they're used, and to keep the service fair. Kept until you delete your account.
	</p>

	{#if paid}
		<h3>Payments</h3>
		<p>
			Payments are handled by Stripe. Your card details go straight to Stripe; we never see them. We only keep your
			Stripe customer number and whether your plan is paid up. Stripe keeps invoices and payment records for as long as
			tax law requires, and is responsible for that under its own <a href="https://stripe.com/privacy" rel="noreferrer"
				>privacy policy</a
			>.
		</p>
	{/if}

	<h3>Reports</h3>
	<p>
		When someone reports a link, we keep the full link they sent, the reason, their message and, if they give it, their
		email address. We need this to handle the report and meet our legal duties. Kept until the report is closed, then
		for 12 months, then deleted.
	</p>

	<h3>Internet addresses</h3>
	<p>
		Like every website, our server sees the internet address (IP) of everyone who connects, including people opening
		links. We use it only to stop abuse, by limiting how many requests come from one address. We hold it in memory for a
		few minutes and don't write it to logs.
	</p>

	{#if data.mail}
		<h3>Emails</h3>
		<p>
			We only email you about your account: a link when you ask to reset your password, and a short note when your
			password changes. No newsletters, no marketing, no tracking in the emails. We don't keep copies of them.
		</p>
	{/if}

	<h3>Backups</h3>
	<p>We make a daily copy of our database to protect against accidents. Copies are kept for 14 days, then deleted.</p>

	<h2>Cookies</h2>
	<p>
		We use one cookie, <code>shrim_session</code>, to keep you signed in. It's strictly necessary, so we don't need to
		ask for consent. No other cookies, and nothing on the album pages.
	</p>

	<h2>Who else is involved</h2>
	<ul>
		<li>
			<strong>Hosting:</strong>
			<Fill value={op.hosting} env="SHRIM_HOSTING" />.{op.region ? ` Our servers are in ${op.region}.` : ''}
		</li>
		{#if data.mail}
			<li>
				<strong>Email:</strong>
				{#if op.mailProvider}{op.mailProvider} sends{:else}Our mail provider sends{/if} our account emails. It sees your email
				address and the message, and nothing else.
			</li>
		{/if}
		{#if paid}
			<li>
				<strong>Payments:</strong> Stripe Payments Europe, Ltd., Ireland. Stripe may process some data in the United States,
				protected by the EU–US Data Privacy Framework and the EU's standard contractual clauses.
			</li>
		{/if}
	</ul>
	<p>We don't sell your data and we don't share it with anyone else, unless the law requires us to.</p>

	<h2>Keeping it safe</h2>
	<p>
		Everything you share is encrypted end to end. Connections to {host} use HTTPS. Passwords and tokens are stored as one-way
		hashes. Only the people who run the service can reach the servers.
	</p>
	<p>
		One honest limit: the page that decrypts photos is served by {host}. If someone took over this site, they could
		change that page. That's true of every website that encrypts in the browser. The code is open source, so it can be
		checked, and you can <a href="/self-host">run your own copy</a> instead.
	</p>

	<h2>Your rights</h2>
	<p>You can, at any time:</p>
	<ul>
		<li>see and download your data (<strong>Download my data</strong> on your dashboard);</li>
		<li>delete your account and everything tied to it (<strong>Delete account</strong> on your dashboard);</li>
		<li>ask us to correct something, limit what we do with it, or object to it;</li>
		<li>ask any question about how we handle your data.</li>
	</ul>
	<p>
		Write to <Fill value={op.email} env="SHRIM_OPERATOR_EMAIL" /> and we'll answer within a month. If you're not happy with
		our answer, you can complain to a data protection authority, in the country where you live or where we're based{#if op.authority}
			({op.authority}){/if}.
	</p>

	<h2>Children</h2>
	<p>Accounts are for adults (18 and over). We don't knowingly collect data about children.</p>

	<h2>Changes</h2>
	<p>
		If we change this policy in a way that matters, we'll email account holders before it applies and update the date at
		the top.
	</p>
</Prose>

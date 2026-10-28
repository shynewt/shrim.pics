<script lang="ts">
	import { page } from '$app/state';
	import Fill from '#lib/components/Fill.svelte';
	import Prose from '#lib/components/Prose.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const op = $derived(data.operator);
	const host = $derived(page.url.host);
	const paid = $derived(data.billing !== 'off');
	/** Section numbers: without billing, the two sections on payment and refunds are left out. */
	const n = (section: number) => (paid || section < 4 ? section : section - 2);
</script>

<Prose title="Terms">
	<p class="text-sm leading-prose text-subtle">Last updated <Fill value={op.termsDate} env="SHRIM_TERMS_DATE" /></p>

	<p>
		These terms are the agreement between you and us when you use {host}. We've kept them short and in plain words. If
		anything is unclear, write to us and we'll explain.
	</p>

	<h2>1. Who we are</h2>
	<p>
		{host} is run by <strong><Fill value={op.name} env="SHRIM_OPERATOR_NAME" /></strong>,
		<Fill value={op.address} env="SHRIM_OPERATOR_ADDRESS" />{#if op.registration}, {op.registration}{/if}. You can reach
		us at
		<Fill value={op.email} env="SHRIM_OPERATOR_EMAIL" />.
	</p>

	<h2>2. What the service does</h2>
	<p>
		You run a small program, the agent, next to your Immich server. It lets you make links to your albums that work for
		anyone, without opening your server to the internet. Photos are encrypted on your server and decrypted in the
		browser of whoever opens the link. We pass the encrypted data along; we don't store your photos.
	</p>
	<p>
		People who open a link don't need an account and don't have to accept these terms to look at photos. These terms are
		for account holders.
	</p>

	<h2>3. Your account</h2>
	<ul>
		<li>You need to be at least 18 to open an account.</li>
		<li>
			Use an email address you can read. We use it for important messages about your account{paid
				? ' and your plan'
				: ''}.
		</li>
		<li>
			Keep your password and your agent's connection safe. Links made with your agent count as yours, so tell us
			straight away if you think someone else got access.
		</li>
	</ul>

	{#if paid}
		<h2>4. Price, payment and renewal</h2>
		<ul>
			<li>
				The plan costs <strong>{data.price} a year</strong>, including VAT where it applies. You pay up front, through
				our payment provider Stripe.
			</li>
			<li>
				Your plan renews every year until you cancel. You'll get a reminder by email before each renewal, so it never
				comes as a surprise.
			</li>
			<li>
				You can cancel any time from your dashboard, under <strong>Manage billing</strong>. Your links keep working
				until the end of the year you've paid for, and you won't be charged again.
			</li>
			<li>
				If we ever change the price, we'll tell you at least 30 days before it applies to you. It only applies from your
				next renewal, and you can cancel before then.
			</li>
		</ul>

		<h2>5. Changed your mind? 14 days, full refund</h2>
		<p>
			If you're not happy, cancel within 14 days of paying, for your first year or a renewal, and we'll refund you in
			full. Use "Cancel and refund" on your dashboard or write to us. No questions asked, and no need to give a reason.
			This covers your legal right to withdraw from the contract, and goes a little further.
		</p>
	{/if}

	<h2>{n(6)}. Your photos</h2>
	<ul>
		<li>Your photos stay yours. You don't give us any rights to them.</li>
		<li>Only share what you have the right to share, and think about the people in your photos.</li>
		<li>
			We can't see your albums. The only way to see a shared album is with its full link, including the key after the #.
			We only ever see an album if someone sends us that full link, for example in a report, just like anyone else you
			gave the link to.
		</li>
		<li>Your photos live on your server, not ours. Keep your own backups.</li>
	</ul>

	<h2>{n(7)}. What's not allowed</h2>
	<ul>
		<li>Anything illegal, in your country or where people open your links.</li>
		<li>Any sexual content involving minors. We report it to the authorities.</li>
		<li>Intimate or private photos of people who haven't agreed to it.</li>
		<li>Harassment, threats, or content meant to hurt someone.</li>
		<li>Malware, scams, phishing or spam.</li>
		<li>Trying to break, overload or get around the service, or reselling it.</li>
	</ul>

	<h2>{n(8)}. Reports, and what we do about them</h2>
	<p>
		Anyone can report a link at <a href="/report">{host}/report</a>. We ask for the full link, so we can open that one
		album and check what's going on before we act. Then we may:
	</p>
	<ul>
		<li>do nothing, if the report doesn't hold up;</li>
		<li>turn the link off;</li>
		<li>suspend your account, for serious or repeated problems.</li>
	</ul>
	<p>
		If we act on your link or account, we'll tell you what we did and why, unless the law stops us. You can reply and
		ask us to look again, and a person, not a machine, will review it. We may also have to pass information to the
		authorities when the law requires it.
	</p>

	<h2>{n(9)}. Keeping the service running</h2>
	<ul>
		<li>Your links only work while your own server and agent are on and connected.</li>
		<li>
			We work hard to keep {host} running, but we can't promise it will never be down. We may need short breaks for maintenance.
		</li>
		<li>
			We may improve or change features. If we ever close the service, we'll tell you at least 60 days ahead{paid
				? ' and refund the unused part of your year'
				: ''}.
		</li>
	</ul>

	<h2>{n(10)}. Open source</h2>
	<p>
		The software is open source under the GNU AGPL 3.0 license, and you're free to <a href="/self-host"
			>run your own copy</a
		>. These terms only cover the service we run at {host}.
	</p>

	<h2>{n(11)}. Responsibility</h2>
	<p>
		We are responsible to you as the law says. Nothing in these terms limits our responsibility for intent or gross
		negligence, for harm to life, body or health, or any right you have as a consumer that can't be waived.
	</p>
	<p>
		Beyond that, if we're slightly negligent we're only responsible when we break an essential duty of this agreement,
		only for damage that was foreseeable{paid ? ', and up to the amount you paid us in the 12 months before' : ''}. We
		don't keep your photos, so we can't be responsible for losing them.
	</p>

	<h2>{n(12)}. Ending the agreement</h2>
	<ul>
		<li>
			You can delete your account any time from your dashboard.{paid
				? " That also cancels your plan. Apart from the 14-day refund above, the rest of the year isn't refunded."
				: ''}
		</li>
		<li>
			We can end the agreement straight away if you seriously or repeatedly break these terms. Otherwise we'll give you
			30 days' notice{paid ? ' and refund the unused part of your year' : ''}.
		</li>
	</ul>

	<h2>{n(13)}. Changes to these terms</h2>
	<p>
		If we change these terms in a way that matters, we'll email you at least 30 days before. If you don't agree, you can {#if paid}cancel
			before the change applies and we'll refund the unused part of your year{:else}delete your account before the
			change applies{/if}.
	</p>

	<h2>{n(14)}. Law and disputes</h2>
	<p>
		These terms are governed by the law of <Fill value={op.country} env="SHRIM_OPERATOR_COUNTRY" />. If you're a
		consumer living elsewhere in the EU, you keep the protection of the laws of your own country that can't be set
		aside, and you can go to your local courts.
	</p>
	<p>
		If something goes wrong, please write to us first. Most things are easy to fix.{#if op.mediator}
			If we can't sort it out together, you can turn to our consumer mediator for free: {op.mediator}.{/if}
	</p>

	<h2>{n(15)}. Contact</h2>
	<p>
		<Fill value={op.name} env="SHRIM_OPERATOR_NAME" />, <Fill value={op.address} env="SHRIM_OPERATOR_ADDRESS" />,
		<Fill value={op.email} env="SHRIM_OPERATOR_EMAIL" />.
	</p>
</Prose>

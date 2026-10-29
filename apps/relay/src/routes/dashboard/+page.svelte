<script lang="ts">
	import {
		Button,
		CodeBlock,
		CodeInput,
		Dialog,
		EasyId,
		EmptyState,
		Field,
		formatDate,
		formatRelative,
		Icon,
		IconTile,
		MetaList,
		Notice,
		Panel,
		SecretInput,
		SettingRow,
		SettingsList,
		Spinner,
		Steps,
		toast,
		TopBar,
		type IconName,
		type Step
	} from '@shrim/ui';
	import { onMount, type Snippet } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto, refreshAll } from '$app/navigation';
	import Page from '#lib/components/Page.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const DELETE_ERRORS = {
		password: "That password isn't right.",
		rate: 'Too many attempts. Wait a minute and try again.',
		billing: "We couldn't cancel your plan with Stripe, so nothing was deleted. Try again in a moment."
	};
	const REFUND_ERRORS = {
		not_eligible: "This plan can't be refunded from here anymore.",
		stripe: "Stripe didn't answer. Try again in a moment."
	};

	let activating = $state(false);
	let confirmDisconnect = $state(false);
	let disableId = $state<string | null>(null);
	let disabling = $state(false);
	let confirmDelete = $state(false);
	let deleting = $state(false);
	let confirmRefund = $state(false);
	let refunding = $state(false);

	const hosted = $derived(data.billing !== 'off');
	const planOk = $derived(
		!hosted || data.plan.status === 'active' || data.plan.status === 'ending' || data.plan.status === 'past_due'
	);
	// First run only: once there are links, a disconnected agent shows on the normal dashboard.
	const setup = $derived((!data.agent.everSeen && !data.agent.connecting && data.shares.length === 0) || !planOk);
	const live = $derived(data.shares.filter((s) => s.state === 'live').length);

	// Made once per visit: the page refreshes while it waits, and the snippet mustn't change under a copy.
	let setupToken = $state<string | null>(null);
	let setupTokenFailed = $state(false);
	let setupTokenAsked = false;

	const compose = $derived(
		[
			'services:',
			'  shrim-agent:',
			`    image: ${data.agentImage}`,
			'    environment:',
			'      IMMICH_URL: http://immich-server:2283',
			...(data.ownRelay ? [`      SHRIM_RELAY_URL: ${data.relayUrl}`] : []),
			...(setupToken ? [`      SHRIM_SETUP_TOKEN: ${setupToken}`] : []),
			'    ports:',
			'      - 127.0.0.1:2284:3000',
			'    volumes:',
			'      - ./shrim:/data',
			'    restart: always'
		].join('\n')
	);

	// Never wider than the step: the compose file scrolls on phones instead of widening the page.
	const stepBody = 'grid grid-cols-1 justify-items-start gap-3 [&>.code-block]:w-full';

	const opened = (n: number) => (n === 0 ? 'Not opened yet' : n === 1 ? 'Opened once' : `Opened ${n} times`);

	onMount(() => {
		if (data.paid) {
			toast('Plan active');
			void goto('/dashboard', { replace: true, reset: false });
		}
		// Back from Checkout before Stripe told us: check again for a little while.
		if (data.pending) {
			let tries = 0;
			const t = setInterval(() => {
				void refreshAll().then(() => {
					if (planOk || ++tries > 15) clearInterval(t);
				});
			}, 2000);
			return () => clearInterval(t);
		}
	});

	$effect(() => {
		if (!setup || data.agent.everSeen || setupTokenAsked) return;
		setupTokenAsked = true;
		fetch('/dashboard/setup-token', { method: 'POST' })
			.then((res) => (res.ok ? (res.json() as Promise<{ token: string }>) : Promise.reject(new Error())))
			.then((r) => (setupToken = r.token))
			.catch(() => (setupTokenFailed = true));
	});

	$effect(() => {
		if (data.agent.everSeen) return;
		const t = setInterval(() => void refreshAll(), 4000);
		return () => clearInterval(t);
	});

	const setupSteps = $derived.by((): Step[] => {
		const steps: Step[] = [
			{
				title: 'Add the agent next to Immich',
				state: data.agent.everSeen ? 'done' : 'current',
				summary: data.agent.everSeen ? 'Done.' : undefined,
				body: addAgent
			},
			{
				title: 'Connect your agent',
				state: data.agent.everSeen ? 'done' : 'current',
				summary: data.agent.everSeen
					? `Agent connected on ${formatDate(data.agent.connectedAt ?? Date.now())}.`
					: undefined,
				body: connectAgent
			}
		];
		if (hosted) {
			steps.push({
				title: 'Subscribe',
				state: planOk ? 'done' : 'current',
				summary: planOk ? subscribed : undefined,
				body: subscribe
			});
		}
		return steps;
	});
</script>

<svelte:head><title>{setup ? 'Get set up' : 'Dashboard'} – shrim.pics</title></svelte:head>

{#snippet addAgent()}
	<div class={stepBody}>
		<p>
			Add this to the <code>docker-compose.yml</code> that runs Immich, then run <code>docker compose up -d</code>. The
			agent connects to your account by itself.
		</p>
		{#if setupToken || setupTokenFailed}
			<CodeBlock code={compose} />
		{:else}
			<p class="flex items-center gap-2 text-sm text-muted"><Spinner size={16} />Preparing your snippet…</p>
		{/if}
		<p class="text-sm text-muted">
			{#if setupToken}
				The setup token works once, within 24 hours. Reload this page for a new one.
			{:else if setupTokenFailed}
				We couldn't make a setup token, so connect with a code in the next step.
			{/if}
			Change <code>IMMICH_URL</code> if your Immich service has another name.{#if data.ownRelay}
				<code>SHRIM_RELAY_URL</code> points the agent at this server.{/if}
		</p>
	</div>
{/snippet}

{#snippet connectAgent()}
	<div class={stepBody}>
		<p class="flex items-center gap-2 text-muted" role="status"><Spinner size={16} />Waiting for your agent…</p>
		<p class="text-sm text-muted">
			Started it without the setup token? Open <code>http://localhost:2284</code> on that machine, sign in as an Immich admin
			and enter the code it shows:
		</p>
		{@render codeForm(false)}
	</div>
{/snippet}

<!-- `stretch`: on phones the input takes the row (the reconnect banner). -->
{#snippet codeForm(stretch: boolean)}
	<form class={['flex gap-2', stretch && 'w-full sm:w-auto']} method="POST" action="/connect?/lookup">
		<label class="visually-hidden" for="code">Code</label>
		<CodeInput id="code" class={[stretch && 'max-sm:min-w-0 max-sm:flex-1']} />
		<Button type="submit">Connect</Button>
	</form>
{/snippet}

{#snippet subscribe()}
	<div class={stepBody}>
		{#if data.billing === 'dev'}
			<p>Test mode: no payment is taken.</p>
			{@render activateForm(data.agent.everSeen ? 'primary' : 'secondary')}
		{:else}
			<p>
				{data.price} a year{data.vatIncluded ? ', incl. VAT' : ''}. Cancel any time. Full refund within 14 days.
			</p>
			{#if data.cancelled}<p class="text-sm text-muted">Checkout was cancelled. Nothing was charged.</p>{/if}
			<form method="POST" action="?/checkout">
				<Button type="submit" variant={data.agent.everSeen ? 'primary' : 'secondary'}
					>Subscribe for {data.price} a year</Button
				>
			</form>
		{/if}
	</div>
{/snippet}

{#snippet subscribed()}
	{@const until = formatDate(data.plan.activeUntil ?? Date.now())}
	{data.plan.status === 'ending'
		? `Plan ends ${until}.`
		: data.plan.status === 'past_due'
			? "We couldn't charge your card."
			: `Plan active until ${until}.`}
	{#if data.plan.manageable}
		<form method="POST" action="?/portal" class="inline">
			<button type="submit" class="link-accent">Manage billing</button>
		</form>
	{/if}
{/snippet}

{#snippet activateForm(variant: 'primary' | 'secondary')}
	<form
		method="POST"
		action="?/activate"
		use:enhance={() => {
			activating = true;
			return async ({ result, update }) => {
				await update();
				activating = false;
				if (result.type === 'success') toast('Plan active');
			};
		}}
	>
		<Button type="submit" {variant} loading={activating}
			>{activating ? 'Activating…' : 'Activate plan (test mode)'}</Button
		>
	</form>
{/snippet}

<Page>
	{#snippet topbar()}
		<TopBar width="content">
			{#if data.account?.admin}<a class="nav" href="/admin">Reports</a>{/if}
			<span class="min-w-0 truncate text-sm text-subtle max-xs:hidden" title={data.email}>{data.email}</span>
			<form method="POST" action="/logout">
				<Button type="submit" variant="ghost" size="sm" icon="log-out">Sign out</Button>
			</form>
		</TopBar>
	{/snippet}

	{#if setup}
		<h1 class="mb-2">Get set up</h1>
		<p class="mb-8 text-muted">{hosted ? 'Three steps' : 'Two steps'}, then you can share your first album.</p>
		{#if data.pending}
			<div class="mb-6">
				<Notice>Finishing up… Your payment went through and we're waiting to hear back from Stripe.</Notice>
			</div>
		{/if}
		<Panel flush>
			<Steps steps={setupSteps} />
		</Panel>
		{@render refundNote('mt-4')}
	{:else}
		<h1 class="mb-2">Dashboard</h1>
		{#if data.plan.status === 'past_due'}
			<div class="mt-6">
				<Notice tone="danger">
					We couldn't charge your card. Stripe will try again over the next few days. Update your card to keep your
					links working.
					{#snippet action()}{@render portalButton('Update card', 'secondary')}{/snippet}
				</Notice>
			</div>
		{/if}
		{#if !data.agent.connected}
			<section
				class="mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border bg-surface p-5"
				aria-labelledby="reconnect-title"
			>
				<IconTile icon="unplug" tone="warning" />
				<div class="grid min-w-0 flex-1 gap-1">
					<h2 class="text-md tracking-normal" id="reconnect-title">Connect your agent</h2>
					<p class="text-sm text-muted">
						Your links won't open until it's back. Open your agent's page: it shows a code to enter here.
					</p>
				</div>
				{@render codeForm(true)}
			</section>
		{/if}
		<dl class="my-8 grid gap-6 border-y py-6 sm:auto-cols-fr sm:grid-flow-col">
			{#if hosted}{@render planFact()}{/if}
			{@render agentFact()}
			{@render linksFact()}
		</dl>
		{@render refundNote('-mt-2 mb-6')}
		<div class="grid gap-6">
			{@render sharesPanel()}
			{@render accountPanel()}
		</div>
	{/if}
</Page>

{#snippet refundNote(spacing: string)}
	{#if data.plan.refundUntil}
		<p class={[spacing, 'text-sm text-muted']}>
			Changed your mind? You can get a full refund until {formatDate(data.plan.refundUntil)}.
			<button type="button" class="link-accent" onclick={() => (confirmRefund = true)}>Cancel and refund</button>
		</p>
	{/if}
{/snippet}

{#snippet planFact()}
	{@const s = data.plan.status}
	{@const acts = (s === 'active' && data.plan.manageable) || s === 'ending' || s === 'none' || s === 'ended'}
	{@render fact(
		'Plan',
		'credit-card',
		s === 'active'
			? 'Active'
			: s === 'ending'
				? `Ends ${formatDate(data.plan.activeUntil ?? Date.now())}`
				: s === 'past_due'
					? 'Payment failed'
					: 'Not active',
		s === 'active'
			? `${data.billing === 'dev' ? 'Active until' : 'Renews'} ${formatDate(data.plan.activeUntil ?? Date.now())}`
			: s === 'ending'
				? "Won't renew. Links stop after that."
				: s === 'past_due'
					? 'Update your card to keep links working.'
					: s === 'ended'
						? `Ended ${formatDate(data.plan.activeUntil ?? Date.now())}. Links don't open.`
						: "Links don't open until you subscribe.",
		acts ? planAction : undefined
	)}
{/snippet}

{#snippet planAction()}
	{@const s = data.plan.status}
	{#if s === 'active' && data.plan.manageable}
		{@render portalButton('Manage billing', 'secondary')}
	{:else if s === 'ending'}
		{@render portalButton('Keep my plan', 'primary')}
	{:else if s === 'none' || s === 'ended'}
		{#if data.billing === 'dev'}
			{@render activateForm('primary')}
		{:else}
			<form method="POST" action="?/checkout">
				<Button type="submit" variant="primary" size="sm">Subscribe, {data.price} a year</Button>
			</form>
		{/if}
	{/if}
{/snippet}

{#snippet portalButton(label: string, variant: 'primary' | 'secondary')}
	<form method="POST" action="?/portal">
		<Button type="submit" {variant} size="sm" trailingIcon="external-link">{label}</Button>
	</form>
{/snippet}

{#snippet agentFact()}
	{@render fact(
		'Agent',
		'server',
		data.agent.online
			? 'Online'
			: data.agent.connecting
				? 'Connecting…'
				: data.agent.connected
					? 'Offline'
					: 'Not connected',
		data.agent.online
			? `Connected ${formatDate(data.agent.connectedAt ?? Date.now())}`
			: data.agent.connecting
				? 'Approved. Your agent picks it up in a few seconds.'
				: data.agent.connected
					? `Last seen ${formatRelative(data.agent.seenAt ?? Date.now())}. Links won't open.`
					: "Links won't open until it's connected.",
		undefined,
		agentDot
	)}
{/snippet}

{#snippet agentDot()}
	<span
		class={[
			'block size-2 flex-none rounded-full',
			data.agent.online ? 'bg-status-online ring-3 ring-success-soft' : 'bg-status-connecting'
		]}
		aria-hidden="true"
	></span>
{/snippet}

{#snippet linksFact()}
	{@const views = data.shares.reduce((n, sh) => n + sh.views, 0)}
	{@render fact(
		'Share links',
		'link',
		`${live} live`,
		views === 0 ? 'Not opened yet' : views === 1 ? 'Opened once in total' : `Opened ${views} times in total`
	)}
{/snippet}

{#snippet fact(label: string, icon: IconName, value: string, detail: string, action?: Snippet, status?: Snippet)}
	<div class="grid content-start gap-1">
		<dt class="flex items-center gap-1.5 text-sm text-muted"><Icon name={icon} size={16} />{label}</dt>
		<dd class="flex items-center gap-2 font-display text-xl font-semibold">{@render status?.()}{value}</dd>
		<dd class="text-sm text-muted">{detail}</dd>
		{#if action}<dd class="mt-2">{@render action()}</dd>{/if}
	</div>
{/snippet}

{#snippet sharesPanel()}
	<Panel
		title="Share links"
		id="shares"
		flush
		description="Album names stay on your server. The emoji match the ones in your agent, so you can tell links apart."
	>
		{#if data.shares.length === 0}
			<EmptyState
				icon="link"
				title="No share links yet"
				body="Make one from your agent, or share an album in Immich. It will show up here."
			/>
		{:else}
			<ul class="border-t" role="list">
				{#each data.shares as share (share.id)}
					<!-- `share` and `id` stay as hooks for the e2e tests. -->
					<li
						class={[
							'share flex flex-wrap items-start gap-x-4 gap-y-3 border-b p-4 last:border-b-0 xs:px-6 sm:items-center',
							share.state !== 'live' && '[&>.easy-id]:opacity-50'
						]}
					>
						<EasyId id={share.id} />
						<div class="grid min-w-0 flex-1 gap-0.5">
							<span class={['font-medium', share.state !== 'live' && 'text-muted']}>
								{share.state === 'disabled'
									? `Disabled on ${formatDate(share.disabledAt ?? Date.now())}`
									: share.state === 'expired'
										? `Expired on ${formatDate(share.expiresAt ?? Date.now())}`
										: share.expiresAt
											? `Live until ${formatDate(share.expiresAt)}`
											: 'Live, no expiry'}
							</span>
							<MetaList
								items={[
									{ text: `Made ${formatDate(share.createdAt)}` },
									{ text: opened(share.views) },
									...(share.allowUpload && share.state === 'live' ? [{ text: 'Friends can add photos' }] : [])
								]}
							/>
							<span class="id mono text-xs text-subtle">{share.id}</span>
						</div>
						<!-- Phones: under the text, lined up with it (52px Easy ID + gap). -->
						<div class="max-sm:w-full max-sm:pl-17">
							{#if share.state === 'live'}
								<Button
									class="max-sm:-ml-3"
									variant="ghost-danger"
									size="sm"
									icon="ban"
									onclick={() => (disableId = share.id)}>Disable</Button
								>
							{/if}
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Panel>
{/snippet}

{#snippet accountPanel()}
	<Panel title="Account" id="account" description="Signed in as {data.email}." flush>
		<SettingsList flush label="Account">
			{#if data.plan.manageable}
				<SettingRow icon="wallet" title="Billing" description="Change your card, see invoices or cancel, on Stripe.">
					{#snippet trailing()}{@render portalButton('Manage billing', 'secondary')}{/snippet}
				</SettingRow>
			{/if}
			<SettingRow
				icon="server"
				tone={data.agent.online ? 'success' : data.agent.connected && !data.agent.connecting ? 'warning' : 'neutral'}
				title="Agent"
				description={data.agent.online
					? `Online, connected ${formatDate(data.agent.connectedAt ?? Date.now())}. Disconnecting stops your links until you connect again.`
					: data.agent.connecting
						? 'Approved. Your agent picks it up in a few seconds.'
						: data.agent.connected
							? `Offline, last seen ${formatRelative(data.agent.seenAt ?? Date.now())}. If that server is gone for good, disconnect it.`
							: 'No agent connected. Open your agent’s page and enter its code.'}
			>
				{#snippet trailing()}
					{#if data.agent.connected}
						<Button variant="ghost-danger" size="sm" icon="unplug" onclick={() => (confirmDisconnect = true)}
							>Disconnect</Button
						>
					{/if}
				{/snippet}
			</SettingRow>
			<SettingRow icon="download" title="Your data" description="Everything we keep about your account, as a file.">
				{#snippet trailing()}<Button href="/dashboard/export" size="sm" download>Download</Button>{/snippet}
			</SettingRow>
			<SettingRow
				icon="trash-2"
				tone="danger"
				title="Delete account"
				description="Your links stop working{hosted
					? ' and your plan is cancelled'
					: ''}. Your photos stay on your server."
			>
				{#snippet trailing()}
					<Button variant="ghost-danger" size="sm" onclick={() => (confirmDelete = true)}>Delete…</Button>
				{/snippet}
			</SettingRow>
		</SettingsList>
	</Panel>
{/snippet}

<Dialog bind:open={confirmDisconnect} title="Disconnect your agent?">
	<p>Your links stop opening until you connect an agent again. Nothing is deleted.</p>
	{#snippet footer()}
		<Button onclick={() => (confirmDisconnect = false)} autofocus>Cancel</Button>
		<form
			method="POST"
			action="?/disconnectAgent"
			use:enhance={() =>
				async ({ result, update }) => {
					await update();
					confirmDisconnect = false;
					if (result.type === 'success') toast('Agent disconnected');
				}}
		>
			<Button type="submit" variant="danger" icon="unplug">Disconnect agent</Button>
		</form>
	{/snippet}
</Dialog>

<Dialog open={disableId !== null} onclose={() => (disableId = null)} title="Disable this link?">
	<p>
		Anyone with link <span class="mono">{disableId}</span> won't be able to open it anymore. It can't be turned back on, but
		you can make a new link from your agent.
	</p>
	{#snippet footer()}
		<Button onclick={() => (disableId = null)} autofocus>Cancel</Button>
		<form
			method="POST"
			action="?/disable"
			use:enhance={() => {
				disabling = true;
				return async ({ result, update }) => {
					await update();
					disabling = false;
					disableId = null;
					if (result.type === 'success') toast('Link disabled');
				};
			}}
		>
			<input type="hidden" name="id" value={disableId} />
			<Button type="submit" variant="danger" icon="ban" loading={disabling}>Disable link</Button>
		</form>
	{/snippet}
</Dialog>

<Dialog bind:open={confirmDelete} title="Delete your account?" size="md">
	<form
		id="delete-form"
		class="grid gap-4"
		method="POST"
		action="?/deleteAccount"
		use:enhance={() => {
			deleting = true;
			return async ({ update }) => {
				await update({ reset: false });
				deleting = false;
			};
		}}
	>
		<p>
			Your links stop working, your agent is disconnected{hosted ? ' and your plan is cancelled' : ''}. Your photos stay
			on your server. This can't be undone.
		</p>
		<Field
			id="delete-password"
			label="Your password"
			error={form && 'deleteError' in form && form.deleteError ? DELETE_ERRORS[form.deleteError] : null}
		>
			{#snippet children({ describedby, invalid })}
				<SecretInput id="delete-password" name="password" autocomplete="current-password" {describedby} {invalid} />
			{/snippet}
		</Field>
	</form>
	{#snippet footer()}
		<Button onclick={() => (confirmDelete = false)} autofocus>Cancel</Button>
		<Button type="submit" form="delete-form" variant="danger" loading={deleting}>Delete account</Button>
	{/snippet}
</Dialog>

<Dialog bind:open={confirmRefund} title="Cancel and get a refund?">
	<p>
		We refund your {data.price} in full and end your plan now, so your links stop working. Your photos stay on your server.
		The money is usually back on your card within 10 days.
	</p>
	{#if form && 'refundError' in form && form.refundError}
		<Notice tone="danger">
			{REFUND_ERRORS[form.refundError]}{data.supportEmail ? ` You can also email ${data.supportEmail}.` : ''}
		</Notice>
	{/if}
	{#snippet footer()}
		<Button onclick={() => (confirmRefund = false)} autofocus>Keep my plan</Button>
		<form
			method="POST"
			action="?/refund"
			use:enhance={() => {
				refunding = true;
				return async ({ result, update }) => {
					await update();
					refunding = false;
					if (result.type === 'success') {
						confirmRefund = false;
						toast('Plan cancelled and refunded');
					}
				};
			}}
		>
			<Button type="submit" variant="danger" loading={refunding}>Cancel and refund</Button>
		</form>
	{/snippet}
</Dialog>

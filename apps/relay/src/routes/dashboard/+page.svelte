<script lang="ts">
	import {
		Badge,
		Button,
		CodeBlock,
		CopyField,
		Dialog,
		EasyId,
		EmptyState,
		Field,
		Icon,
		IconTile,
		MetaList,
		Notice,
		Panel,
		SettingRow,
		SettingsList,
		StatTile,
		Steps,
		TopBar,
		formatDate,
		formatRelative,
		toast,
		type Step
	} from '@shrim/ui';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { goto, refreshAll } from '$app/navigation';
	import Page from '#lib/components/Page.svelte';
	import PasswordInput from '#lib/components/PasswordInput.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	let activating = $state(false);
	let confirmDisconnect = $state(false);
	let disableId = $state<string | null>(null);
	let disabling = $state(false);
	let confirmDelete = $state(false);
	let deleting = $state(false);

	const hosted = $derived(data.billing !== 'off');
	const planOk = $derived(
		!hosted || data.plan.status === 'active' || data.plan.status === 'ending' || data.plan.status === 'past_due'
	);
	// First run only: once there are links, a disconnected agent shows on the normal dashboard.
	const setup = $derived((!data.agent.everSeen && !data.agent.connecting && data.shares.length === 0) || !planOk);
	const newToken = $derived(form && 'token' in form ? (form.token as string) : null);
	const live = $derived(data.shares.filter((s) => s.state === 'live').length);

	const compose = $derived(
		[
			'services:',
			'  shrim-agent:',
			`    image: ${data.agentImage}`,
			'    environment:',
			'      IMMICH_URL: http://immich-server:2283',
			...(data.ownRelay ? [`      SHRIM_RELAY_URL: ${data.relayUrl}`] : []),
			'    ports:',
			'      - 2284:3000',
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
				summary: planOk ? `Plan active until ${formatDate(data.plan.activeUntil ?? Date.now())}.` : undefined,
				body: subscribe
			});
		}
		return steps;
	});
</script>

<svelte:head><title>{setup ? 'Get set up' : 'Dashboard'} – shrim.pics</title></svelte:head>

{#snippet addAgent()}
	<div class={stepBody}>
		<p>Add this to the <code>docker-compose.yml</code> that runs Immich, then run <code>docker compose up -d</code>.</p>
		<CodeBlock code={compose} />
		<p class="text-sm text-muted">
			Change <code>IMMICH_URL</code> if your Immich service has another name.{#if data.ownRelay}
				<code>SHRIM_RELAY_URL</code> points the agent at this server.{/if}
		</p>
	</div>
{/snippet}

{#snippet connectAgent()}
	<div class={stepBody}>
		<p>
			Open <code>http://&lt;that machine&gt;:2284</code> in your browser and sign in as an Immich admin (with an Immich API
			key, or single sign-on). It shows a code. Approve it there, or type it here.
		</p>
		{@render codeForm(false)}
	</div>
{/snippet}

<!-- `stretch`: on phones the input takes the row (the reconnect banner). -->
{#snippet codeForm(stretch: boolean)}
	<form class={['flex gap-2', stretch && 'w-full sm:w-auto']} method="POST" action="/connect?/lookup">
		<label class="visually-hidden" for="code">Code</label>
		<input
			id="code"
			name="code"
			class={['flex-none mono text-md tracking-code uppercase', stretch && 'max-sm:min-w-0 max-sm:flex-1']}
			placeholder="____-____"
			autocomplete="one-time-code"
			autocapitalize="characters"
			spellcheck="false"
			maxlength="9"
			required
		/>
		<Button type="submit">Connect</Button>
	</form>
{/snippet}

{#snippet subscribe()}
	<div class={stepBody}>
		{#if data.billing === 'dev'}
			<p>Test mode: no payment is taken.</p>
			{@render activateForm(data.agent.everSeen ? 'primary' : 'secondary')}
		{:else}
			<p>{data.price} a year. Cancel any time. Full refund within 14 days.</p>
			{#if data.cancelled}<p class="text-sm text-muted">Checkout was cancelled. Nothing was charged.</p>{/if}
			<form method="POST" action="?/checkout">
				<Button type="submit" variant={data.agent.everSeen ? 'primary' : 'secondary'}
					>Subscribe for {data.price} a year</Button
				>
			</form>
		{/if}
	</div>
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
		<div class="my-6 grid gap-4 sm:auto-cols-fr sm:grid-flow-col">
			{#if hosted}{@render planTile()}{/if}
			{@render agentTile()}
			{@render linksTile()}
		</div>
		{#if data.refundUntil && data.supportEmail}
			<p class="-mt-2 mb-6 text-sm text-muted">
				Changed your mind? You can get a full refund until {formatDate(data.refundUntil)}.
				<a href="mailto:{data.supportEmail}?subject=Refund">Ask for a refund</a>
			</p>
		{/if}
		<div class="grid gap-6">
			{@render sharesPanel()}
			{@render accountPanel()}
		</div>
	{/if}
</Page>

{#snippet planTile()}
	{@const s = data.plan.status}
	<StatTile
		icon="credit-card"
		tone={s === 'active' ? 'success' : s === 'past_due' ? 'danger' : 'warning'}
		label="Plan"
		value={s === 'active'
			? 'Active'
			: s === 'ending'
				? `Ends ${formatDate(data.plan.activeUntil ?? Date.now())}`
				: s === 'past_due'
					? 'Payment failed'
					: 'Not active'}
		detail={s === 'active'
			? `${data.billing === 'dev' ? 'Active until' : 'Renews'} ${formatDate(data.plan.activeUntil ?? Date.now())}`
			: s === 'ending'
				? "Won't renew. Links stop after that."
				: s === 'past_due'
					? 'Update your card to keep links working.'
					: s === 'ended'
						? `Ended ${formatDate(data.plan.activeUntil ?? Date.now())}. Links don't open.`
						: "Links don't open until you subscribe."}
	>
		{#snippet action()}
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
	</StatTile>
{/snippet}

{#snippet portalButton(label: string, variant: 'primary' | 'secondary')}
	<form method="POST" action="?/portal">
		<Button type="submit" {variant} size="sm" trailingIcon="external-link">{label}</Button>
	</form>
{/snippet}

{#snippet agentTile()}
	<StatTile
		icon="server"
		tone={data.agent.online ? 'success' : data.agent.connecting ? 'neutral' : 'warning'}
		label="Agent"
		value={data.agent.online
			? 'Online'
			: data.agent.connecting
				? 'Connecting…'
				: data.agent.connected
					? 'Offline'
					: 'Not connected'}
		detail={data.agent.online
			? `Connected ${formatDate(data.agent.connectedAt ?? Date.now())}`
			: data.agent.connecting
				? 'Approved. Your agent picks it up in a few seconds.'
				: data.agent.connected
					? `Last seen ${formatRelative(data.agent.seenAt ?? Date.now())}. Links won't open.`
					: "Links won't open until it's connected."}
	>
		{#snippet status()}
			<span
				class={[
					'm-1 block size-2.5 rounded-full',
					data.agent.online ? 'bg-status-online ring-3 ring-success-soft' : 'bg-status-connecting'
				]}
				aria-hidden="true"
			></span>
		{/snippet}
	</StatTile>
{/snippet}

{#snippet linksTile()}
	{@const views = data.shares.reduce((n, s) => n + s.views, 0)}
	<StatTile
		icon="link"
		label="Share links"
		value={live === 1 ? '1 active' : `${live} active`}
		detail={views === 0 ? 'Not opened yet' : views === 1 ? 'Opened once in total' : `Opened ${views} times in total`}
	/>
{/snippet}

{#snippet sharesPanel()}
	<Panel
		title="Share links"
		id="shares"
		flush
		description="Album names stay on your server. The emoji match the ones in your agent, so you can tell links apart."
	>
		{#if data.shares.length === 0}
			<EmptyState icon="link" title="No share links yet" body="Make one from your agent. It will show up here." />
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
							<span class={['id mono font-medium', share.state !== 'live' && 'text-subtle']}>{share.id}</span>
							<MetaList
								items={[
									{ text: `Made ${formatDate(share.createdAt)}`, icon: 'plus' },
									share.state === 'disabled'
										? { text: `Turned off ${formatDate(share.disabledAt ?? Date.now())}`, icon: 'ban' }
										: share.expiresAt
											? {
													text: `${share.state === 'expired' ? 'Expired' : 'Expires'} ${formatDate(share.expiresAt)}`,
													icon: 'clock'
												}
											: { text: 'No expiry', icon: 'clock' },
									{ text: opened(share.views), icon: 'eye' },
									...(share.allowUpload && share.state === 'live'
										? [{ text: 'Friends can add photos', icon: 'upload' as const }]
										: [])
								]}
							/>
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
							{:else}
								<Badge>{share.state === 'expired' ? 'Expired' : 'Disabled'}</Badge>
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
			{#if !data.agent.connected || newToken}
				<SettingRow icon="key-round" title="Connection token">
					{#snippet description()}
						Instead of a code, you can put a token in your compose file as <code>SHRIM_AGENT_TOKEN</code>.
					{/snippet}
					{#snippet trailing()}
						{#if !newToken}
							<form method="POST" action="?/token" use:enhance>
								<Button type="submit" size="sm" icon="key-round">Create token</Button>
							</form>
						{/if}
					{/snippet}
					{#if newToken}
						<div class="grid w-full gap-2">
							<CopyField value={newToken} id="token" />
							<p class="flex items-start gap-1.5 text-sm text-warning">
								<Icon name="triangle-alert" size={16} class="mt-0.5" />
								<span>
									Here's your new token. Put it in your compose file as <code>SHRIM_AGENT_TOKEN</code> now. We only show it
									once.
								</span>
							</p>
						</div>
					{/if}
				</SettingRow>
			{/if}
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
			error={form && 'deleteError' in form
				? form.deleteError === 'password'
					? "That password isn't right."
					: "We couldn't cancel your plan with Stripe, so nothing was deleted. Try again in a moment."
				: null}
		>
			{#snippet children({ describedby, invalid })}
				<PasswordInput id="delete-password" name="password" autocomplete="current-password" {describedby} {invalid} />
			{/snippet}
		</Field>
	</form>
	{#snippet footer()}
		<Button onclick={() => (confirmDelete = false)} autofocus>Cancel</Button>
		<Button type="submit" form="delete-form" variant="danger" loading={deleting}>Delete account</Button>
	{/snippet}
</Dialog>

<style>
	/* Exactly wide enough for XXXX-XXXX: nine characters, their spacing, padding and border. */
	input[name='code'] {
		width: calc(9ch + 9 * var(--tracking-code) + 2 * var(--space-3) + 2 * var(--border-width) + 2px);
	}
</style>

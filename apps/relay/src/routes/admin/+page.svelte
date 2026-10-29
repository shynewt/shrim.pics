<script lang="ts">
	import {
		Badge,
		Button,
		Dialog,
		EasyId,
		EmptyState,
		Panel,
		SettingRow,
		SettingsList,
		StatTile,
		TopBar,
		formatRelative,
		formatSize,
		plural,
		toast
	} from '@shrim/ui';
	import { enhance } from '$app/forms';
	import Page from '#lib/components/Page.svelte';
	import Sparkbars from '#lib/components/Sparkbars.svelte';
	import type { PageProps, SubmitFunction } from './$types';

	let { data }: PageProps = $props();

	let suspending = $state.raw<{ accountId: string; owner: string | null } | null>(null);
	let suspendBusy = $state(false);

	const o = $derived(data.overview);
	const n = (x: number) => x.toLocaleString('en-GB');
	/** 3 minutes, 5 hours, 2 days: as long as the relay has been running. */
	function since(ms: number) {
		const m = Math.floor(ms / 60_000);
		if (m < 60) return plural(Math.max(m, 1), 'minute', 'minutes');
		const h = Math.floor(m / 60);
		return h < 48 ? plural(h, 'hour', 'hours') : plural(Math.floor(h / 24), 'day', 'days');
	}

	const REASONS: Record<string, string> = {
		illegal: 'Illegal content',
		consent: 'Shared without consent',
		spam: 'Spam or scam',
		other: 'Something else'
	};

	// Table cells: the outer ones line up with the panel's title (16px on phones, 24 wider).
	const cell = 'px-4 py-3 xs:first:pl-6 xs:last:pr-6';
	const th = [cell, 'text-xs font-medium whitespace-nowrap text-subtle'];
	const td = (off: boolean) => [cell, 'border-t whitespace-nowrap tabular', off && 'opacity-55'];

	const done: SubmitFunction =
		() =>
		async ({ result, update }) => {
			await update();
			if (result.type === 'success' && typeof result.data?.done === 'string') toast(result.data.done);
		};
</script>

{#snippet stat(label: string, value: string)}
	<tr>
		<th scope="row" class={[cell, 'border-t text-left font-regular text-muted']}>{label}</th>
		<td class={[cell, 'border-t text-right tabular']}>{value}</td>
	</tr>
{/snippet}

<svelte:head><title>Operator – shrim.pics</title></svelte:head>

<Page>
	{#snippet topbar()}
		<TopBar width="content">
			<a class="nav" href="/admin/accounts">Accounts</a>
			<a class="nav" href="/dashboard">Dashboard</a>
		</TopBar>
	{/snippet}

	<h1 class="mb-2">Operator</h1>
	<p class="mb-8 text-muted">How the service is doing. Only what the relay can see: no albums, no photos.</p>

	{#if o.plans}
		<section class="mb-6" aria-labelledby="paying">
			<p class="text-sm text-muted" id="paying">Paying accounts</p>
			<p class="text-4xl font-semibold tracking-tighter">{n(o.plans.paying)}</p>
			<p class="text-muted">
				{#if data.revenue}About <strong class="text-text">{data.revenue}</strong> a year from the {n(
						o.plans.paying - o.plans.ending
					)}
					that renew.{/if}
				{#if o.plans.ending}{n(o.plans.ending)} cancelled and ending.{/if}
				{#if o.plans.free}{plural(o.plans.free, 'free plan', 'free plans')} on top.{/if}
				{#if o.plans.pastDue}<span class="text-warning"
						>{plural(o.plans.pastDue, 'card problem', 'card problems')}.</span
					>{/if}
			</p>
		</section>
	{/if}

	<div class="mb-6 grid gap-4 sm:grid-cols-2">
		<StatTile
			icon="users"
			label="Accounts"
			value={n(o.accounts.total)}
			detail="{n(o.accounts.new30)} new in the last 30 days"
		>
			{#snippet action()}<Sparkbars weeks={o.accounts.weekly} label="Sign-ups per week" />{/snippet}
		</StatTile>
		<StatTile
			icon="server"
			tone={data.live.agentsOnline > 0 ? 'success' : 'neutral'}
			label="Agents online"
			value={n(data.live.agentsOnline)}
			detail="Of {n(o.agents.paired)} paired, {n(o.agents.seenWeek)} seen this week"
		/>
		<StatTile
			icon="link"
			label="Live links"
			value={n(o.links.live)}
			detail="{n(o.links.new30)} made in the last 30 days"
		>
			{#snippet action()}<Sparkbars weeks={o.links.weekly} label="Links made per week" />{/snippet}
		</StatTile>
		<StatTile
			icon="download"
			label="Data served"
			value={formatSize(o.traffic.bytesOut)}
			detail="{n(o.traffic.views)} opens, {formatSize(o.traffic.bytesIn)} uploaded"
		/>
	</div>

	<div class="mb-6 grid gap-6 md:grid-cols-2 md:items-start">
		{#if o.plans}
			<Panel title="Plans" flush>
				<table class="w-full border-collapse text-sm">
					<tbody>
						{@render stat('Paying, renewing', n(o.plans.paying - o.plans.ending - o.plans.pastDue))}
						{@render stat('Paying, card problem', n(o.plans.pastDue))}
						{@render stat('Paying, cancelled', n(o.plans.ending))}
						{@render stat('Free (100% off code)', n(o.plans.free))}
						{@render stat('Plan ended', n(o.plans.lapsed))}
						{@render stat('Never paid', n(o.plans.never))}
						{@render stat('Suspended', n(o.accounts.suspended))}
					</tbody>
				</table>
			</Panel>
		{/if}
		<Panel title="Links" flush>
			<table class="w-full border-collapse text-sm">
				<tbody>
					{@render stat('Live', n(o.links.live))}
					{@render stat('Live, friends can add photos', n(o.links.withUploads))}
					{@render stat('Expired', n(o.links.expired))}
					{@render stat('Turned off by owners', n(o.links.byOwner))}
					{@render stat('Turned off by you', n(o.links.byOperator))}
				</tbody>
			</table>
		</Panel>
	</div>

	<div class="grid gap-6">
		<Panel title="Busiest links" description="By data passed through. Useful to spot heavy or unusual use." flush>
			{#if o.busiest.length === 0}
				<EmptyState icon="link" title="No traffic yet" body="Links show up here once someone opens them." />
			{:else}
				<div class="overflow-x-auto">
					<table class="w-full border-collapse text-sm">
						<thead>
							<tr>
								<th scope="col" class={[th, 'text-left']}>Link</th>
								<th scope="col" class={[th, 'text-left']}>Owner</th>
								<th scope="col" class={[th, 'text-right tabular']}>Opens</th>
								<th scope="col" class={[th, 'text-right tabular']}>Served</th>
								<th scope="col" class={[th, 'text-right tabular']}>Uploaded</th>
							</tr>
						</thead>
						<tbody>
							{#each o.busiest as b (b.id)}
								<tr title={b.live ? undefined : 'Turned off or expired'}>
									<td class={[td(!b.live), 'text-left']}>
										<span class="inline-flex items-center gap-2 whitespace-nowrap">
											<EasyId id={b.id} size="sm" />
											<span class="mono">{b.id}</span>
											{#if !b.live}<span class="visually-hidden">(off)</span>{/if}
										</span>
									</td>
									<!-- Long addresses are cut short: the full one is in the tooltip, and the link finds the account. -->
									<td class={[td(!b.live), 'max-w-44 overflow-hidden text-left text-ellipsis']}>
										<a class="link-muted" href="/admin/accounts/{b.accountId}" title={b.owner}>{b.owner}</a>
									</td>
									<td class={[td(!b.live), 'text-right']}>{n(b.views)}</td>
									<td class={[td(!b.live), 'text-right']}>{formatSize(b.bytesOut)}</td>
									<td class={[td(!b.live), 'text-right']}>{formatSize(b.bytesIn)}</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</Panel>

		<Panel title="Health" flush>
			<SettingsList flush label="Health">
				<SettingRow
					icon="flag"
					tone={o.openReports ? 'warning' : 'success'}
					title={o.openReports ? plural(o.openReports, 'open report', 'open reports') : 'No open reports'}
					description="People who opened a link and reported it. They're listed below."
					compact
				/>
				<SettingRow
					icon="refresh-cw"
					tone={data.live.requestsInFlight > 20 ? 'warning' : 'neutral'}
					title="{plural(data.live.requestsInFlight, 'request', 'requests')} in flight"
					description="{plural(
						o.agents.pairingWaiting,
						'pairing code',
						'pairing codes'
					)} waiting for approval. Running for {since(data.uptime)}."
					compact
				/>
				<SettingRow
					icon="download"
					tone={data.backup && Date.now() - data.backup.at < 2 * 86_400_000 ? 'success' : 'warning'}
					title={data.backup ? `Last backup ${formatRelative(data.backup.at)}` : 'No backup yet'}
					description="Database {formatSize(data.databaseSize)}{data.backup
						? `, backup ${formatSize(data.backup.size)}`
						: ''}. A copy is made every day; the last 14 are kept."
					compact
				/>
			</SettingsList>
		</Panel>
	</div>

	<h2 class="mt-10 mb-4" id="accounts">Accounts</h2>
	<Panel>
		<form class="flex gap-2" method="GET" action="/admin/accounts" role="search">
			<label class="visually-hidden" for="account-search">Email, account or link ID</label>
			<input
				id="account-search"
				class="min-w-0 flex-1"
				name="q"
				type="search"
				placeholder="Email or ID"
				autocomplete="off"
				spellcheck="false"
			/>
			<Button type="submit" icon="search">Search</Button>
		</form>
		<p class="mt-3 text-sm text-muted">
			Look up an account to see its links, suspend it or disconnect its agent. <a href="/admin/accounts"
				>See the newest accounts</a
			>
		</p>
	</Panel>

	<h2 class="mt-10 mb-4" id="reports">Reports</h2>
	<Panel flush>
		{#if data.reports.length === 0}
			<EmptyState
				icon="check"
				title="Nothing to review"
				body="New reports from people who open links will show up here."
			/>
		{:else}
			<ul role="list">
				{#each data.reports as r (r.id)}
					<li class="grid gap-2 border-b p-4 last:border-b-0 xs:px-6">
						<div class="flex flex-wrap items-center gap-2">
							<span class="mr-1 mono font-medium">{r.shareId}</span>
							<Badge variant={r.reason === 'illegal' ? 'danger' : 'warning'}>{REASONS[r.reason] ?? r.reason}</Badge>
							{#if r.shareDisabled}<Badge>Link disabled</Badge>{/if}
							{#if r.suspended}<Badge>Account suspended</Badge>{/if}
						</div>
						<p class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-subtle">
							<span>Reported {formatRelative(r.createdAt)}</span>
							{#if r.owner && r.accountId}<span>Owner <a href="/admin/accounts/{r.accountId}">{r.owner}</a></span>{/if}
							{#if r.contact}<span>Reporter {r.contact}</span>{/if}
						</p>
						{#if r.details}<p class="max-w-measure whitespace-pre-line">{r.details}</p>{/if}
						<div class="mt-1 flex flex-wrap gap-2">
							<Button href={r.link} target="_blank" rel="noreferrer" size="sm" icon="external-link">Open link</Button>
							{#if !r.shareDisabled}
								<form method="POST" action="?/disable" use:enhance={done}>
									<input type="hidden" name="shareId" value={r.shareId} />
									<Button type="submit" size="sm" variant="ghost-danger" icon="ban">Disable link</Button>
								</form>
							{/if}
							{#if r.accountId && !r.suspended}
								<Button
									size="sm"
									variant="ghost-danger"
									onclick={() => (suspending = { accountId: r.accountId!, owner: r.owner })}>Suspend account</Button
								>
							{/if}
							<form method="POST" action="?/resolve" use:enhance={done}>
								<input type="hidden" name="id" value={r.id} />
								<Button type="submit" size="sm" variant="ghost" icon="check">Close report</Button>
							</form>
						</div>
					</li>
				{/each}
			</ul>
		{/if}
	</Panel>
</Page>

<Dialog open={suspending !== null} onclose={() => (suspending = null)} title="Suspend this account?">
	<p>
		{suspending?.owner ?? 'The owner'} can still sign in, but their links stop opening and their agent is disconnected. You
		can undo this from the account page.
	</p>
	{#snippet footer()}
		<Button onclick={() => (suspending = null)} autofocus>Cancel</Button>
		<form
			method="POST"
			action="?/suspend"
			use:enhance={() => {
				suspendBusy = true;
				return async ({ result, update }) => {
					await update();
					suspendBusy = false;
					suspending = null;
					if (result.type === 'success' && typeof result.data?.done === 'string') toast(result.data.done);
				};
			}}
		>
			<input type="hidden" name="accountId" value={suspending?.accountId ?? ''} />
			<Button type="submit" variant="danger" loading={suspendBusy}>Suspend account</Button>
		</form>
	{/snippet}
</Dialog>

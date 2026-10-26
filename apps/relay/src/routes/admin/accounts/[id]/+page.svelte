<script lang="ts">
	import {
		Badge,
		Button,
		CopyField,
		Dialog,
		EasyId,
		EmptyState,
		MetaList,
		Notice,
		Panel,
		SettingRow,
		SettingsList,
		StatTile,
		TopBar,
		formatDate,
		formatRelative,
		formatSize,
		plural,
		toast,
		type IconName
	} from '@shrim/ui';
	import { enhance } from '$app/forms';
	import Page from '#lib/components/Page.svelte';
	import { PLAN } from '../labels.ts';
	import type { PageProps, SubmitFunction } from './$types';

	let { data, form }: PageProps = $props();

	const a = $derived(data.account);
	const at = $derived(a.email.lastIndexOf('@'));
	const local = $derived(at > 0 ? a.email.slice(0, at) : a.email);
	const domain = $derived(at > 0 ? a.email.slice(at) : '');
	const back = $derived(data.q ? `/admin/accounts?q=${encodeURIComponent(data.q)}` : '/admin/accounts');
	const live = $derived(data.shares.filter((s) => s.state === 'live'));
	const opens = $derived(data.shares.reduce((n, s) => n + s.views, 0));
	const served = $derived(data.shares.reduce((n, s) => n + s.bytesOut, 0));
	const resetLink = $derived(form && 'resetLink' in form ? form.resetLink : null);

	let confirm = $state<'suspend' | 'disconnect' | null>(null);
	let disableId = $state<string | null>(null);
	let busy = $state(false);

	const done: SubmitFunction = () => {
		busy = true;
		return async ({ result, update }) => {
			await update();
			busy = false;
			confirm = null;
			disableId = null;
			if (result.type === 'success' && typeof result.data?.done === 'string') toast(result.data.done);
			else if (result.type === 'failure') toast("That didn't work. Reload the page and try again.", 'error');
		};
	};

	const opened = (n: number) => (n === 0 ? 'Not opened yet' : n === 1 ? 'Opened once' : `Opened ${n} times`);

	function stateItem(s: (typeof data.shares)[number]): { text: string; icon: IconName } {
		if (s.state === 'disabled') {
			const by = s.disabledBy === 'operator' ? 'by you' : 'by the owner';
			return { text: `Turned off ${by} ${formatDate(s.disabledAt ?? Date.now())}`, icon: 'ban' };
		}
		if (s.expiresAt) {
			return { text: `${s.state === 'expired' ? 'Expired' : 'Expires'} ${formatDate(s.expiresAt)}`, icon: 'clock' };
		}
		return { text: 'No expiry', icon: 'clock' };
	}
</script>

<svelte:head><title>{a.email} – Accounts – shrim.pics</title></svelte:head>

<Page>
	{#snippet topbar()}
		<TopBar width="content">
			<Button href={back} variant="ghost" size="sm" icon="arrow-left">Accounts</Button>
		</TopBar>
	{/snippet}

	<div class="mb-2 flex flex-wrap items-center gap-x-3 gap-y-2">
		<!-- Long addresses wrap at the @ first. -->
		<h1 class="min-w-0 text-xl wrap-anywhere sm:text-2xl">{local}<wbr />{domain}</h1>
		{#if a.suspended}<Badge variant="danger" icon="ban">Suspended</Badge>{/if}
		{#if a.admin}<Badge variant="accent">Operator</Badge>{/if}
	</div>
	<div class="mb-6">
		<MetaList
			items={[
				{ text: `Joined ${formatDate(a.createdAt)}`, icon: 'plus' },
				{ text: `Account ${a.id}`, icon: 'key-round' },
				...(a.stripeCustomer ? [{ text: `Stripe ${a.stripeCustomer}`, icon: 'credit-card' as const }] : [])
			]}
		/>
	</div>

	{#if data.openReports}
		<div class="mb-6">
			<Notice tone="warning">
				{plural(data.openReports, 'open report', 'open reports')} about this account's links.
				{#snippet action()}<Button href="/admin#reports" size="sm" variant="secondary">See reports</Button>{/snippet}
			</Notice>
		</div>
	{/if}

	<div class="mb-6 grid gap-4 sm:auto-cols-fr sm:grid-flow-col">
		{#if data.plan}
			{@const p = data.plan}
			<StatTile
				icon="credit-card"
				tone={PLAN[p.status].tone}
				label="Plan"
				value={PLAN[p.status].value}
				detail={p.status === 'none'
					? 'Never paid'
					: p.status === 'ended'
						? `Ended ${formatDate(p.activeUntil ?? Date.now())}`
						: p.status === 'active'
							? `${data.billing === 'dev' ? 'Active until' : 'Renews'} ${formatDate(p.activeUntil ?? Date.now())}`
							: p.status === 'ending'
								? `Won't renew. Ends ${formatDate(p.activeUntil ?? Date.now())}.`
								: `Stripe is retrying. Paid until ${formatDate(p.activeUntil ?? Date.now())}.`}
			/>
		{/if}
		<StatTile
			icon="server"
			tone={data.agent.online ? 'success' : data.agent.pairedAt ? 'warning' : 'neutral'}
			label="Agent"
			value={data.agent.online ? 'Online' : data.agent.pairedAt ? 'Offline' : 'Not connected'}
			detail={data.agent.online
				? `Since ${formatRelative(data.agent.connectedAt ?? Date.now())}`
				: data.agent.pairedAt
					? `${data.agent.seenAt ? `Last seen ${formatRelative(data.agent.seenAt)}` : 'Never connected'}. Paired ${formatDate(data.agent.pairedAt)}.`
					: 'Never paired'}
		/>
		<StatTile
			icon="link"
			label="Share links"
			value={`${live.length} live`}
			detail="{plural(opens, 'open', 'opens')}, {formatSize(served)} served"
		/>
	</div>

	<div class="grid gap-6">
		<Panel title="Share links" flush description="IDs and traffic only. Album names and photos stay on their server.">
			{#if data.shares.length === 0}
				<EmptyState icon="link" title="No share links" body="Links show up here when they make one in their agent." />
			{:else}
				<ul class="border-t" role="list">
					{#each data.shares as s (s.id)}
						<li
							class={[
								'flex flex-wrap items-start gap-x-4 gap-y-3 border-b p-4 last:border-b-0 xs:px-6 sm:items-center',
								s.state !== 'live' && '[&>.easy-id]:opacity-50'
							]}
						>
							<EasyId id={s.id} />
							<div class="grid min-w-0 flex-1 gap-0.5">
								<span class={['mono font-medium', s.state !== 'live' && 'text-subtle']}>{s.id}</span>
								<MetaList
									items={[
										{ text: `Made ${formatDate(s.createdAt)}`, icon: 'plus' },
										stateItem(s),
										{ text: opened(s.views), icon: 'eye' },
										{ text: `${formatSize(s.bytesOut)} served`, icon: 'download' },
										...(s.bytesIn ? [{ text: `${formatSize(s.bytesIn)} added`, icon: 'upload' as const }] : []),
										...(s.allowUpload && s.state === 'live'
											? [{ text: 'Friends can add photos', icon: 'image' as const }]
											: [])
									]}
								/>
							</div>
							<!-- Phones: under the text, lined up with it (52px Easy ID + gap). -->
							<div class="max-sm:w-full max-sm:pl-17">
								{#if s.state === 'live'}
									<Button
										class="max-sm:-ml-3"
										variant="ghost-danger"
										size="sm"
										icon="ban"
										onclick={() => (disableId = s.id)}>Disable</Button
									>
								{:else}
									<Badge>{s.state === 'expired' ? 'Expired' : 'Disabled'}</Badge>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Panel>

		<Panel title="Manage" flush>
			<SettingsList flush label="Manage">
				{#if data.agent.pairedAt}
					<SettingRow
						icon="unplug"
						title="Agent"
						description="Disconnecting removes its connection token. Their links stop until they connect it again."
					>
						{#snippet trailing()}
							<Button variant="ghost-danger" size="sm" icon="unplug" onclick={() => (confirm = 'disconnect')}
								>Disconnect…</Button
							>
						{/snippet}
					</SettingRow>
				{/if}
				<SettingRow
					icon="key-round"
					title="Password"
					description={data.mail
						? 'Send them an email with a link to choose a new password. It works once, for an hour.'
						: "This server doesn't send emails. Make a reset link and pass it on yourself. It works once, for an hour."}
				>
					{#snippet trailing()}
						{#if !resetLink}
							<form method="POST" action="?/reset" use:enhance={done}>
								<Button type="submit" size="sm" icon={data.mail ? 'mail' : 'link'}
									>{data.mail ? 'Send reset email' : 'Make reset link'}</Button
								>
							</form>
						{/if}
					{/snippet}
					{#if resetLink}
						<div class="grid w-full gap-2">
							<CopyField value={resetLink} id="reset-link" />
							<p class="text-sm text-muted">
								Only shown now. Send it to {a.email} through a channel you trust.
							</p>
						</div>
					{/if}
				</SettingRow>
				{#if a.suspended}
					<SettingRow
						icon="ban"
						tone="danger"
						title="Suspended {formatDate(a.suspendedAt ?? Date.now())}"
						description="Their links don't open and their agent can't connect. They can still sign in."
					>
						{#snippet trailing()}
							<form method="POST" action="?/unsuspend" use:enhance={done}>
								<Button type="submit" size="sm">Unsuspend</Button>
							</form>
						{/snippet}
					</SettingRow>
				{:else}
					<SettingRow
						icon="ban"
						tone="danger"
						title="Suspend account"
						description="Their links stop opening and their agent is cut off at once. You can undo it."
					>
						{#snippet trailing()}
							<Button variant="ghost-danger" size="sm" onclick={() => (confirm = 'suspend')}>Suspend…</Button>
						{/snippet}
					</SettingRow>
				{/if}
			</SettingsList>
		</Panel>
	</div>
</Page>

<Dialog open={confirm === 'suspend'} onclose={() => (confirm = null)} title="Suspend this account?">
	<p>
		Links from <strong class="wrap-anywhere">{a.email}</strong> stop opening and their agent is cut off right away. You can
		unsuspend it later.
	</p>
	{#snippet footer()}
		<Button onclick={() => (confirm = null)} autofocus>Cancel</Button>
		<form method="POST" action="?/suspend" use:enhance={done}>
			<Button type="submit" variant="danger" icon="ban" loading={busy}>Suspend account</Button>
		</form>
	{/snippet}
</Dialog>

<Dialog open={confirm === 'disconnect'} onclose={() => (confirm = null)} title="Disconnect their agent?">
	<p>Their links stop opening until they connect an agent again. Nothing is deleted.</p>
	{#snippet footer()}
		<Button onclick={() => (confirm = null)} autofocus>Cancel</Button>
		<form method="POST" action="?/disconnectAgent" use:enhance={done}>
			<Button type="submit" variant="danger" icon="unplug" loading={busy}>Disconnect agent</Button>
		</form>
	{/snippet}
</Dialog>

<Dialog open={disableId !== null} onclose={() => (disableId = null)} title="Disable this link?">
	<p>
		Nobody can open link <span class="mono">{disableId}</span> anymore. It can't be turned back on. The owner sees that you
		turned it off.
	</p>
	{#snippet footer()}
		<Button onclick={() => (disableId = null)} autofocus>Cancel</Button>
		<form method="POST" action="?/disable" use:enhance={done}>
			<input type="hidden" name="shareId" value={disableId} />
			<Button type="submit" variant="danger" icon="ban" loading={busy}>Disable link</Button>
		</form>
	{/snippet}
</Dialog>

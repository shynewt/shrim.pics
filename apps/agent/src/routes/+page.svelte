<script lang="ts">
	import {
		Badge,
		Button,
		ChoiceCards,
		CopyButton,
		Dialog,
		EasyId,
		EmptyState,
		MetaList,
		Notice,
		Panel,
		Segmented,
		Spinner,
		Status,
		Steps,
		TopBar,
		formatDate,
		toast,
		type Step
	} from '@shrim/ui';
	import { onMount } from 'svelte';
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import ConnectStep from '#lib/components/ConnectStep.svelte';
	import CreateLink from '#lib/components/CreateLink.svelte';
	import EditLink from '#lib/components/EditLink.svelte';
	import LinkReady from '#lib/components/LinkReady.svelte';
	import UserAvatar from '#lib/components/UserAvatar.svelte';
	import { whatFriendsCanDo, type ReadyLink } from '#lib/types.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	type Share = PageProps['data']['shares'][number];

	const relayHost = $derived.by(() => {
		try {
			return new URL(data.relay.url).host;
		} catch {
			return 'shrim.pics';
		}
	});
	const connected = $derived(
		data.relay.hasToken && data.relay.status !== 'unauthorized' && data.relay.status !== 'not_configured'
	);
	const planInactive = $derived(data.relay.status === 'inactive' || data.relay.accountActive === false);
	/** Everyone signs in with Immich (SHRIM_AUTH=immich), so links have owners. */
	const signIn = $derived(data.auth === 'immich');
	const isAdmin = $derived(data.me.isAdmin);

	// Immich admins see everyone's links, and can narrow it down to their own.
	let view = $state<'mine' | 'everyone'>('everyone');
	const mine = $derived(data.shares.filter((s) => s.mine));
	const hasOthers = $derived(mine.length < data.shares.length);
	const shown = $derived(view === 'mine' ? mine : data.shares);

	// First run until this person has made a link (and seen it), then the steady list.
	let setupLink = $state.raw<ReadyLink | null>(null);
	let pickMode = $state<'list' | 'paste'>('list');
	const firstRun = $derived(setupLink !== null || (!data.setupSeen && !(connected && mine.length > 0)));

	let createOpen = $state(false);
	let createMode = $state<'list' | 'paste'>('paste');
	let created = $state.raw<ReadyLink | null>(null);
	let sharing = $state.raw<Share | null>(null);
	let revoking = $state.raw<Share | null>(null);
	let editing = $state.raw<Share | null>(null);
	let revokeBusy = $state(false);
	let confirmDisconnect = $state(false);
	let openNoteHidden = $state(true);

	const toReady = (s: Share): ReadyLink => ({
		id: s.id,
		link: s.link ?? '',
		label: s.label || s.albumName || 'Shared photos',
		allowUpload: s.allowUpload,
		allowDownload: s.allowDownload,
		showMetadata: s.showMetadata,
		expiresAt: s.expiresAt
	});
	const opened = (n: number | null) =>
		n === null ? null : n === 0 ? 'Not opened yet' : n === 1 ? 'Opened once' : `Opened ${n} times`;
	const isInactive = (s: Share | null) => !!s && (s.expired || s.disabledByOperator || s.unknown);
	const rowMeta = (s: Share) => [
		...(isInactive(s) ? [] : whatFriendsCanDo(s)),
		s.disabledByOperator
			? { text: `Turned off by ${relayHost}`, icon: 'ban' as const }
			: s.unknown
				? { text: 'Made with another account', icon: 'unplug' as const }
				: s.expired
					? { text: `Expired ${s.expiresAt ? formatDate(s.expiresAt) : ''}`, icon: 'clock' as const }
					: { text: s.expiresAt ? `Expires ${formatDate(s.expiresAt)}` : 'No expiry', icon: 'clock' as const },
		...(!isInactive(s) && opened(s.views) ? [{ text: opened(s.views)!, icon: 'eye' as const }] : [])
	];

	function openCreate() {
		created = null;
		createMode = data.immich.canList ? 'list' : 'paste';
		createOpen = true;
	}

	onMount(() => {
		pickMode = data.immich.canList ? 'list' : 'paste';
		openNoteHidden = signIn || localStorage.getItem('shrim.openNote') === 'hidden';
		let tick = 0;
		const t = setInterval(() => {
			tick++;
			// Don't refresh under someone's feet while they're making a link.
			if (createOpen || sharing || setupLink || revoking || editing) return;
			// Waiting for an admin to connect the agent: check often. Otherwise now and then.
			if ((!connected && !isAdmin) || (connected && tick % 3 === 0)) void refreshAll();
		}, 5_000);
		return () => clearInterval(t);
	});

	/** The line under the list: one Status whose props change, so changes are announced. */
	const status = $derived.by((): { state: 'online' | 'connecting' | 'offline' | 'error'; label: string } => {
		if (!data.immich.ok) return { state: 'error', label: "Can't reach Immich" };
		if (!connected) return { state: 'offline', label: `Not connected to ${relayHost}` };
		if (data.relay.status === 'unreachable') return { state: 'error', label: `Can't reach ${relayHost}` };
		if (data.relay.status === 'connecting') return { state: 'connecting', label: `Connecting to ${relayHost}…` };
		return {
			state: 'online',
			label: data.relay.email
				? `Connected to ${relayHost} as ${data.relay.email}. Immich is reachable.`
				: `Connected to ${relayHost}. Immich is reachable.`
		};
	});

	const steps = $derived.by((): Step[] => [
		...(signIn ? [{ title: 'Sign in with Immich', state: 'done' as const, summary: signedInSummary }] : []),
		{
			title: `Connect to ${relayHost}`,
			state: connected ? 'done' : 'current',
			summary: connected ? connectedSummary : undefined,
			body: isAdmin ? connectBody : askAdminBody
		},
		{
			title: 'Pick an album',
			state: !connected ? 'upcoming' : setupLink ? 'done' : 'current',
			summary: setupLink ? `${setupLink.label}.` : connected ? 'Choose how you want to pick albums.' : undefined,
			body: pickBody
		},
		{
			title: 'Share the link',
			state: setupLink ? 'current' : 'upcoming',
			summary: setupLink ? undefined : 'Copy it, scan it, or send it from your phone.',
			body: shareBody
		}
	]);
</script>

<svelte:head><title>shrim.pics agent</title></svelte:head>

{#snippet signedInSummary()}
	Signed in as {data.me.name}.
	<form method="POST" action="?/signOut" class="inline">
		<button type="submit" class="link-accent">Not you?</button>
	</form>
{/snippet}

{#snippet connectedSummary()}
	{#if isAdmin}
		Connected as {data.relay.email ?? 'your account'}.
		<button type="button" class="link-accent" onclick={() => (confirmDisconnect = true)}>Not your account?</button>
	{:else}
		Connected by your Immich admin.
	{/if}
	{#if planInactive}
		<span class="mt-1 block text-warning [&_a]:text-inherit">
			{#if isAdmin}
				Your plan isn't active yet, so links won't open.
				<a href="{data.relay.url}/dashboard#plan" target="_blank" rel="noreferrer">Subscribe on {relayHost}</a>
			{:else}
				The {relayHost} plan isn't active yet, so links won't open. Ask your Immich admin.
			{/if}
		</span>
	{/if}
{/snippet}

{#snippet connectBody()}
	<ConnectStep relayUrl={data.relay.url} initial={data.pairing} relayStatus={data.relay.status} />
{/snippet}

{#snippet askAdminBody()}
	<div class="grid gap-4">
		<p class="-mt-3 text-sm text-muted">
			Only an Immich admin can connect this agent to {relayHost}. Ask them to sign in here with their Immich account and
			connect it.
		</p>
		<p
			class="flex items-center justify-center gap-2 rounded-lg bg-surface-sunken px-4 py-6 text-center text-sm text-muted"
			role="status"
		>
			<Spinner size={16} />Waiting for the connection. This page moves on by itself.
		</p>
	</div>
{/snippet}

{#snippet pickBody()}
	<div class="grid gap-6">
		<ChoiceCards
			name="pick-mode"
			label="How to pick albums"
			bind:value={pickMode}
			options={[
				{
					value: 'list',
					icon: 'image',
					title: 'Pick from a list',
					body: signIn
						? 'Your albums, and albums shared with you. Easiest.'
						: 'Needs an Immich API key with limited access. Easiest.'
				},
				{
					value: 'paste',
					icon: 'link',
					title: 'Paste an Immich link',
					body: 'Make a share link in Immich and paste it here. No key needed.'
				}
			]}
		/>
		<CreateLink
			bind:mode={pickMode}
			canList={data.immich.canList}
			agentKey={!signIn}
			immichPublicUrl={data.immich.publicUrl}
			{relayHost}
			relayUrl={data.relay.url}
			oncreated={(l) => (setupLink = l)}
		/>
	</div>
{/snippet}

{#snippet shareBody()}
	{#if setupLink}
		<div class="grid gap-6">
			<LinkReady link={setupLink} />
			<div class="grid justify-items-start gap-3 border-t pt-5 text-muted">
				<p>That's it. Make more links any time from this page.</p>
				<form
					method="POST"
					action="?/markSetupSeen"
					use:enhance={() =>
						async ({ update }) => {
							await update();
							setupLink = null;
						}}
				>
					<Button type="submit" variant="primary" trailingIcon="chevron-right">Go to my links</Button>
				</form>
			</div>
		</div>
	{/if}
{/snippet}

<TopBar width="content" suffix="agent" home="/">
	{#if signIn}
		<a
			class="nav inline-flex min-w-0 items-center gap-2 rounded-sm"
			href="/settings"
			title="Signed in as {data.me.name}"
		>
			<UserAvatar name={data.me.name} />
			<span class="min-w-0 truncate max-xs:hidden">{data.me.name}</span>
		</a>
	{/if}
	{#if !firstRun}
		<Button href="/settings" variant="ghost" size="sm" icon="settings">Settings</Button>
	{/if}
</TopBar>

<main class="mx-auto grid max-w-content content-start gap-6 px-(--gutter) pt-6 pb-16 md:pt-10">
	{#if !data.immich.ok}
		<Notice tone="danger">
			Can't reach Immich at <span class="mono">{data.immich.url}</span>. Check <code>IMMICH_URL</code> in your compose file
			and that Immich is running. Trying again every few seconds.
		</Notice>
	{/if}

	{#if !openNoteHidden}
		<Notice tone="warning">
			Sign-in is off (<code>SHRIM_AUTH=none</code>). Anyone who can open this page can make public links to your albums.
			Keep it behind your own sign-in or VPN.
			{#snippet action()}
				<Button
					size="sm"
					variant="ghost"
					onclick={() => {
						localStorage.setItem('shrim.openNote', 'hidden');
						openNoteHidden = true;
					}}>Dismiss</Button
				>
			{/snippet}
		</Notice>
	{/if}

	{#if firstRun}
		<div class="grid gap-2">
			<h1>Set up sharing</h1>
			<p class="text-muted">{signIn ? 'A few steps.' : 'Three steps.'} It takes about two minutes.</p>
		</div>
		<Panel flush>
			<Steps {steps} />
		</Panel>
	{:else}
		{#if !connected && isAdmin}
			<Panel title="Connect to {relayHost}">
				<ConnectStep relayUrl={data.relay.url} initial={data.pairing} relayStatus={data.relay.status} />
			</Panel>
		{:else if !connected}
			<Notice tone="warning">
				This agent isn't connected to {relayHost}, so links don't open and you can't make new ones. Ask your Immich
				admin to connect it.
			</Notice>
		{:else if data.relay.status === 'unreachable'}
			<Notice tone="warning">
				Can't reach {relayHost}. Your links won't open until the connection is back. Trying again automatically.
			</Notice>
		{:else if planInactive && !isAdmin}
			<Notice tone="warning">
				The {relayHost} plan isn't active, so links don't open. Ask your Immich admin.
			</Notice>
		{:else if planInactive}
			<Notice tone="warning">
				Your plan isn't active, so your links don't open.
				{#snippet action()}
					<Button
						href="{data.relay.url}/dashboard#plan"
						target="_blank"
						rel="noreferrer"
						size="sm"
						trailingIcon="external-link"
					>
						Subscribe on {relayHost}
					</Button>
				{/snippet}
			</Notice>
		{/if}

		{#if data.me.olderKey}
			<Notice>
				You signed in with a new key. Your older key “{data.me.olderKey}” is still in Immich: delete it there if nothing
				else uses it.
				{#snippet action()}
					<div class="flex flex-wrap gap-2">
						{#if data.immich.apiKeysUrl}
							<Button
								href={data.immich.apiKeysUrl}
								target="_blank"
								rel="noreferrer"
								size="sm"
								trailingIcon="external-link"
							>
								Open in Immich
							</Button>
						{/if}
						<form method="POST" action="?/dismissOlderKey" use:enhance>
							<Button type="submit" size="sm" variant="ghost">Dismiss</Button>
						</form>
					</div>
				{/snippet}
			</Notice>
		{/if}

		<div class="mt-2 flex flex-wrap items-center justify-between gap-4">
			<h1>Share links</h1>
			<div class="flex flex-wrap items-center gap-3 max-xs:w-full">
				{#if hasOthers}
					<Segmented
						name="whose"
						label="Whose links"
						bind:value={view}
						options={[
							{ value: 'mine', label: 'Mine' },
							{ value: 'everyone', label: 'Everyone' }
						]}
					/>
				{/if}
				<Button variant="primary" icon="plus" onclick={openCreate} disabled={!connected}>New share link</Button>
			</div>
		</div>

		<Panel flush>
			{#if shown.length === 0}
				<EmptyState mascot title="No share links yet" body="Make one to share an Immich album with anyone.">
					{#snippet action()}
						<Button variant="primary" icon="plus" onclick={openCreate} disabled={!connected}>New share link</Button>
					{/snippet}
				</EmptyState>
			{:else}
				<ul class="grid" role="list">
					{#each shown as share (share.id)}
						{@const inactive = isInactive(share)}
						<!-- eslint-disable better-tailwindcss/no-restricted-classes -- the row grid: id, text, then the actions (under the text on phones) -->
						<li
							class={[
								'share grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-center gap-x-4 gap-y-3 border-b p-4 last:border-b-0 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:px-6',
								inactive && '[&>.easy-id]:opacity-50'
							]}
						>
							<!-- eslint-enable better-tailwindcss/no-restricted-classes -->
							<EasyId id={share.id} />
							<div class="grid min-w-0 gap-0.5">
								<span class="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
									<span class={['font-medium', inactive && 'text-subtle']}
										>{share.label || share.albumName || 'Shared photos'}</span
									>
									{#if hasOthers && view === 'everyone'}
										<span class="owner inline-flex items-center gap-1.5 text-sm text-muted">
											<UserAvatar name={share.mine ? data.me.name : (share.owner ?? '?')} size="sm" />
											{share.mine ? 'You' : (share.owner ?? 'Someone')}
										</span>
									{/if}
								</span>
								<MetaList items={rowMeta(share)} />
							</div>
							<!-- Phones: under the text, lined up with it (the 52px id plus the gap). -->
							<div class="actions col-span-full flex items-center gap-2 pl-17 sm:col-auto sm:pl-0">
								{#if !share.link}
									<!-- Someone else's link: an admin can revoke it, not open it. -->
									{#if inactive}
										<Badge variant={share.disabledByOperator ? 'danger' : 'neutral'}>
											{share.disabledByOperator ? 'Disabled' : share.unknown ? 'Other account' : 'Expired'}
										</Badge>
									{/if}
									<Button variant="ghost-danger" size="sm" icon="trash-2" onclick={() => (revoking = share)}>
										{inactive ? 'Remove' : 'Revoke'}
									</Button>
								{:else if inactive}
									<Badge variant={share.disabledByOperator ? 'danger' : 'neutral'}>
										{share.disabledByOperator ? 'Disabled' : share.unknown ? 'Other account' : 'Expired'}
									</Badge>
									{#if share.expired && !share.disabledByOperator && !share.unknown}
										<Button variant="ghost" size="sm" icon="pencil" onclick={() => (editing = share)}>Extend</Button>
									{/if}
									<Button variant="ghost-danger" size="sm" icon="trash-2" onclick={() => (revoking = share)}
										>Remove</Button
									>
								{:else}
									<CopyButton value={share.link} onfail={() => (sharing = share)} />
									<Button variant="ghost" size="sm" icon="share-2" onclick={() => (sharing = share)}>Share</Button>
									<Button
										variant="ghost"
										size="sm"
										icon="pencil"
										iconOnly
										label="Edit link"
										onclick={() => (editing = share)}
									/>
								{/if}
							</div>
						</li>
					{/each}
				</ul>
			{/if}
		</Panel>

		<div class="status-line">
			<Status live state={status.state} label={status.label} />
		</div>
	{/if}
</main>

{#snippet createdFooter()}
	<Button onclick={() => (createOpen = false)}>Done</Button>
{/snippet}

<Dialog
	bind:open={createOpen}
	title={created ? 'Your link is ready' : 'New share link'}
	size="md"
	footer={created ? createdFooter : undefined}
>
	{#if created}
		<LinkReady link={created} />
	{:else}
		<CreateLink
			bind:mode={createMode}
			canList={data.immich.canList}
			agentKey={!signIn}
			immichPublicUrl={data.immich.publicUrl}
			{relayHost}
			relayUrl={data.relay.url}
			oncreated={(l) => {
				created = l;
				void refreshAll();
			}}
		/>
	{/if}
</Dialog>

<Dialog
	open={sharing !== null}
	onclose={() => (sharing = null)}
	title={sharing ? sharing.label || sharing.albumName || 'Share link' : ''}
	size="md"
>
	{#if sharing}
		<LinkReady
			link={toReady(sharing)}
			onrevoke={() => {
				revoking = sharing;
				sharing = null;
			}}
		/>
	{/if}
	{#snippet footer()}
		<Button onclick={() => (sharing = null)}>Done</Button>
	{/snippet}
</Dialog>

<Dialog
	open={revoking !== null}
	onclose={() => (revoking = null)}
	title={isInactive(revoking) ? 'Remove this link?' : 'Revoke this link?'}
>
	<p>
		{#if isInactive(revoking)}
			It already doesn't open. This removes it from your list.
		{:else}
			“{revoking?.label || revoking?.albumName}” will stop working for everyone right away.
			{#if revoking && !revoking.mine && revoking.owner}It's {revoking.owner}'s link.{/if}
			The album stays in Immich.
			{#if revoking?.removesImmichLink}This also removes the link in Immich.{/if}
		{/if}
	</p>
	{#snippet footer()}
		<Button onclick={() => (revoking = null)} autofocus>Cancel</Button>
		<form
			method="POST"
			action="?/revoke"
			use:enhance={() => {
				revokeBusy = true;
				const wasLive = !isInactive(revoking);
				return async ({ result, update }) => {
					await update();
					revokeBusy = false;
					revoking = null;
					if (result.type === 'success') toast(wasLive ? 'Link revoked' : 'Link removed');
				};
			}}
		>
			<input type="hidden" name="id" value={revoking?.id} />
			<Button type="submit" variant="danger" icon="trash-2" loading={revokeBusy}>
				{isInactive(revoking) ? 'Remove link' : 'Revoke link'}
			</Button>
		</form>
	{/snippet}
</Dialog>

<EditLink
	share={editing}
	keyCanUpdate={data.keyCanUpdate}
	{relayHost}
	onclose={() => (editing = null)}
	onremove={(s) => {
		revoking = data.shares.find((x) => x.id === s.id) ?? null;
		editing = null;
	}}
/>

<Dialog bind:open={confirmDisconnect} title="Disconnect from {data.relay.email ?? relayHost}?">
	<p>Links you made stay with that account. They stop opening until this agent connects to it again.</p>
	{#snippet footer()}
		<Button onclick={() => (confirmDisconnect = false)} autofocus>Cancel</Button>
		<form
			method="POST"
			action="?/disconnect"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					confirmDisconnect = false;
					toast('Disconnected');
				}}
		>
			<Button type="submit" variant="danger" icon="unplug">Disconnect</Button>
		</form>
	{/snippet}
</Dialog>

<style>
	/* A lone text button under the text lines up with it, not with its own padding. */
	@media (max-width: 639px) {
		.actions > :global(.btn.ghost-danger:first-child) {
			margin-left: calc(var(--space-3) * -1);
		}
	}

	.status-line :global(.label) {
		font-weight: var(--weight-regular);
		color: var(--color-text-muted);
	}
</style>

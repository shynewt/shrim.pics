<script lang="ts">
	import {
		Badge,
		Button,
		CopyButton,
		Dialog,
		Notice,
		SettingRow,
		SettingsList,
		TopBar,
		formatDate,
		toast
	} from '@shrim/ui';
	import { enhance } from '$app/forms';
	import { refreshAll } from '$app/navigation';
	import ApiKeyForm from '#lib/components/ApiKeyForm.svelte';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	let confirmDisconnect = $state(false);
	let confirmRemoveKey = $state(false);
	let editingKey = $state(false);
	let signingOut = $state(false);

	const signIn = $derived(data.auth === 'immich');
	const isAdmin = $derived(data.me.isAdmin);

	const relayHost = $derived.by(() => {
		try {
			return new URL(data.relay.url).host;
		} catch {
			return data.relay.url;
		}
	});
</script>

<svelte:head><title>Settings – shrim.pics agent</title></svelte:head>

<TopBar width="content" suffix="agent" home="/">
	<Button href="/" variant="ghost" size="sm" icon="arrow-left">Share links</Button>
</TopBar>

<main class="mx-auto grid max-w-content content-start gap-6 px-(--gutter) pt-6 pb-16 md:pt-10">
	<h1>Settings</h1>

	{#if signIn}
		<section class="grid gap-3" aria-labelledby="you-title">
			<h2 class="text-md tracking-normal text-muted" id="you-title">You</h2>
			<SettingsList label="You">
				<SettingRow icon={data.me.via === 'sso' ? 'shield' : 'key-round'} title={data.me.name}>
					{#snippet description()}
						<span class="mb-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
							<span>{data.me.email}</span>
							{#if isAdmin}<Badge>Immich admin</Badge>{/if}
						</span>
						{#if data.me.via === 'sso'}
							Signed in with single sign-on. The agent uses the key “{data.me.keyName}” it made in your Immich account.
						{:else}
							Signed in with your API key “{data.me.keyName}” (ending in <span class="mono">{data.me.keyHint}</span>).
							{#if !data.me.canUpdate}<br />It can't change what friends can do later (needs sharedLink.update).{/if}
							{#if !data.me.canDelete}<br />Revoking a link here leaves the Immich link (needs sharedLink.delete).{/if}
						{/if}
						<br />Signing out on your last browser here makes the agent forget the key.
					{/snippet}
					{#snippet trailing()}
						<form
							method="POST"
							action="?/signOut"
							use:enhance={() => {
								signingOut = true;
								return async ({ update }) => {
									await update();
									signingOut = false;
								};
							}}
						>
							<Button type="submit" size="sm" icon="log-out" loading={signingOut}>Sign out</Button>
						</form>
					{/snippet}
					{#if data.me.olderKey}
						<Notice>
							Your older key “{data.me.olderKey}” is still in Immich. Delete it there if nothing else uses it.
							{#snippet action()}
								<form method="POST" action="?/dismissOlderKey" use:enhance>
									<Button type="submit" size="sm" variant="ghost">Dismiss</Button>
								</form>
							{/snippet}
						</Notice>
					{/if}
					{#if data.me.fullAccess}
						<Notice tone="warning">
							This key has full access to your Immich account. It works, but a key with only the permissions the agent
							needs is safer.
						</Notice>
					{/if}
				</SettingRow>
			</SettingsList>
		</section>
	{/if}

	<section class="grid gap-3" aria-labelledby="agent-title">
		{#if signIn}<h2 class="text-md tracking-normal text-muted" id="agent-title">This agent</h2>{/if}
		<SettingsList label="Connections">
			<SettingRow
				icon="link"
				tone={data.relay.connected && data.relay.status === 'connected'
					? 'success'
					: data.relay.connected
						? 'warning'
						: 'neutral'}
				title="shrim.pics"
			>
				{#snippet description()}
					{#if data.relay.connected && data.relay.status === 'connected' && data.relay.email}
						Connected as {data.relay.email}{relayHost !== 'shrim.pics' ? ` on ${relayHost}` : ''}.
					{:else if data.relay.connected && data.relay.status === 'connected'}
						Connected{relayHost !== 'shrim.pics' ? ` to ${relayHost}` : ''}.
					{:else if data.relay.connected && data.relay.status === 'connecting'}
						Connecting…
					{:else if data.relay.connected}
						Can't reach it right now. Retrying automatically.
					{:else}
						Not connected{relayHost !== 'shrim.pics' ? ` to ${relayHost}` : ''}.
					{/if}
					{#if data.relay.fromEnv}<span class="text-subtle">(set by <code>SHRIM_RELAY_URL</code>)</span>{/if}
					{#if !isAdmin}<br />Only an Immich admin can change this connection.{/if}
				{/snippet}
				{#snippet trailing()}
					{#if !isAdmin}
						<!-- Connecting and disconnecting is for Immich admins. -->
					{:else if data.relay.connected}
						<Button variant="ghost-danger" size="sm" icon="unplug" onclick={() => (confirmDisconnect = true)}
							>Disconnect</Button
						>
					{:else}
						<Button href="/" size="sm">Connect</Button>
					{/if}
				{/snippet}
			</SettingRow>

			<SettingRow icon="server" tone={data.immich.ok ? 'success' : 'danger'} title="Immich">
				{#snippet description()}
					{data.immich.ok ? 'Reachable at' : "Can't reach"} <span class="mono">{data.immich.url}</span>
					<span class="text-subtle">(set by <code>IMMICH_URL</code>)</span>
				{/snippet}
			</SettingRow>

			{#if !signIn}
				<SettingRow icon="key-round" title="Immich API key">
					{#snippet description()}
						{#if data.immich.hasKey}
							<span class="mono">•••• {data.immich.keyHint}</span>{#if data.immich.keySavedAt}, saved {formatDate(
									data.immich.keySavedAt
								)}{/if}
							{#if data.immich.keyFromEnv}
								(set by <code>IMMICH_API_KEY</code>){/if}
							<br />Lists your albums and makes Immich links.
							{data.immich.keyCanUpdate
								? 'Can change links later.'
								: "Can't change links later (no sharedLink.update)."}
						{:else}
							None. You paste Immich links to share albums.
						{/if}
					{/snippet}
					{#snippet trailing()}
						{#if !editingKey && !data.immich.keyFromEnv}
							<Button size="sm" onclick={() => (editingKey = true)}>{data.immich.hasKey ? 'Replace' : 'Add key'}</Button
							>
							{#if data.immich.hasKey}
								<Button
									variant="ghost-danger"
									size="sm"
									iconOnly
									icon="trash-2"
									label="Remove key"
									onclick={() => (confirmRemoveKey = true)}
								/>
							{/if}
						{/if}
					{/snippet}
					{#if editingKey}
						<ApiKeyForm
							immichUrl={data.immich.publicUrl}
							oncancel={() => (editingKey = false)}
							onsaved={async () => {
								editingKey = false;
								toast('API key saved');
								await refreshAll();
							}}
						/>
					{/if}
				</SettingRow>
			{/if}

			{#if data.sso}
				{@const sso = data.sso}
				<SettingRow icon="shield" tone={sso.enabled ? 'success' : 'neutral'} title="Single sign-on">
					{#snippet description()}
						{#if sso.enabled}
							People can sign in here with Immich's single sign-on. The sign-in provider must allow this address as a
							redirect URI for Immich's client:
						{:else}
							Off in Immich. Once Immich signs people in with OAuth, they can sign in here with it too, if the sign-in
							provider allows this address as a redirect URI:
						{/if}
						<span class="mt-1 flex min-w-0 items-center gap-1">
							<code class="min-w-0 mono wrap-break-word whitespace-normal text-text"
								>{#each sso.callbackUrl.split(/(?<=\/)/) as part, i (i)}{part}<wbr />{/each}</code
							>
							<CopyButton value={sso.callbackUrl} label="Copy address" iconOnly variant="ghost" />
						</span>
					{/snippet}
				</SettingRow>
			{/if}

			<SettingRow icon="users" tone={signIn ? 'success' : 'warning'} title="Who can use this page">
				{#snippet description()}
					{#if signIn}
						Everyone signs in with their own Immich account (an API key, or single sign-on) and sees their own links.
						Immich admins see everyone's.
						<span class="text-subtle">(<code>SHRIM_AUTH=immich</code>)</span>
					{:else}
						Anyone who can open it: sign-in is off (<code>SHRIM_AUTH=none</code>). Keep it behind your own sign-in or
						VPN, or remove that setting to sign in with Immich.
					{/if}
				{/snippet}
			</SettingRow>
		</SettingsList>
	</section>
</main>

<Dialog bind:open={confirmDisconnect} title="Disconnect from {relayHost}?">
	<p>Your links stop opening until this agent is connected again. Nothing is deleted.</p>
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

<Dialog bind:open={confirmRemoveKey} title="Remove the API key?">
	<p>You'll paste Immich links again instead. Links you already made keep working.</p>
	{#snippet footer()}
		<Button onclick={() => (confirmRemoveKey = false)} autofocus>Cancel</Button>
		<form
			method="POST"
			action="?/removeApiKey"
			use:enhance={() =>
				async ({ update }) => {
					await update();
					confirmRemoveKey = false;
					toast('API key removed');
				}}
		>
			<Button type="submit" variant="danger">Remove key</Button>
		</form>
	{/snippet}
</Dialog>

<script lang="ts">
	import { Badge, Button, Field, Icon } from '@shrim/ui';
	import { applyAction, enhance } from '$app/forms';
	import SecretInput from './SecretInput.svelte';

	let {
		immichUrl,
		mode = 'save',
		primary = true,
		oncancel,
		onsaved
	}: {
		immichUrl: string | null;
		/** `signIn`: the key signs this person in (posts to the sign-in page). */
		mode?: 'save' | 'signIn';
		/** The page's main action (false when single sign-on is offered above it). */
		primary?: boolean;
		oncancel?: () => void;
		onsaved?: (info: { fullAccess: boolean; canDelete: boolean }) => void;
	} = $props();
	const uid = $props.id();

	let busy = $state(false);
	let error = $state<string | null>(null);

	const signIn = $derived(mode === 'signIn');
	const keysPage = $derived(immichUrl ? `${immichUrl}/user-settings?isOpen=api-keys` : null);
	const perms = $derived([
		...(signIn ? [{ name: 'user.read', why: 'Tells the agent who you are', optional: false }] : []),
		{ name: 'album.read', why: 'Lists your albums so you can pick one', optional: false },
		{ name: 'sharedLink.create', why: 'Makes the Immich link behind each share link', optional: false },
		{ name: 'sharedLink.update', why: 'Lets you change what friends can do later', optional: true },
		{ name: 'sharedLink.delete', why: 'Revoking a link here also removes it in Immich', optional: true }
	]);
</script>

<!-- The same marker as Steps (28px circle), so every numbered list looks alike. -->
{#snippet number(n: number)}
	<span
		class="grid size-7 flex-none place-items-center rounded-full border border-strong text-sm font-semibold text-muted"
		aria-hidden="true">{n}</span
	>
{/snippet}

<form
	class="grid min-w-0 gap-5 text-text"
	method="POST"
	action={signIn ? '?/apiKey' : '?/saveApiKey'}
	use:enhance={() => {
		busy = true;
		error = null;
		return async ({ result }) => {
			busy = false;
			if (result.type === 'redirect') return applyAction(result);
			if (result.type === 'success') {
				onsaved?.({ fullAccess: !!result.data?.fullAccess, canDelete: !!result.data?.canDelete });
				return;
			}
			if (result.type !== 'failure') {
				error = `The agent hit a problem${result.type === 'error' ? ` (error ${result.status ?? 500})` : ''}. Its logs say what; try again after a look.`;
				return;
			}
			const code = result.data?.keyError;
			const missing = (result.data?.missing as string[] | undefined) ?? [];
			error =
				code === 'missing'
					? `This key is missing ${missing.join(' and ')}. In Immich, edit the key, tick ${missing.length > 1 ? 'them' : 'it'}, and paste it again.`
					: code === 'immichDown'
						? "Can't reach Immich right now, so the key wasn't checked. Try again in a moment."
						: code === 'empty'
							? 'Paste the key from Immich.'
							: code === 'tooMany'
								? 'Too many tries. Wait a few minutes and try again.'
								: code === 'unexpected'
									? 'The agent hit a problem while checking the key. Its logs say what; try again after a look.'
									: "Immich didn't accept this key. Copy it again from Immich.";
		};
	}}
>
	{#if !signIn}
		<p class="max-w-measure text-sm text-muted">
			With an Immich API key, the agent can list your albums and make the Immich link for you. Without one, you make the
			link in Immich and paste it here. Your friends won't notice any difference.
		</p>
	{/if}

	<!-- The text starts 4px down, so its first 20px line is centred on the 28px marker. -->
	<ol class="grid gap-4 text-sm [&>li]:flex [&>li]:gap-3" role="list">
		<li>
			{@render number(1)}
			<div class="grid min-w-0 flex-1 gap-2 pt-1">
				{#if keysPage}
					<p>Go to the API keys in your Immich account settings.</p>
					<div>
						<Button href={keysPage} target="_blank" rel="noreferrer" size="sm" trailingIcon="external-link">
							Open API keys in Immich
						</Button>
					</div>
				{:else}
					<p>In Immich, open Account settings, then API keys.</p>
				{/if}
			</div>
		</li>
		<li>
			{@render number(2)}
			<div class="grid min-w-0 flex-1 gap-2 pt-1">
				<p>Choose New API Key, call it <strong>shrim.pics agent</strong>, and tick these permissions:</p>
				<ul class="grid rounded-md border [&>li+li]:border-t" role="list" aria-label="Permissions to tick">
					{#each perms as p (p.name)}
						<li class="flex min-w-0 items-center gap-3 px-3 py-2">
							<!-- A ticked box, like the checkbox in Immich. -->
							<span
								class="grid size-5 flex-none place-items-center rounded-xs bg-primary text-on-primary"
								aria-hidden="true"><Icon name="check" size={16} /></span
							>
							<!-- The badge sits by the name, so the name keeps the row's width on phones. -->
							<span class="grid min-w-0 flex-1">
								<span class="flex flex-wrap items-center gap-x-2 gap-y-0.5">
									<span class="mono text-sm wrap-break-word"
										>{#each p.name.split(/(?<=\.)/) as part, i (i)}{part}<wbr />{/each}</span
									>
									{#if p.optional}<Badge>Optional</Badge>{/if}
								</span>
								<span class="text-xs text-muted">{p.why}</span>
							</span>
						</li>
					{/each}
				</ul>
			</div>
		</li>
		<li>
			{@render number(3)}
			<div class="grid min-w-0 flex-1 gap-2 pt-1"><p>Create the key, copy it, and paste it here.</p></div>
		</li>
	</ol>

	<Field
		id="{uid}-key"
		label={signIn ? 'Your Immich API key' : 'Immich API key'}
		help={signIn
			? 'It stays on this machine and only does what you ticked. Sign out here, or delete the key in Immich, to stop it.'
			: "It stays on this machine. It can list albums and make links. It can't change or delete photos."}
		{error}
	>
		{#snippet children({ describedby, invalid })}
			<SecretInput id="{uid}-key" name="apiKey" mono what="key" {describedby} {invalid} />
		{/snippet}
	</Field>

	<div class={['gap-2', signIn ? 'grid justify-stretch' : 'flex justify-end']}>
		{#if oncancel}<Button onclick={oncancel}>Cancel</Button>{/if}
		{#if signIn}
			<Button type="submit" variant={primary ? 'primary' : 'secondary'} size="lg" full loading={busy}>
				{busy ? 'Checking…' : 'Sign in with this key'}
			</Button>
		{:else}
			<Button type="submit" variant="primary" loading={busy}>{busy ? 'Checking…' : 'Save key'}</Button>
		{/if}
	</div>
</form>

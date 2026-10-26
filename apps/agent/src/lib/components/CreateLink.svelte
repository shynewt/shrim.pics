<script lang="ts">
	import { Notice } from '@shrim/ui';
	import type { ReadyLink } from '#lib/types.ts';
	import AlbumPicker from './AlbumPicker.svelte';
	import ApiKeyForm from './ApiKeyForm.svelte';
	import PasteForm from './PasteForm.svelte';

	let {
		mode = $bindable(),
		canList,
		agentKey = false,
		immichPublicUrl,
		relayHost,
		relayUrl,
		oncreated
	}: {
		mode: 'list' | 'paste';
		canList: boolean;
		/** SHRIM_AUTH=none: the list runs on the agent's own API key, which can be added here. */
		agentKey?: boolean;
		immichPublicUrl: string | null;
		relayHost: string;
		relayUrl: string;
		oncreated: (link: ReadyLink) => void;
	} = $props();

	let keySaved = $state(false);
	let replacingKey = $state(false);
	let fullAccess = $state(false);
	const showKeyForm = $derived(mode === 'list' && ((!canList && !keySaved) || replacingKey));
</script>

{#if showKeyForm}
	<ApiKeyForm
		immichUrl={immichPublicUrl}
		oncancel={() => {
			replacingKey = false;
			if (!canList && !keySaved) mode = 'paste';
		}}
		onsaved={(info) => {
			keySaved = true;
			replacingKey = false;
			fullAccess = info.fullAccess;
		}}
	/>
{:else if mode === 'list'}
	{#if fullAccess}
		<Notice tone="warning">
			This key has full access to your Immich account. It works, but a key with only the permissions listed is safer.
		</Notice>
	{/if}
	<AlbumPicker
		{relayHost}
		{relayUrl}
		{oncreated}
		onpaste={() => (mode = 'paste')}
		onkeyproblem={agentKey ? () => (replacingKey = true) : undefined}
	/>
{:else}
	<PasteForm
		{relayHost}
		{relayUrl}
		{oncreated}
		onaddkey={!agentKey || canList || keySaved ? undefined : () => (mode = 'list')}
	/>
{/if}

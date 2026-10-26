<script lang="ts">
	import { Button, Dialog, EasyId, Notice, toast } from '@shrim/ui';
	import { applyAction, enhance } from '$app/forms';
	import LinkOptions from './LinkOptions.svelte';

	interface EditableShare {
		id: string;
		label: string;
		albumName: string;
		allowUpload: boolean;
		allowDownload: boolean | null;
		showMetadata: boolean | null;
		expiresAt: string | null;
		madeByAgent: boolean;
	}

	let {
		share,
		keyCanUpdate,
		relayHost,
		onclose,
		onremove
	}: {
		share: EditableShare | null;
		keyCanUpdate: boolean;
		relayHost: string;
		onclose: () => void;
		onremove: (share: EditableShare) => void;
	} = $props();
	const uid = $props.id();

	let saving = $state(false);
	let error = $state<string | null>(null);

	const editable = $derived(!!share?.madeByAgent && keyCanUpdate);
	const note = $derived(
		share?.madeByAgent
			? 'To change these here, the Immich API key needs the sharedLink.update permission.'
			: 'These come from the Immich link you pasted. Change them in Immich; they update here when you save.'
	);
	const ERRORS: Record<string, string> = $derived({
		gone: 'The Immich link behind this was deleted in Immich. Remove this link and make a new one.',
		immichDown: "Can't reach Immich right now, so nothing was changed. Try again in a moment.",
		relayDown: `Can't reach ${relayHost} right now, so the expiry wasn't changed. Try again in a moment.`,
		notFound: 'This link no longer exists.',
		format: "That didn't work. Try again."
	});
</script>

<Dialog open={share !== null} {onclose} title="Edit link" size="md">
	{#if share}
		<form
			id="{uid}-form"
			class="grid gap-6 text-text"
			method="POST"
			action="?/edit"
			use:enhance={() => {
				saving = true;
				error = null;
				return async ({ result, update }) => {
					saving = false;
					if (result.type === 'redirect') await applyAction(result);
					else if (result.type === 'success') {
						await update();
						toast('Link updated');
						onclose();
					} else if (result.type === 'failure') error = ERRORS[String(result.data?.editError)] ?? ERRORS.format;
					else error = ERRORS.format;
				};
			}}
		>
			<input type="hidden" name="id" value={share.id} />
			<div class="flex items-center gap-3">
				<EasyId id={share.id} />
				<div>
					<p class="font-medium">{share.label || share.albumName || 'Shared photos'}</p>
					{#if share.label && share.albumName && share.label !== share.albumName}<p class="text-sm text-subtle">
							Album: {share.albumName}
						</p>{/if}
				</div>
			</div>
			<LinkOptions
				permissions={share}
				{editable}
				readonlyNote={note}
				currentExpiry={share.expiresAt}
				name={share.label}
				namePlaceholder={share.albumName}
			/>
			{#if error}<Notice tone="danger">{error}</Notice>{/if}
		</form>
	{/if}
	{#snippet footer()}
		<div class="mr-auto max-xs:order-3 max-xs:mr-0">
			<Button class="-ml-3" variant="ghost-danger" icon="trash-2" onclick={() => share && onremove(share)}
				>Remove link</Button
			>
		</div>
		<Button onclick={onclose}>Cancel</Button>
		<Button type="submit" form="{uid}-form" variant="primary" loading={saving}>{saving ? 'Saving…' : 'Save'}</Button>
	{/snippet}
</Dialog>

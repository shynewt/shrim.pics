<script lang="ts">
	import { Badge, Field, Segmented, SettingRow, SettingsList, Switch, formatDate, type IconName } from '@shrim/ui';

	interface Permissions {
		allowUpload: boolean;
		allowDownload: boolean | null;
		showMetadata: boolean | null;
	}

	let {
		permissions,
		editable,
		readonlyNote = 'These come from the Immich link. To change them, edit the link in Immich.',
		currentExpiry,
		name = '',
		namePlaceholder
	}: {
		/** Starting values; null while the Immich link hasn't been checked yet. */
		permissions: Permissions | null;
		/** Switches, or a read-only On/Off list. */
		editable: boolean;
		readonlyNote?: string;
		/** Editing an existing link: offer "Keep" and show its current expiry. */
		currentExpiry?: string | null;
		name?: string;
		namePlaceholder?: string;
	} = $props();

	const uid = $props.id();
	const editing = $derived(currentExpiry !== undefined);
	// Starts at the sensible default; the person can change it.
	let expires = $derived(currentExpiry === undefined ? '30' : 'keep');
	const options = $derived([
		...(editing ? [{ value: 'keep', label: 'Keep' }] : []),
		{ value: '0', label: 'Never' },
		{ value: '1', label: '1 day' },
		{ value: '7', label: '7 days' },
		{ value: '30', label: '30 days' },
		{ value: '90', label: '90 days' }
	]);

	const rows: Array<{ key: keyof Permissions; icon: IconName; title: string; help: string }> = [
		{
			key: 'allowUpload',
			icon: 'upload',
			title: 'Friends can add photos',
			help: 'Their photos and videos go straight into this album.'
		},
		{
			key: 'allowDownload',
			icon: 'download',
			title: 'Friends can download photos',
			help: 'Full size, one at a time or all at once.'
		},
		{ key: 'showMetadata', icon: 'info', title: 'Show photo details', help: 'Date, camera and place for each photo.' }
	];
</script>

<div class="grid gap-6 text-text">
	{#if permissions}
		<div class="grid min-w-0 gap-2">
			<SettingsList label="What friends can do">
				{#each rows as row (row.key)}
					{#if editable}
						<SettingRow icon={row.icon} title={row.title} description={row.help}>
							{#snippet control()}<Switch name={row.key} checked={!!permissions[row.key]} />{/snippet}
						</SettingRow>
					{:else}
						<SettingRow icon={row.icon} title={row.title} description={row.help} compact>
							{#snippet trailing()}
								{#if permissions[row.key] === null}
									<Badge>Unknown</Badge>
								{:else}
									<Badge variant={permissions[row.key] ? 'success' : 'neutral'}
										>{permissions[row.key] ? 'On' : 'Off'}</Badge
									>
								{/if}
							{/snippet}
						</SettingRow>
					{/if}
				{/each}
			</SettingsList>
			{#if !editable}<p class="text-sm text-muted">{readonlyNote}</p>{/if}
		</div>
	{/if}

	<div class="grid min-w-0 gap-2">
		<span class="text-sm font-medium" id="{uid}-expires">Link expires</span>
		<Segmented name="expires" labelledby="{uid}-expires" {options} bind:value={expires} />
		<p class="text-sm text-muted">
			{#if editing && expires === 'keep'}
				{currentExpiry ? `Expires ${formatDate(currentExpiry)}.` : 'Never expires.'}
			{:else if expires === '0'}
				The link works until you remove it.
			{:else}
				Stops working on {formatDate(Date.now() + Number(expires) * 86_400_000)}.
			{/if}
		</p>
	</div>

	<Field id="{uid}-name" label="Name" help="Only you see this.">
		{#snippet children({ describedby })}
			<input
				id="{uid}-name"
				name="label"
				maxlength="80"
				value={name}
				placeholder={namePlaceholder}
				aria-describedby={describedby}
			/>
		{/snippet}
	</Field>
</div>

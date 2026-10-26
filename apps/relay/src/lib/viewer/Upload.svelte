<script lang="ts">
	import { UPLOAD_PART_SIZE, type UploadBegun, type UploadFinished } from '@shrim/protocol';
	import { Button, Dialog, Icon, Logo, Progress, formatSize, plural } from '@shrim/ui';
	import { onMount } from 'svelte';
	import { MediaQuery } from 'svelte/reactivity';
	import { AgentFailure, RelayFailure, type ShareClient } from './client.ts';

	let {
		open = $bindable(false),
		client,
		album,
		onadded
	}: {
		open?: boolean;
		client: ShareClient;
		album: string;
		onadded: () => void;
	} = $props();

	type Status = 'waiting' | 'uploading' | 'finishing' | 'added' | 'failed' | 'tooLarge' | 'wrongType' | 'stopped';
	interface Item {
		key: number;
		file: File;
		status: Status;
		progress: number;
		preview: string | null;
		abort?: AbortController;
	}

	const RAW = /\.(heic|heif|avif|jxl|dng|cr2|cr3|nef|nrw|arw|raf|orf|rw2|pef|srw|mkv|mts|m2ts|3gp|webm|mov|mp4)$/i;
	const looksLikeMedia = (f: File) => f.size > 0 && (/^(image|video)\//.test(f.type) || RAW.test(f.name));
	const canPreview = (f: File) => /^image\/(jpeg|png|gif|webp|avif)$/.test(f.type);
	const iconButton =
		'relative grid size-8 place-items-center rounded-sm text-muted transition-colors hover:bg-surface-sunken hover:text-text pointer-coarse:size-10 max-xs:touch-target';

	let items = $state<Item[]>([]);
	let running = $state(false);
	let finished = $state(false);
	let dragging = $state(false);
	let confirmStop = $state(false);
	let ownerOffline = $state(false);
	let startedAt = 0;
	let eta = $state('');
	let nextKey = 1;
	let destroyed = false;

	const touch = new MediaQuery('(hover: none) and (pointer: coarse)');

	// Leaving the page mid-upload: stop every request and free the local previews.
	onMount(() => () => {
		destroyed = true;
		stopAll();
		for (const i of items) if (i.preview) URL.revokeObjectURL(i.preview);
	});

	const runTotal = $derived(items.filter((i) => i.status !== 'wrongType' && i.status !== 'tooLarge'));
	const totalBytes = $derived(runTotal.reduce((s, i) => s + i.file.size, 0));
	const doneBytes = $derived(
		runTotal.reduce(
			(s, i) => s + (i.status === 'added' || i.status === 'finishing' ? i.file.size : i.file.size * i.progress),
			0
		)
	);

	function updateEta() {
		const elapsed = (Date.now() - startedAt) / 1000;
		if (elapsed < 5 || !doneBytes) return void (eta = '');
		const left = ((totalBytes - doneBytes) / doneBytes) * elapsed;
		eta =
			left < 20
				? ''
				: left < 60
					? 'Less than a minute left'
					: left < 90
						? 'About 1 minute left'
						: `About ${Math.round(left / 60)} minutes left`;
	}

	const pending = $derived(items.filter((i) => i.status === 'waiting' || i.status === 'failed'));
	const added = $derived(items.filter((i) => i.status === 'added').length);
	const retryable = $derived(items.filter((i) => i.status === 'failed' || i.status === 'stopped'));
	const totalSize = $derived(items.reduce((s, i) => s + i.file.size, 0));

	/** For files dropped anywhere on the page. */
	export function addFiles(files: Iterable<File>) {
		add(files);
	}

	function add(files: Iterable<File>) {
		finished = false;
		for (const file of files) {
			items.push({
				key: nextKey++,
				file,
				status: looksLikeMedia(file) ? 'waiting' : 'wrongType',
				progress: 0,
				preview: canPreview(file) ? URL.createObjectURL(file) : null
			});
		}
	}

	function remove(item: Item) {
		item.abort?.abort();
		if (item.preview) URL.revokeObjectURL(item.preview);
		items = items.filter((i) => i !== item);
	}

	function reset() {
		for (const i of items) if (i.preview) URL.revokeObjectURL(i.preview);
		items = [];
		finished = false;
		ownerOffline = false;
	}

	async function uploadOne(item: Item) {
		item.status = 'uploading';
		item.progress = 0;
		item.abort = new AbortController();
		const { file } = item;
		try {
			const begun = await client.json<UploadBegun>(
				{
					op: 'upload.begin',
					name: file.name,
					type: file.type,
					size: file.size,
					modified: file.lastModified
				},
				undefined,
				item.abort.signal
			);
			const partSize = Math.min(begun.partSize, UPLOAD_PART_SIZE);
			const parts = Math.ceil(file.size / partSize);
			const prepare = async (i: number) =>
				client.prepare(
					{ op: 'upload.part', uploadId: begun.uploadId, index: i },
					new Uint8Array(await file.slice(i * partSize, (i + 1) * partSize).arrayBuffer())
				);
			// Encrypt the next part while this one uploads, so the bar never stalls.
			let next = prepare(0);
			for (let i = 0; i < parts; i++) {
				const prepared = await next;
				item.abort.signal.throwIfAborted();
				if (i + 1 < parts) next = prepare(i + 1);
				await client.sendWithProgress(prepared, (p) => (item.progress = (i + p) / parts), item.abort.signal);
			}
			item.abort.signal.throwIfAborted();
			item.status = 'finishing';
			await client.json<UploadFinished>({ op: 'upload.finish', uploadId: begun.uploadId });
			item.progress = 1;
			item.status = 'added';
		} catch (e) {
			if (item.abort.signal.aborted) {
				item.status = 'stopped';
			} else if (e instanceof AgentFailure && e.head.error === 'too_large') {
				item.status = 'tooLarge';
			} else if (e instanceof AgentFailure && e.head.error === 'unsupported_type') {
				item.status = 'wrongType';
			} else {
				if (e instanceof RelayFailure && (e.code === 'offline' || e.code === 'timeout')) ownerOffline = true;
				item.status = 'failed';
			}
		}
	}

	async function start(list: Item[] = pending) {
		if (running || !list.length) return;
		running = true;
		ownerOffline = false;
		startedAt = Date.now();
		eta = '';
		const etaTimer = setInterval(updateEta, 5000);
		let wakeLock: { release: () => Promise<void> } | null = null;
		try {
			wakeLock =
				(await (
					navigator as unknown as { wakeLock?: { request: (t: string) => Promise<typeof wakeLock> } }
				).wakeLock?.request('screen')) ?? null;
		} catch {
			wakeLock = null;
		}
		for (const i of list) {
			i.status = 'waiting';
			i.progress = 0;
		}
		const queue = [...list];
		const worker = async () => {
			for (let item = queue.shift(); item; item = queue.shift()) {
				// Removed or stopped while it waited: skip it.
				if (item.status === 'waiting' && items.includes(item)) await uploadOne(item);
			}
		};
		await Promise.all([worker(), worker(), worker()]);
		clearInterval(etaTimer);
		void wakeLock?.release().catch(() => {});
		if (destroyed) return;
		running = false;
		finished = true;
		if (items.some((i) => i.status === 'added')) onadded();
	}

	function stopAll() {
		// Mark the waiting ones first, so no worker picks them up once the current ones are aborted.
		for (const i of items) if (i.status === 'waiting') i.status = 'stopped';
		for (const i of items) i.abort?.abort();
		confirmStop = false;
	}

	function requestClose() {
		if (running) {
			confirmStop = true;
			return;
		}
		open = false;
		reset();
	}

	function ondrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (e.dataTransfer?.files.length) add(e.dataTransfer.files);
	}

	function statusText(i: Item): string {
		switch (i.status) {
			case 'waiting':
				return running ? 'Waiting' : '';
			case 'uploading':
				return `Uploading ${Math.round(i.progress * 100)}%`;
			case 'finishing':
				return 'Adding to album…';
			case 'added':
				return 'Added';
			case 'failed':
				return "Couldn't upload. Try again.";
			case 'stopped':
				return 'Stopped';
			case 'tooLarge':
				return 'Too large for this album';
			case 'wrongType':
				return 'Not a photo or video';
		}
	}

	const doneTitle = $derived.by(() => {
		const total = items.filter((i) => i.status !== 'wrongType' && i.status !== 'tooLarge').length;
		if (added < total) return `${added} of ${total} added`;
		const videos = items.filter((i) => i.status === 'added' && i.file.type.startsWith('video/')).length;
		if (videos && videos < added) return `${added} photos and videos added`;
		if (videos) return plural(added, 'video', 'videos') + ' added';
		return plural(added, 'photo', 'photos') + ' added';
	});
</script>

<Dialog bind:open title="Add photos to {album}" size="md" dismissable={!running} onclose={requestClose}>
	{#if finished && !running && items.length}
		<div class="flex flex-col items-center py-6 text-center">
			<span class="mb-4 text-subtle"><Logo size={48} /></span>
			<h3 class="text-text">{doneTitle}</h3>
			<p class="mt-1 text-sm">
				{#if ownerOffline}
					The owner's server went offline. Files that finished are saved. Try the rest later.
				{:else}
					They'll appear in the album in a moment.
				{/if}
			</p>
		</div>
		{#if retryable.length}
			{@render list(retryable)}
		{/if}
	{:else if items.length === 0}
		<label
			class={[
				'drop group flex min-h-50 cursor-pointer flex-col items-center justify-center gap-3 rounded-lg border-drop p-6 text-center font-regular text-muted transition-colors',
				dragging ? 'border-accent bg-accent-soft' : 'border-strong'
			]}
			ondragenter={(e) => (e.preventDefault(), (dragging = true))}
			ondragover={(e) => e.preventDefault()}
			ondragleave={() => (dragging = false)}
			{ondrop}
		>
			<Icon name="upload" size={24} />
			{#if touch.current}
				<span
					class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md border border-primary bg-primary px-4 text-md/sm font-medium text-on-primary"
					>Choose photos and videos</span
				>
			{:else}
				<span class="text-md/sm font-medium text-text">{dragging ? 'Drop to add' : 'Drop photos and videos here'}</span>
				<span
					class="inline-flex h-10 items-center gap-2 rounded-md border border-strong bg-surface px-4 text-sm font-medium text-text transition-colors group-hover:bg-surface-sunken"
					>Choose files</span
				>
			{/if}
			<input
				class="visually-hidden"
				type="file"
				accept="image/*,video/*"
				multiple
				onchange={(e) => {
					add(e.currentTarget.files ?? []);
					e.currentTarget.value = '';
				}}
			/>
		</label>
		<p class="mt-3 flex items-center gap-2 text-sm text-muted">
			<Icon name="lock" size={16} />They're encrypted on this device before they're sent.
		</p>
	{:else}
		<div role="presentation" ondragover={(e) => e.preventDefault()} {ondrop}>
			{@render list(items)}
		</div>
	{/if}

	{#snippet footer()}
		{#if running}
			<div class="mb-2 grid basis-full gap-1.5">
				<Progress value={totalBytes ? (doneBytes / totalBytes) * 100 : 0} label="Upload progress" size="md" />
				<p class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted tabular">
					<span aria-live="polite">{added} of {runTotal.length} added</span>
					<span>{formatSize(doneBytes)} of {formatSize(totalBytes)}</span>
					{#if eta}<span>{eta}</span>{/if}
				</p>
				<p class="text-xs text-subtle">Keep this page open until it's done.</p>
			</div>
		{/if}
		<span class="mr-auto text-sm text-muted tabular max-xs:mr-0 max-xs:mb-2 max-xs:text-center" aria-live="polite">
			{#if !running && items.length && !finished}
				{plural(items.length, 'file', 'files')}, {formatSize(totalSize)}
			{/if}
		</span>
		{#if finished && !running && items.length}
			{#if retryable.length}
				<Button onclick={requestClose}>Done</Button>
				<Button variant="primary" icon="refresh-cw" onclick={() => start(retryable)}>
					Retry {plural(retryable.length, 'file', 'files')}
				</Button>
			{:else}
				<Button
					onclick={() => {
						reset();
					}}>Add more</Button
				>
				<Button variant="primary" onclick={requestClose}>Done</Button>
			{/if}
		{:else if items.length}
			{#if !running}
				<label
					class="add-more inline-flex h-10 cursor-pointer items-center gap-2 rounded-md border border-transparent bg-transparent px-4 text-sm font-medium text-text transition-colors hover:bg-surface-sunken"
				>
					<Icon name="plus" size={16} />Add more
					<input
						class="visually-hidden"
						type="file"
						accept="image/*,video/*"
						multiple
						onchange={(e) => {
							add(e.currentTarget.files ?? []);
							e.currentTarget.value = '';
						}}
					/>
				</label>
			{/if}
			<Button onclick={requestClose}>Cancel</Button>
			<Button variant="primary" loading={running} disabled={!pending.length} onclick={() => start()}>
				{running ? 'Uploading…' : `Upload ${plural(pending.length, 'file', 'files')}`}
			</Button>
		{/if}
	{/snippet}
</Dialog>

{#snippet list(rows: Item[])}
	<ul class="files -mx-2 overflow-auto" role="list">
		{#each rows as item (item.key)}
			<li class="flex min-h-14 items-center gap-3 p-2">
				<span class="grid size-10 flex-none place-items-center overflow-hidden rounded-sm bg-tile text-subtle">
					{#if item.preview}
						<img class="size-full object-cover" src={item.preview} alt="" />
					{:else}
						<Icon name="image" size={20} />
					{/if}
				</span>
				<!-- One shrinkable column: a long file name truncates instead of widening the row. -->
				<span class="grid min-w-0 flex-1 grid-cols-1 gap-1">
					<span class="flex justify-between gap-3 text-sm">
						<span class="min-w-0 truncate font-medium text-text" title={item.file.name}>{item.file.name}</span>
						<span class="flex-none text-subtle tabular">{formatSize(item.file.size)}</span>
					</span>
					{#if item.status === 'uploading'}
						<Progress value={item.progress * 100} label={item.file.name} />
					{:else if item.status === 'finishing'}
						<Progress value={null} label={item.file.name} />
					{/if}
					<span
						class={[
							'text-sm empty:hidden',
							item.status === 'added'
								? 'text-success'
								: ['failed', 'tooLarge', 'wrongType'].includes(item.status)
									? 'text-danger'
									: 'text-muted'
						]}
					>
						{statusText(item)}
					</span>
				</span>
				<span class="grid w-8 flex-none place-items-center pointer-coarse:h-10 pointer-coarse:w-10">
					{#if item.status === 'added'}
						<span class="text-success"><Icon name="check" size={20} /></span>
					{:else if item.status === 'failed' && !running}
						<button class={iconButton} onclick={() => start([item])} aria-label="Try again" title="Try again">
							<Icon name="refresh-cw" size={16} />
						</button>
					{:else if item.status !== 'stopped'}
						<button
							class={iconButton}
							onclick={() => remove(item)}
							aria-label="Remove {item.file.name}"
							title="Remove {item.file.name}"
						>
							<Icon name="x" size={16} />
						</button>
					{/if}
				</span>
			</li>
		{/each}
	</ul>
{/snippet}

<Dialog bind:open={confirmStop} title="Stop uploading?">
	<p>Files that haven't finished won't be added.</p>
	{#snippet footer()}
		<Button onclick={() => (confirmStop = false)} autofocus>Keep uploading</Button>
		<Button variant="danger" onclick={stopAll}>Stop</Button>
	{/snippet}
</Dialog>

<style>
	/* The file input is visually hidden: its label shows the focus ring. */
	.drop:has(input:focus-visible),
	.add-more:has(input:focus-visible) {
		outline: var(--focus-width) solid var(--color-focus);
		outline-offset: var(--focus-offset);
	}

	.files {
		max-height: 50dvh;
	}
</style>

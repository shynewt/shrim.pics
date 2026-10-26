<script lang="ts">
	import type { Manifest } from '@shrim/protocol';
	import { Button, Dialog, Icon, Progress, formatSize, plural } from '@shrim/ui';
	import { onMount } from 'svelte';
	import { AgentFailure, RelayFailure, type ShareClient } from './client.ts';
	import { ZipTooLarge, ZipWriter } from './zip.ts';

	let {
		open = $bindable(false),
		manifest,
		client
	}: { open?: boolean; manifest: Manifest; client: ShareClient } = $props();

	type Phase = 'confirm' | 'running' | 'done' | 'tooBig' | 'cancelled';
	let phase = $state<Phase>('confirm');
	let saved = $state(0);
	let failed = $state(0);
	let bytes = $state(0);
	let offline = $state(false);
	let confirmStop = $state(false);
	let abort: AbortController | null = null;

	// Leaving the page mid-download stops the requests; start() then discards the partial zip.
	onMount(() => () => abort?.abort());

	const title = $derived(manifest.title || 'Shared photos');
	const fileName = $derived(`${title.replace(/[\\/:*?"<>|]/g, '_')}.zip`);
	const total = $derived(manifest.assets.length);
	const videos = $derived(manifest.assets.filter((a) => a.video).length);
	const what = $derived(
		[total - videos && plural(total - videos, 'photo', 'photos'), videos && plural(videos, 'video', 'videos')]
			.filter(Boolean)
			.join(' and ')
	);
	/** Without a file picker the zip is built in memory, so keep it modest. */
	const MEMORY_LIMIT = 1024 ** 3;

	function reset() {
		phase = 'confirm';
		saved = failed = bytes = 0;
		offline = false;
	}

	async function start() {
		abort = new AbortController();
		let sink: { write: (c: Uint8Array) => Promise<void>; close: () => Promise<void>; abort: () => Promise<void> };

		const picker = (window as unknown as { showSaveFilePicker?: (o: object) => Promise<FileSystemFileHandle> })
			.showSaveFilePicker;
		if (picker) {
			let handle: FileSystemFileHandle;
			try {
				handle = await picker({ suggestedName: fileName, types: [{ accept: { 'application/zip': ['.zip'] } }] });
			} catch {
				return; // they closed the save dialog
			}
			const w = await handle.createWritable();
			sink = {
				write: (c) => w.write(c as Uint8Array<ArrayBuffer>),
				close: () => w.close(),
				abort: () => w.abort()
			};
		} else {
			const parts: Uint8Array<ArrayBuffer>[] = [];
			let size = 0;
			sink = {
				write: async (c) => {
					size += c.length;
					if (size > MEMORY_LIMIT) throw new ZipTooLarge();
					parts.push(c as Uint8Array<ArrayBuffer>);
				},
				close: async () => {
					const url = URL.createObjectURL(new Blob(parts, { type: 'application/zip' }));
					const a = document.createElement('a');
					a.href = url;
					a.download = fileName;
					document.body.append(a);
					a.click();
					a.remove();
					setTimeout(() => URL.revokeObjectURL(url), 30_000);
				},
				abort: async () => void (parts.length = 0)
			};
		}

		phase = 'running';
		const zip = new ZipWriter(sink.write);
		const queue = manifest.assets.map((a, i) => ({ asset: a, i }));
		// Fetch two at a time, but write in album order.
		const fetches: Array<Promise<{ data: Uint8Array; name: string } | null> | undefined> = [];
		const fetchOne = (i: number) => {
			const { asset } = queue[i];
			return client
				.blob({ op: 'original', asset: asset.id }, { signal: abort!.signal })
				.then(async ({ blob, head }) => {
					const ext = (head.type ?? '').split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
					return { data: new Uint8Array(await blob.arrayBuffer()), name: head.filename ?? `${title}-${i + 1}.${ext}` };
				})
				.catch((e) => {
					if (e instanceof RelayFailure && (e.code === 'offline' || e.code === 'timeout')) offline = true;
					if (e instanceof AgentFailure || e instanceof RelayFailure) return null;
					throw e;
				});
		};
		try {
			for (let i = 0; i < queue.length; i++) {
				if (abort.signal.aborted || offline) break;
				for (let j = i; j < Math.min(i + 2, queue.length); j++) {
					if (fetches[j]) continue;
					const p = fetchOne(j);
					// A prefetch may never be awaited if the run stops first.
					p.catch(() => {});
					fetches[j] = p;
				}
				const file = await fetches[i]!;
				fetches[i] = undefined;
				if (!file) {
					failed++;
					continue;
				}
				const taken = queue[i].asset.takenAt;
				await zip.add(file.name, file.data, taken ? new Date(taken) : new Date());
				saved++;
				bytes = zip.size;
			}
			if (abort.signal.aborted) {
				await sink.abort();
				phase = 'cancelled';
				return;
			}
			await zip.finish();
			await sink.close();
			phase = 'done';
		} catch (e) {
			await sink.abort().catch(() => {});
			if (e instanceof ZipTooLarge) phase = 'tooBig';
			else if ((e as DOMException).name === 'AbortError') phase = 'cancelled';
			else {
				failed = total - saved;
				phase = 'done';
			}
		}
	}

	function requestClose() {
		if (phase === 'running') return void (confirmStop = true);
		open = false;
		reset();
	}
</script>

<Dialog
	bind:open
	title={phase === 'running' ? 'Downloading…' : 'Download all?'}
	dismissable={phase !== 'running'}
	onclose={requestClose}
>
	{#if phase === 'confirm'}
		<p>Save {what} as one zip file. It's called {fileName}.</p>
	{:else if phase === 'running'}
		<div class="grid gap-2">
			<Progress value={(saved / total) * 100} label="Download progress" size="md" />
			<p class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted tabular">
				<span aria-live="polite">{saved} of {total} saved</span><span>{formatSize(bytes)}</span>
			</p>
			<p class="text-xs text-subtle">Keep this page open until it's done.</p>
		</div>
	{:else if phase === 'done'}
		<div class="flex items-start gap-3">
			<Icon name="check" size={24} class="text-success" />
			{#if failed === 0}
				<p>Saved {fileName}.</p>
			{:else if offline}
				<p>
					The owner's server went offline, so the zip is incomplete. {plural(saved, 'file was', 'files were')} saved.
				</p>
			{:else}
				<p>
					{saved} of {total} saved. {plural(failed, "file couldn't", "files couldn't")} be downloaded, so they're not in the
					zip.
				</p>
			{/if}
		</div>
	{:else if phase === 'tooBig'}
		<p>This album is too big to zip in this browser. Download photos one at a time from the photo viewer.</p>
	{:else}
		<p>Stopped. The zip wasn't finished.</p>
	{/if}

	{#snippet footer()}
		{#if phase === 'confirm'}
			<Button onclick={requestClose}>Cancel</Button>
			<Button variant="primary" icon="download" onclick={start}>Download</Button>
		{:else if phase === 'running'}
			<Button onclick={() => (confirmStop = true)}>Stop</Button>
		{:else}
			<Button onclick={requestClose}>{phase === 'tooBig' ? 'Close' : 'Done'}</Button>
		{/if}
	{/snippet}
</Dialog>

<Dialog bind:open={confirmStop} title="Stop the download?">
	<p>The zip won't be finished.</p>
	{#snippet footer()}
		<Button onclick={() => (confirmStop = false)} autofocus>Keep downloading</Button>
		<Button
			variant="danger"
			onclick={() => {
				abort?.abort();
				confirmStop = false;
			}}>Stop</Button
		>
	{/snippet}
</Dialog>

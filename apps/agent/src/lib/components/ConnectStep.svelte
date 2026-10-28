<script lang="ts">
	import { Button, CodeDisplay, CopyButton, Field, Icon, Notice, Spinner } from '@shrim/ui';
	import { onMount } from 'svelte';
	import { enhance, type SubmitFunction } from '$app/forms';
	import { refreshAll } from '$app/navigation';

	interface Pairing {
		userCode: string;
		approveUrl: string;
		expiresAt: number;
		status: 'waiting' | 'expired' | 'denied' | 'error';
	}

	let {
		relayUrl,
		initial,
		relayStatus,
		setupRejected
	}: { relayUrl: string; initial: Pairing | null; relayStatus: string; setupRejected: boolean } = $props();
	const uid = $props.id();

	let pairing = $state<Pairing | null>(null);
	let renewed = $state(false);
	let failed = $state<'unreachable' | 'url' | null>(null);
	let starting = $state(false);
	let now = $state(Date.now());
	let rejectedNow = $state(false);
	let startForm: HTMLFormElement | null = null;

	const host = $derived.by(() => {
		try {
			return new URL(relayUrl).host;
		} catch {
			return relayUrl;
		}
	});
	const minutesLeft = $derived(pairing ? Math.ceil((pairing.expiresAt - now) / 60_000) : 0);
	const current = $derived(pairing ?? initial);
	const status = 'flex flex-wrap items-center justify-center gap-x-2 gap-y-1 text-sm';

	function start() {
		starting = true;
		startForm?.requestSubmit();
	}

	const afterPair: SubmitFunction =
		() =>
		async ({ result }) => {
			starting = false;
			if (result.type === 'failure') failed = (result.data?.pairError as 'unreachable' | 'url') ?? 'unreachable';
			else {
				failed = null;
				const res = await fetch('/api/connection');
				if (res.ok) pairing = ((await res.json()) as { pairing: Pairing | null }).pairing;
			}
		};

	onMount(() => {
		if (!initial || initial.status !== 'waiting') start();
		else pairing = initial;
		const poll = setInterval(() => void check(), 2000);
		async function check() {
			now = Date.now();
			const res = await fetch('/api/connection').catch(() => null);
			if (!res?.ok) return;
			const c = (await res.json()) as { status: string; pairing: Pairing | null; setupRejected: boolean };
			rejectedNow = c.setupRejected;
			// Any state with an accepted token means we're past this step (the plan may come later).
			if (c.status !== 'not_configured' && c.status !== 'unauthorized') {
				clearInterval(poll);
				await refreshAll();
				return;
			}
			if (c.pairing) pairing = c.pairing;
			if (c.pairing?.status === 'expired' && !starting) {
				renewed = true;
				setTimeout(() => (renewed = false), 6000);
				start();
			}
		}
		return () => clearInterval(poll);
	});
</script>

<form
	method="POST"
	action="?/pair"
	hidden
	{@attach (el) => {
		startForm = el;
		return () => (startForm = null);
	}}
	use:enhance={afterPair}
>
	<input type="hidden" name="relayUrl" value={relayUrl} />
</form>

<div class="grid min-w-0 gap-4">
	<p class="-mt-3 text-sm text-muted">
		Approve this agent from your shrim.pics account. The button below takes the code with it.
	</p>

	{#if relayStatus === 'unauthorized'}
		<Notice tone="warning">This agent was disconnected from its account. Connect it again with the code below.</Notice>
	{:else if setupRejected || rejectedNow}
		<Notice tone="warning">
			The setup token in your compose file has expired or was already used. Connect with the code below instead.
		</Notice>
	{/if}

	{#if failed}
		<Notice tone="danger">
			{#if failed === 'url'}
				Nothing answered at {relayUrl}. Check the address under Other ways to connect.
			{:else}
				Can't reach {host}. Check this machine's internet connection.
			{/if}
			{#snippet action()}<Button size="sm" onclick={start}>Try now</Button>{/snippet}
		</Notice>
	{:else}
		<div class="grid justify-items-center gap-3 rounded-lg bg-surface-sunken px-4 pt-6 pb-5 text-center">
			<p class="text-sm text-muted">Your code</p>
			{#if current && (current.status === 'waiting' || current.status === 'denied')}
				<!-- The copy button hangs off the right, so the code itself stays centred. -->
				<div class="code-row relative flex justify-center max-xs:flex-col max-xs:items-center max-xs:gap-2">
					<CodeDisplay code={current.userCode} dim={current.status === 'denied'} />
					{#if current.status === 'waiting'}
						<CopyButton value={current.userCode} label="Copy code" variant="ghost" size="md" iconOnly />
					{/if}
				</div>
				{#if current.status === 'waiting'}
					<div class="grid justify-items-center gap-1" role="status">
						<p class={[status, 'text-muted']}><Spinner size={16} />Waiting for approval</p>
						<p class="text-xs text-subtle">
							{minutesLeft > 1
								? `The code expires in ${minutesLeft} minutes.`
								: 'The code expires in less than a minute.'}
						</p>
					</div>
				{/if}
				{#if renewed}<p class={[status, 'text-subtle']}>That code expired, so here's a new one.</p>{/if}
			{:else}
				<p class={[status, 'text-muted']} role="status"><Spinner size={16} />Getting a code…</p>
			{/if}
		</div>

		{#if current?.status === 'denied'}
			<Notice tone="warning">
				The request was turned down on {host}.
				{#snippet action()}<Button size="sm" onclick={start}>Get a new code</Button>{/snippet}
			</Notice>
		{:else if current?.status === 'waiting'}
			<div class="grid justify-items-center gap-2 text-center">
				<Button
					href={current.approveUrl}
					target="_blank"
					rel="noreferrer"
					variant="primary"
					size="lg"
					full
					trailingIcon="external-link"
				>
					Approve on {host}
				</Button>
				<p class="text-sm text-muted">
					On another device? Go to <span class="mono">{host}/connect</span> and type the code.
				</p>
			</div>
		{/if}
	{/if}

	<details class="group border-t pt-4">
		<summary
			class="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-sm text-sm font-medium text-muted transition-colors hover:text-text [&::-webkit-details-marker]:hidden"
			><Icon name="chevron-right" size={16} class="transition-transform group-open:rotate-90" />Other ways to connect</summary
		>
		<form class="mt-4 grid gap-5 rounded-lg border p-5" method="POST" action="?/pair" use:enhance={afterPair}>
			<Field
				id="{uid}-relay"
				label="shrim.pics address"
				help="Change this only if you run your own copy of shrim.pics."
			>
				{#snippet children({ describedby })}
					<input
						id="{uid}-relay"
						name="relayUrl"
						type="url"
						class="mono"
						autocomplete="off"
						spellcheck="false"
						defaultValue={relayUrl}
						aria-describedby={describedby}
					/>
				{/snippet}
			</Field>
			<div>
				<Button type="submit">Get a code from this address</Button>
			</div>
		</form>
	</details>
</div>

<style>
	.code-row > :global(.btn) {
		position: absolute;
		left: calc(100% + var(--space-2));
		top: 50%;
		translate: 0 -50%;
	}

	/* Phones: under the code instead. Still positioned (relative), so the Button's 44px hit
	   area stays around the button and doesn't cover the code. */
	@media (max-width: 479px) {
		.code-row > :global(.btn) {
			position: relative;
			left: auto;
			top: auto;
			translate: none;
		}
	}
</style>

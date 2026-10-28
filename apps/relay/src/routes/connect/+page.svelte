<script lang="ts">
	import {
		Button,
		CodeDisplay,
		CodeInput,
		EmptyState,
		Field,
		IconTile,
		TopBar,
		formatRelative,
		type IconName
	} from '@shrim/ui';
	import { enhance } from '$app/forms';
	import FormError from '#lib/components/FormError.svelte';
	import BrandMark from '#lib/components/BrandMark.svelte';
	import Page from '#lib/components/Page.svelte';
	import type { PageProps, SubmitFunction } from './$types';

	let { data, form }: PageProps = $props();
	let busy = $state(false);

	const ERRORS: Record<string, string> = {
		format: 'Codes have 8 letters and numbers, like HQ4M-7XPC.',
		not_found: "We don't know this code. Check it against your agent's page.",
		expired: "This code has expired. Your agent's page already shows a new one.",
		used: "This code was already used. If your agent isn't connected, reload its page for a new code.",
		denied: "This request was turned down. Get a new code on your agent's page.",
		rate: 'Too many tries. Wait a few minutes and try again.'
	};

	const pending = $derived(data.pairing?.state === 'pending' ? data.pairing : null);
	const problem = $derived(form?.error ?? (data.code && !pending ? data.pairing?.state : null));
	type Fact = { icon: IconName; tone: 'success' | 'warning' | 'neutral'; title: string; detail: string };
	const facts = $derived.by((): Fact[] => {
		if (!pending) return [];
		const list: Fact[] = [];
		if (pending.sameNetwork === true) {
			list.push({
				icon: 'check',
				tone: 'success',
				title: 'From your network',
				detail: 'The agent is on the same internet connection as you are now.'
			});
		} else if (pending.sameNetwork === false) {
			list.push({
				icon: 'triangle-alert',
				tone: 'warning',
				title: 'From a different network',
				detail: 'Only continue if your agent runs somewhere else, like a rented server.'
			});
		}
		list.push({
			icon: 'clock',
			tone: 'neutral',
			title: `Asked ${formatRelative(pending.createdAt ?? Date.now())}`,
			detail: 'Codes work for 10 minutes.'
		});
		if (data.replaces) {
			list.push({
				icon: 'refresh-cw',
				tone: 'warning',
				title: 'Replaces your current agent',
				detail: 'The one you connected before stops working.'
			});
		}
		return list;
	});
	/** Long addresses wrap at the @ first. */
	const at = $derived(Math.max(data.email.lastIndexOf('@'), 0));
	const here = $derived('/connect' + (data.code ? `?code=${data.code}` : ''));
	const enhanced: SubmitFunction = () => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	};
</script>

<svelte:head><title>Connect an agent – shrim.pics</title></svelte:head>

{#snippet wire(done: boolean)}
	<div class="mb-3 flex items-center gap-2" aria-hidden="true">
		<IconTile icon="server" tone={done ? 'success' : 'neutral'} />
		<!-- Only the top border: a dashed one is drawn without the other sides. -->
		<span class={['w-10 border-t-2', done ? 'border-success' : 'border-x-0 border-b-0 border-dashed border-strong']}
		></span>
		<BrandMark />
	</div>
{/snippet}

<Page width="narrow">
	{#snippet topbar()}<TopBar width="content"><a class="nav" href="/dashboard">Dashboard</a></TopBar>{/snippet}

	{#if form?.approved}
		<div class="mb-8 grid justify-items-center gap-2 text-center">
			{@render wire(true)}
			<h1 class="text-xl">Agent connected</h1>
			<p class="mb-3 text-muted">Go back to your agent's page. It carries on by itself from there.</p>
			<Button href="/dashboard" icon="arrow-left">Back to dashboard</Button>
		</div>
	{:else if form?.denied}
		<EmptyState icon="ban" title="Request turned down" body="Nothing was connected. The code no longer works.">
			{#snippet action()}<Button href="/dashboard">Back to dashboard</Button>{/snippet}
		</EmptyState>
	{:else}
		<div class="mb-8 grid justify-items-center gap-2 text-center">
			{@render wire(false)}
			<h1>{pending ? 'Connect this agent?' : 'Connect an agent'}</h1>
			<form
				class="text-sm text-muted"
				method="POST"
				action="/logout?next={encodeURIComponent(`/login?next=${encodeURIComponent(here)}`)}"
			>
				It will share albums for <strong class="font-medium wrap-break-word text-text"
					>{data.email.slice(0, at)}<wbr />{data.email.slice(at)}</strong
				>.
				<button type="submit" class="ml-1 whitespace-nowrap link-muted">Not you?</button>
			</form>
		</div>

		<div class="grid gap-6 rounded-lg border bg-surface p-4 xs:p-6">
			{#if problem}
				<FormError>{ERRORS[problem] ?? ERRORS.not_found}</FormError>
			{/if}

			{#if pending}
				<div class="grid justify-items-center gap-3 text-center">
					<span class="text-sm text-muted">Code</span>
					<CodeDisplay code={data.code} />
					<p class="text-sm text-muted">Check it matches the one on your agent's page.</p>
				</div>

				<ul class="grid rounded-md border [&>li+li]:border-t" role="list">
					{#each facts as fact (fact.title)}
						<li class="flex items-start gap-3 px-4 py-3">
							<IconTile icon={fact.icon} tone={fact.tone} size="sm" />
							<div>
								<p
									class={[
										'text-sm font-medium',
										fact.tone === 'success' && 'text-success',
										fact.tone === 'warning' && 'text-warning'
									]}
								>
									{fact.title}
								</p>
								<p class="text-sm text-muted">{fact.detail}</p>
							</div>
						</li>
					{/each}
				</ul>

				<div class="grid gap-1">
					<form method="POST" action="?/approve" use:enhance={enhanced}>
						<input type="hidden" name="code" value={data.code} />
						<Button type="submit" variant="primary" size="lg" full loading={busy}
							>{busy ? 'Connecting…' : 'Connect agent'}</Button
						>
					</form>
					<form method="POST" action="?/deny" use:enhance>
						<input type="hidden" name="code" value={data.code} />
						<Button type="submit" variant="ghost" full>Don't connect</Button>
					</form>
				</div>
			{:else}
				<form method="POST" action="?/lookup" class="grid gap-5">
					<Field id="code" label="Code" help="Your agent's page shows it, under Connect to shrim.pics.">
						{#snippet children({ describedby })}
							<CodeInput id="code" size="lg" {describedby} />
						{/snippet}
					</Field>
					<Button type="submit" variant="primary" size="lg" full>Continue</Button>
				</form>
			{/if}
		</div>
		<p class="mt-6 text-center text-xs text-subtle">Only connect an agent you set up yourself.</p>
	{/if}
</Page>

<script lang="ts">
	import { Badge, Button, EmptyState, Icon, MetaList, Panel, TopBar, formatDate, plural } from '@shrim/ui';
	import Page from '#lib/components/Page.svelte';
	import { PLAN, agentText, liveLinks } from './labels.ts';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();

	const heading = $derived(
		data.q
			? data.more
				? `More than ${data.limit} matches`
				: plural(data.accounts.length, 'match', 'matches')
			: 'Newest accounts'
	);
	const detail = (id: string) => `/admin/accounts/${id}${data.q ? `?q=${encodeURIComponent(data.q)}` : ''}`;
</script>

<svelte:head><title>Accounts – shrim.pics</title></svelte:head>

<Page>
	{#snippet topbar()}
		<TopBar width="content">
			<Button href="/admin" variant="ghost" size="sm" icon="arrow-left">Operator</Button>
		</TopBar>
	{/snippet}

	<h1 class="mb-2">Accounts</h1>
	<p class="mb-6 text-muted">Find someone by email, or paste an account or link ID from a report.</p>

	<form class="mb-6 flex gap-2" method="GET" role="search">
		<label class="visually-hidden" for="q">Email, account or link ID</label>
		<input
			id="q"
			class="min-w-0 flex-1"
			name="q"
			type="search"
			placeholder="Email or ID"
			defaultValue={data.q}
			autocomplete="off"
			spellcheck="false"
		/>
		<Button type="submit" icon="search">Search</Button>
	</form>

	<Panel title={heading} flush>
		{#if data.accounts.length === 0}
			<EmptyState
				icon="search"
				title={data.q ? 'No accounts match' : 'No accounts yet'}
				body={data.q
					? 'Try part of the email, or the ID of one of their links.'
					: 'Accounts show up here once people sign up.'}
			/>
		{:else}
			<ul class="border-t" role="list">
				{#each data.accounts as a (a.id)}
					<!-- The whole row opens the account: the email link stretches over it. -->
					<li
						class="relative flex items-center gap-3 border-b p-4 transition-colors last:border-b-0 hover:bg-surface-sunken has-focus-visible:outline-2 has-focus-visible:-outline-offset-2 has-focus-visible:outline-focus xs:px-6"
					>
						<div class="grid min-w-0 flex-1 gap-1">
							<div class="flex min-w-0 flex-wrap items-center gap-2">
								<a
									class={[
										'font-medium wrap-anywhere no-underline after:absolute after:inset-0 focus-visible:outline-none',
										a.suspended ? 'text-muted' : 'text-text'
									]}
									href={detail(a.id)}>{a.email}</a
								>
								{#if a.suspended}<Badge variant="danger" icon="ban">Suspended</Badge>{/if}
								{#if a.plan}<Badge variant={PLAN[a.plan].tone}>{PLAN[a.plan].label}</Badge>{/if}
							</div>
							<MetaList
								items={[
									{ text: `Joined ${formatDate(a.createdAt)}`, icon: 'plus' },
									{ text: agentText(a.agent), icon: 'server' },
									{ text: liveLinks(a.liveLinks), icon: 'link' }
								]}
							/>
						</div>
						<span class="inline-flex text-subtle" aria-hidden="true"><Icon name="chevron-right" size={16} /></span>
					</li>
				{/each}
			</ul>
			{#if data.more}
				<p class="border-t p-4 text-sm text-muted xs:px-6">
					Showing the newest {data.limit}. Type more of the email to narrow it down.
				</p>
			{/if}
		{/if}
	</Panel>
</Page>

import { error, redirect } from '@sveltejs/kit';
import { accountById, toAccount, type AccountSummary } from './accounts.ts';
import { planView, type PlanView } from './billing.ts';
import { config } from './config.ts';
import { agentOnline } from './router.ts';

/** Operator pages don't exist for anyone else. */
export function requireAdmin(locals: App.Locals) {
	if (!locals.account) redirect(303, '/login');
	if (!locals.account.admin) error(404, 'Not found');
}

export interface AgentFacts {
	online: boolean;
	pairedAt: number | null;
	seenAt: number | null;
}

/** Plan state as the owner's dashboard shows it, or null when this relay doesn't bill. */
export function planFor(accountId: string): PlanView | null {
	if (config.billing === 'off') return null;
	const row = accountById(accountId);
	return row ? planView(toAccount(row)) : null;
}

export function listEntry(a: AccountSummary) {
	return {
		id: a.id,
		email: a.email,
		createdAt: a.createdAt,
		suspended: a.suspended,
		liveLinks: a.liveLinks,
		plan: planFor(a.id)?.status ?? null,
		agent: { online: agentOnline(a.id), pairedAt: a.agentPairedAt, seenAt: a.agentSeenAt } satisfies AgentFacts
	};
}

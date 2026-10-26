import { error, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { accountById, createEmailConfirmation, toAccount, type Account, type AccountSummary } from './accounts.ts';
import { planView, type PlanView } from './billing.ts';
import { config } from './config.ts';
import { operatorConfirmEmail, operatorConfirmLink, sendLater } from './mail.ts';
import { agentOnline } from './router.ts';

/** Operator pages don't exist for anyone else. A listed address confirms itself first. */
export function requireAdmin(locals: App.Locals) {
	if (!locals.account) redirect(303, '/login');
	if (locals.account.adminPending) redirect(303, '/admin/confirm');
	if (!locals.account.admin) error(404, 'Not found');
}

/** Without email, the link goes to the log: only whoever runs the server reads that. */
export function sendOperatorConfirmation(account: Pick<Account, 'id' | 'email'>, origin: string) {
	const token = createEmailConfirmation(account.id);
	if (config.mail.host || dev) sendLater(operatorConfirmEmail(account.email, origin, token));
	else {
		console.warn(
			`[admin] Email isn't set up, so here is the link that confirms ${account.email} as an operator. Open it while signed in: ${operatorConfirmLink(origin, token)}`
		);
	}
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

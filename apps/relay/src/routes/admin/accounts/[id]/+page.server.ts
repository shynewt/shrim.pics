import { error, fail } from '@sveltejs/kit';
import {
	accountById,
	agentTokenInfo,
	createPasswordReset,
	disableShare,
	openReportCount,
	removeAgentToken,
	setSuspended,
	shareById,
	shareState,
	sharesForAccount,
	toAccount
} from '#lib/server/accounts.ts';
import { planFor, requireAdmin } from '#lib/server/admin.ts';
import { config } from '#lib/server/config.ts';
import { formText } from '#lib/server/http.ts';
import { emailOrigin, resetEmail, sendMail } from '#lib/server/mail.ts';
import { agentConnectedAt, agentOnline, disconnectAgent, notifyAccountChanged } from '#lib/server/router.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, params, url }) => {
	requireAdmin(locals);
	const row = accountById(params.id);
	if (!row) error(404, 'Not found');
	const account = toAccount(row);
	const token = agentTokenInfo(row.id);
	const order = { live: 0, expired: 1, disabled: 1 } as const;
	const shares = sharesForAccount(row.id)
		.map((s) => ({
			id: s.id,
			state: shareState(s),
			allowUpload: !!s.allow_upload,
			createdAt: s.created_at,
			expiresAt: s.expires_at,
			disabledAt: s.disabled_at,
			disabledBy: s.disabled_by,
			views: s.views,
			bytesOut: s.bytes_out,
			bytesIn: s.bytes_in
		}))
		.sort((a, b) => order[a.state] - order[b.state] || b.createdAt - a.createdAt);
	return {
		q: url.searchParams.get('q') ?? '',
		account: {
			id: row.id,
			email: row.email,
			createdAt: row.created_at,
			suspended: account.suspended,
			suspendedAt: row.suspended_at,
			admin: account.admin,
			stripeCustomer: row.stripe_customer_id
		},
		billing: config.billing,
		plan: planFor(row.id),
		agent: {
			online: agentOnline(row.id),
			connectedAt: agentConnectedAt(row.id),
			pairedAt: token?.createdAt ?? null,
			seenAt: token?.seenAt ?? null
		},
		shares,
		openReports: openReportCount(row.id),
		mail: !!config.mail.host
	};
};

function target(params: { id: string }) {
	const row = accountById(params.id);
	if (!row) error(404, 'Not found');
	return row;
}

export const actions: Actions = {
	suspend: ({ locals, params }) => {
		requireAdmin(locals);
		const row = target(params);
		setSuspended(row.id, true);
		disconnectAgent(row.id);
		return { done: 'Account suspended' };
	},
	unsuspend: ({ locals, params }) => {
		requireAdmin(locals);
		const id = target(params).id;
		setSuspended(id, false);
		notifyAccountChanged(id);
		return { done: 'Account unsuspended' };
	},
	disconnectAgent: ({ locals, params }) => {
		requireAdmin(locals);
		const row = target(params);
		removeAgentToken(row.id);
		disconnectAgent(row.id);
		return { done: 'Agent disconnected' };
	},
	disable: async ({ locals, params, request }) => {
		requireAdmin(locals);
		const row = target(params);
		const id = formText(await request.formData(), 'shareId');
		const share = shareById(id);
		if (!share || share.account_id !== row.id) return fail(404, { error: 'not_found' as const });
		disableShare(id, 'operator');
		return { done: 'Link disabled' };
	},
	/** With email: sends the owner a reset link. Without: shows it here, to pass on by hand. */
	reset: async ({ locals, params, url }) => {
		requireAdmin(locals);
		const row = target(params);
		const origin = emailOrigin(url);
		const token = createPasswordReset(row.id);
		if (config.mail.host) {
			try {
				await sendMail(resetEmail(row.email, origin, token));
			} catch {
				return fail(502, { error: 'mail' as const });
			}
			return { done: `Reset email sent to ${row.email}` };
		}
		return { resetLink: `${origin}/reset?token=${encodeURIComponent(token)}` };
	}
};

import { fail, redirect } from '@sveltejs/kit';
import {
	SESSION_COOKIE,
	accountById,
	agentTokenInfo,
	deleteAccount,
	disableShare,
	extendPlan,
	pairingJustApproved,
	removeAgentToken,
	rotateAgentToken,
	shareById,
	shareState,
	sharesForAccount,
	verifyPassword
} from '#lib/server/accounts.ts';
import {
	cancelForDeletion,
	checkoutUrl,
	planView,
	portalUrl,
	stripeEnabled,
	syncCheckout
} from '#lib/server/billing.ts';
import { config } from '#lib/server/config.ts';
import { agentOnline, disconnectAgent, notifyAccountChanged } from '#lib/server/router.ts';
import { formText } from '#lib/server/http.ts';
import type { Actions, PageServerLoad } from './$types';

const DAY = 86_400_000;

export const load: PageServerLoad = async ({ locals, url }) => {
	const account = locals.account;
	if (!account) redirect(303, '/login');

	// Back from Stripe Checkout: sync now rather than wait for the webhook.
	const session = url.searchParams.get('checkout');
	if (session && session !== 'cancelled' && stripeEnabled()) {
		const paid = await syncCheckout(session, account.id).catch(() => false);
		redirect(303, paid ? '/dashboard?paid=1' : '/dashboard?pending=1');
	}

	const token = agentTokenInfo(account.id);
	const order = { live: 0, expired: 1, disabled: 1 } as const;
	const shares = sharesForAccount(account.id)
		.map((s) => ({
			id: s.id,
			state: shareState(s),
			allowUpload: !!s.allow_upload,
			createdAt: s.created_at,
			expiresAt: s.expires_at,
			disabledAt: s.disabled_at,
			views: s.views
		}))
		.sort((a, b) => order[a.state] - order[b.state] || b.createdAt - a.createdAt);

	let plan: {
		status: 'none' | 'active' | 'ending' | 'past_due' | 'ended';
		activeUntil: number | null;
		manageable: boolean;
	};
	if (stripeEnabled()) plan = planView(account);
	else {
		const until = account.activeUntil;
		plan = {
			status: account.active ? 'active' : until ? 'ended' : 'none',
			activeUntil: until,
			manageable: false
		};
	}
	// Yearly plans: the refund window is the first 14 days of the paid year.
	const periodStart = plan.activeUntil ? plan.activeUntil - 365 * DAY : null;
	const refundUntil = periodStart && plan.status === 'active' ? periodStart + 14 * DAY : null;

	const relayUrl = config.publicOrigin ?? url.origin;
	return {
		email: account.email,
		billing: config.billing,
		plan,
		refundUntil: refundUntil && refundUntil > Date.now() ? refundUntil : null,
		paid: url.searchParams.get('paid') === '1',
		pending: url.searchParams.get('pending') === '1',
		cancelled: url.searchParams.get('checkout') === 'cancelled',
		agent: {
			online: agentOnline(account.id),
			connected: !!token,
			everSeen: !!token?.seenAt,
			// Approved a code moments ago: the agent picks up its token within seconds.
			connecting: pairingJustApproved(account.id),
			connectedAt: token?.createdAt ?? null,
			seenAt: token?.seenAt ?? null
		},
		shares,
		relayUrl,
		ownRelay: !/^https:\/\/shrim\.pics$/.test(relayUrl),
		agentImage: process.env.SHRIM_AGENT_IMAGE || 'ghcr.io/shynewt/shrim-agent:latest',
		supportEmail: config.operator.email
	};
};

export const actions: Actions = {
	/** Native form post: the browser follows the redirect to Stripe. */
	checkout: async ({ locals, url }) => {
		if (!locals.account) redirect(303, '/login');
		if (!stripeEnabled()) return fail(400, { error: 'billing' });
		redirect(303, await checkoutUrl(locals.account, config.publicOrigin ?? url.origin));
	},
	portal: async ({ locals, url }) => {
		if (!locals.account) redirect(303, '/login');
		if (!stripeEnabled()) return fail(400, { error: 'billing' });
		redirect(303, await portalUrl(locals.account, config.publicOrigin ?? url.origin));
	},
	activate: ({ locals }) => {
		if (!locals.account) redirect(303, '/login');
		if (config.billing !== 'dev') return fail(400, { error: 'billing' });
		extendPlan(locals.account.id);
		notifyAccountChanged(locals.account.id);
		return { activated: true };
	},
	token: ({ locals }) => {
		if (!locals.account) redirect(303, '/login');
		const token = rotateAgentToken(locals.account.id);
		disconnectAgent(locals.account.id);
		return { token };
	},
	disconnectAgent: ({ locals }) => {
		if (!locals.account) redirect(303, '/login');
		removeAgentToken(locals.account.id);
		disconnectAgent(locals.account.id);
		return { agentDisconnected: true };
	},
	disable: async ({ locals, request }) => {
		if (!locals.account) redirect(303, '/login');
		const id = formText(await request.formData(), 'id');
		const share = shareById(id);
		if (!share || share.account_id !== locals.account.id) return fail(404, { error: 'not_found' });
		disableShare(id, 'owner');
		return { disabled: id };
	},
	deleteAccount: async ({ locals, request, cookies }) => {
		if (!locals.account) redirect(303, '/login');
		const password = formText(await request.formData(), 'password');
		const row = accountById(locals.account.id);
		if (!row || !(await verifyPassword(password, row.password_hash))) return fail(400, { deleteError: 'password' });
		try {
			await cancelForDeletion(row.id);
		} catch {
			return fail(502, { deleteError: 'billing' });
		}
		disconnectAgent(row.id);
		deleteAccount(row.id);
		cookies.delete(SESSION_COOKIE, { path: '/' });
		redirect(303, '/?deleted=1');
	}
};

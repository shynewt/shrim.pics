import { fail, redirect } from '@sveltejs/kit';
import { agentTokenInfo, approvePairing, denyPairing, describePairing, formatPairCode } from '#lib/server/accounts.ts';
import { limits } from '#lib/server/limits.ts';
import { formText } from '#lib/server/http.ts';
import type { Actions, PageServerLoad } from './$types';

/** The owner approves the code their agent shows. */
export const load: PageServerLoad = ({ locals, url, getClientAddress }) => {
	if (!locals.account) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const code = formatPairCode(url.searchParams.get('code') ?? '');
	const existing = agentTokenInfo(locals.account.id);
	return {
		email: locals.account.email,
		code,
		pairing: code ? describePairing(code, getClientAddress()) : null,
		replaces: existing ? (existing.seenAt ?? existing.createdAt) : null
	};
};

export type ConnectError = 'format' | 'not_found' | 'expired' | 'used' | 'denied' | 'rate';

export const actions: Actions = {
	/** Typed a code by hand: show its confirm card. */
	lookup: async ({ request }) => {
		const code = formatPairCode(formText(await request.formData(), 'code'));
		if (!code) return fail(400, { error: 'format', code: '' });
		redirect(303, `/connect?code=${code}`);
	},
	approve: async ({ locals, request, getClientAddress }) => {
		if (!locals.account) redirect(303, '/login?next=/connect');
		if (!limits.auth.take(getClientAddress())) return fail(429, { error: 'rate' });
		const code = formatPairCode(formText(await request.formData(), 'code'));
		const result = code ? approvePairing(code, locals.account.id) : 'not_found';
		if (result !== 'approved') return fail(400, { error: result === 'pending' ? 'not_found' : result });
		return { approved: true };
	},
	deny: async ({ locals, request }) => {
		if (!locals.account) redirect(303, '/login?next=/connect');
		const code = formatPairCode(formText(await request.formData(), 'code'));
		if (code) denyPairing(code);
		return { denied: true };
	}
};

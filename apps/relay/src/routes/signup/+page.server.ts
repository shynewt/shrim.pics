import { fail, redirect } from '@sveltejs/kit';
import { accountByEmail, accountCount, createAccount, toAccount, validEmail } from '#lib/server/accounts.ts';
import { sendOperatorConfirmation } from '#lib/server/admin.ts';
import { config } from '#lib/server/config.ts';
import { limits } from '#lib/server/limits.ts';
import { startSession } from '#lib/server/session.ts';
import { safeNext } from '#lib/server/next.ts';
import { formText } from '#lib/server/http.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.account) redirect(303, safeNext(url.searchParams.get('next')));
	return { closed: config.signups === 'closed' && accountCount() > 0 };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const form = await request.formData();
		const email = formText(form, 'email').trim();
		const password = formText(form, 'password');

		if (config.signups === 'closed' && accountCount() > 0) return fail(403, { email, error: 'closed' as const });
		if (!limits.auth.take(getClientAddress())) return fail(429, { email, error: 'rate' as const });
		if (!validEmail(email)) return fail(400, { email, error: 'email' as const });
		if (password.length < 10) return fail(400, { email, error: 'password' as const });
		if (accountByEmail(email)) return fail(409, { email, error: 'taken' as const });

		const account = await createAccount(email, password);
		startSession(cookies, account.id);
		if (toAccount(account).adminPending) sendOperatorConfirmation(account, config.publicOrigin ?? url.origin);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};

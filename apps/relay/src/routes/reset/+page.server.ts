import { fail, redirect } from '@sveltejs/kit';
import { MIN_PASSWORD, accountForPasswordReset, resetPassword } from '#lib/server/accounts.ts';
import { formText } from '#lib/server/http.ts';
import { limits } from '#lib/server/limits.ts';
import { emailOrigin, passwordChangedEmail, sendLater } from '#lib/server/mail.ts';
import { startSession } from '#lib/server/session.ts';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = ({ url }) => {
	const token = url.searchParams.get('token') ?? '';
	const account = accountForPasswordReset(token);
	return { token, email: account?.email ?? null };
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const form = await request.formData();
		const token = formText(form, 'token');
		const password = formText(form, 'password');
		if (!limits.auth.take(getClientAddress())) return fail(429, { error: 'rate' as const });
		if (!accountForPasswordReset(token)) return fail(410, { error: 'invalid' as const });
		if (password.length < MIN_PASSWORD) return fail(400, { error: 'password' as const });

		const account = await resetPassword(token, password);
		if (!account) return fail(410, { error: 'invalid' as const });
		startSession(cookies, account.id);
		sendLater(passwordChangedEmail(account.email, emailOrigin(url)));
		redirect(303, '/dashboard');
	}
};

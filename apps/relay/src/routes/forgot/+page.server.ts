import { fail } from '@sveltejs/kit';
import { accountByEmail, createPasswordReset, normalizeEmail } from '#lib/server/accounts.ts';
import { config } from '#lib/server/config.ts';
import { formText } from '#lib/server/http.ts';
import { limits } from '#lib/server/limits.ts';
import { mailAvailable, resetEmail, sendLater } from '#lib/server/mail.ts';
import type { Actions, PageServerLoad } from './$types';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const load: PageServerLoad = () => ({
	mail: mailAvailable(),
	support: config.operator.email
});

export const actions: Actions = {
	// Answers the same whether or not there's an account, and in the same time:
	// the email goes out in the background.
	default: async ({ request, getClientAddress, url }) => {
		const email = formText(await request.formData(), 'email').trim();
		if (!mailAvailable()) return fail(503, { email, error: 'mail' as const });
		if (!EMAIL.test(email)) return fail(400, { email, error: 'email' as const });
		if (!limits.forgot.take(getClientAddress())) return fail(429, { email, error: 'rate' as const });

		const account = accountByEmail(email);
		if (account && limits.resetMail.take(normalizeEmail(email))) {
			const token = createPasswordReset(account.id);
			sendLater(resetEmail(account.email, config.publicOrigin ?? url.origin, token));
		}
		return { sent: true as const, email };
	}
};

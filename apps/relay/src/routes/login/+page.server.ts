import { fail, redirect } from '@sveltejs/kit';
import { accountByEmail, hashPassword, verifyPassword } from '#lib/server/accounts.ts';
import { limits } from '#lib/server/limits.ts';
import { startSession } from '#lib/server/session.ts';
import { safeNext } from '#lib/server/next.ts';
import { formText } from '#lib/server/http.ts';
import type { Actions, PageServerLoad } from './$types';

// Verified against when the email is unknown, so both cases take the same time.
const dummy = hashPassword('not a real password');

export const load: PageServerLoad = ({ locals, url }) => {
	if (locals.account) redirect(303, safeNext(url.searchParams.get('next')));
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress, url }) => {
		const form = await request.formData();
		const email = formText(form, 'email').trim();
		const password = formText(form, 'password');
		if (!limits.auth.take(getClientAddress())) return fail(429, { email, error: 'rate' as const });

		const account = accountByEmail(email);
		const ok = await verifyPassword(password, account?.password_hash ?? (await dummy));
		if (!account || !ok) return fail(400, { email, error: 'credentials' as const });

		startSession(cookies, account.id);
		redirect(303, safeNext(url.searchParams.get('next')));
	}
};

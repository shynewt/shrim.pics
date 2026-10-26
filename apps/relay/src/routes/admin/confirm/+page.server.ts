import { error, fail, redirect } from '@sveltejs/kit';
import { dev } from '$app/env';
import { confirmEmail } from '#lib/server/accounts.ts';
import { sendOperatorConfirmation } from '#lib/server/admin.ts';
import { config } from '#lib/server/config.ts';
import { formText } from '#lib/server/http.ts';
import { limits } from '#lib/server/limits.ts';
import type { Actions, PageServerLoad } from './$types';

/** Only for an address in SHRIM_ADMIN_EMAILS that isn't confirmed yet. */
function pending(locals: App.Locals) {
	if (!locals.account) redirect(303, '/login');
	if (locals.account.admin) redirect(303, '/admin');
	if (!locals.account.adminPending) error(404, 'Not found');
	return locals.account;
}

export const load: PageServerLoad = ({ locals, url }) => {
	// From the email, signed out: sign in, then come back to the same link.
	if (!locals.account) redirect(303, `/login?next=${encodeURIComponent(url.pathname + url.search)}`);
	const account = pending(locals);
	return {
		email: account.email,
		token: url.searchParams.get('token') ?? '',
		mailed: !!config.mail.host || dev
	};
};

export const actions: Actions = {
	// A button, not the visit itself: link checkers in mail apps open links too.
	confirm: async ({ locals, request }) => {
		const account = pending(locals);
		if (!confirmEmail(formText(await request.formData(), 'token'), account.id)) {
			return fail(410, { error: 'invalid' as const });
		}
		redirect(303, '/admin');
	},
	send: ({ locals, url }) => {
		const account = pending(locals);
		if (!limits.resetMail.take(`confirm:${account.email}`)) return fail(429, { error: 'rate' as const });
		sendOperatorConfirmation(account, config.publicOrigin ?? url.origin);
		return { sent: true as const };
	}
};

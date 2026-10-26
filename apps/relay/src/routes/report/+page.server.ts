import { fail } from '@sveltejs/kit';
import { SHARE_ID_PATTERN } from '@shrim/protocol';
import { createReport, shareById } from '#lib/server/accounts.ts';
import { limits } from '#lib/server/limits.ts';
import { formText } from '#lib/server/http.ts';
import type { Actions } from './$types';

const REASONS = ['illegal', 'consent', 'spam', 'other'] as const;

export const actions: Actions = {
	default: async ({ request, url, getClientAddress }) => {
		const form = await request.formData();
		const link = formText(form, 'link').trim();
		const reason = formText(form, 'reason');
		const details = formText(form, 'details').trim().slice(0, 4000);
		const contact = formText(form, 'contact').trim().slice(0, 200);
		const values = { link, reason, details, contact };

		if (!limits.reports.take(getClientAddress())) return fail(429, { ...values, error: 'rate' as const });
		let id: string | undefined;
		try {
			const u = new URL(link);
			id = u.pathname.match(/^\/s\/([^/]+)$/)?.[1];
			if (u.host !== url.host) id = undefined;
		} catch {
			id = undefined;
		}
		if (!id || !SHARE_ID_PATTERN.test(id) || !shareById(id)) return fail(400, { ...values, error: 'link' as const });
		if (!(REASONS as readonly string[]).includes(reason)) return fail(400, { ...values, error: 'reason' as const });

		createReport({ shareId: id, link, reason, details, contact });
		return { sent: true };
	}
};

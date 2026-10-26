import { fail } from '@sveltejs/kit';
import {
	disableShare,
	openReports,
	operatorOverview,
	resolveReport,
	setSuspended,
	shareById
} from '#lib/server/accounts.ts';
import { requireAdmin } from '#lib/server/admin.ts';
import { config } from '#lib/server/config.ts';
import { databaseSize, lastBackup } from '#lib/server/maintenance.ts';
import { disconnectAgent, routerStats } from '#lib/server/router.ts';
import { formText } from '#lib/server/http.ts';
import type { Actions, PageServerLoad } from './$types';

/** "12 €" → { amount: 12, format: (n) => "1 200 €" }, so revenue reads like the price. */
function priceParts(price: string) {
	const m = price.match(/\d+(?:[.,]\d+)?/);
	if (!m) return null;
	const amount = Number(m[0].replace(',', '.'));
	return { amount, before: price.slice(0, m.index), after: price.slice((m.index ?? 0) + m[0].length) };
}

export const load: PageServerLoad = ({ locals }) => {
	requireAdmin(locals);
	const overview = operatorOverview();
	const price = priceParts(config.price);
	const renewing = overview.plans ? overview.plans.paying - overview.plans.ending : 0;
	return {
		billing: config.billing,
		overview,
		live: routerStats(),
		revenue: price
			? `${price.before}${Math.round(renewing * price.amount).toLocaleString('en-GB')}${price.after}`
			: null,
		backup: lastBackup(),
		databaseSize: databaseSize(),
		uptime: Math.round(process.uptime() * 1000),
		reports: openReports().map((r) => ({
			id: r.id,
			shareId: r.share_id,
			link: r.link,
			reason: r.reason,
			details: r.details,
			contact: r.contact,
			createdAt: r.created_at,
			owner: r.email,
			accountId: r.account_id,
			shareDisabled: r.share_disabled !== null,
			suspended: r.suspended_at !== null
		}))
	};
};

export const actions: Actions = {
	disable: async ({ locals, request }) => {
		requireAdmin(locals);
		const id = formText(await request.formData(), 'shareId');
		if (!shareById(id)) return fail(404);
		disableShare(id, 'operator');
		return { done: 'Link disabled' };
	},
	suspend: async ({ locals, request }) => {
		requireAdmin(locals);
		const id = formText(await request.formData(), 'accountId');
		setSuspended(id, true);
		disconnectAgent(id);
		return { done: 'Account suspended' };
	},
	resolve: async ({ locals, request }) => {
		requireAdmin(locals);
		resolveReport(formText(await request.formData(), 'id'));
		return { done: 'Report closed' };
	}
};

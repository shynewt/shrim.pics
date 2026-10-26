import { config } from '#lib/server/config.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	account: locals.account
		? {
				email: locals.account.email,
				// Listed operators see the link; an unconfirmed address is asked to confirm there.
				admin: locals.account.admin || locals.account.adminPending
			}
		: null,
	billing: config.billing,
	price: config.price,
	sourceUrl: process.env.SHRIM_SOURCE_URL || null,
	operator: config.operator
});

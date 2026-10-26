import { config } from '#lib/server/config.ts';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals }) => ({
	account: locals.account ? { email: locals.account.email, admin: locals.account.admin } : null,
	billing: config.billing,
	price: config.price,
	sourceUrl: process.env.SHRIM_SOURCE_URL || null,
	operator: config.operator
});

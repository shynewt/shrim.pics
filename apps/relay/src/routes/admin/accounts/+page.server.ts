import { ACCOUNT_SEARCH_LIMIT, searchAccounts } from '#lib/server/accounts.ts';
import { listEntry, requireAdmin } from '#lib/server/admin.ts';
import { config } from '#lib/server/config.ts';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = ({ locals, url }) => {
	requireAdmin(locals);
	const q = (url.searchParams.get('q') ?? '').trim().slice(0, 200);
	const found = searchAccounts(q);
	return {
		q,
		billing: config.billing,
		accounts: found.slice(0, ACCOUNT_SEARCH_LIMIT).map(listEntry),
		more: found.length > ACCOUNT_SEARCH_LIMIT,
		limit: ACCOUNT_SEARCH_LIMIT
	};
};

import { redirect } from '@sveltejs/kit';
import { exportAccount } from '#lib/server/accounts.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ locals }) => {
	if (!locals.account) redirect(303, '/login');
	const data = exportAccount(locals.account.id);
	return new Response(JSON.stringify(data, null, 2), {
		headers: {
			'content-type': 'application/json',
			'content-disposition': 'attachment; filename="shrim-pics-my-data.json"',
			'cache-control': 'no-store'
		}
	});
};

import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE, deleteSession } from '#lib/server/accounts.ts';
import { safeNext } from '#lib/server/next.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ cookies, url }) => {
	const token = cookies.get(SESSION_COOKIE);
	if (token) deleteSession(token);
	cookies.delete(SESSION_COOKIE, { path: '/' });
	redirect(303, safeNext(url.searchParams.get('next'), '/'));
};

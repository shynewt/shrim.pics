import { redirect } from '@sveltejs/kit';
import { authEnabled, rememberPerson, startSession } from '#lib/server/auth.ts';
import { SSO_COOKIE, SSO_PATH, endImmichSession, finishSso } from '#lib/server/sso.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!authEnabled()) redirect(303, '/');
	const result = await finishSso(url, cookies.get(SSO_COOKIE));
	cookies.delete(SSO_COOKIE, { path: SSO_PATH });
	if (!result.ok) redirect(303, `/login?sso=${result.reason}`);
	try {
		await rememberPerson(result.user, 'sso', result.credential, result.keyInfo, result.immichSession);
		startSession(cookies, url.protocol === 'https:', result.user.id);
	} catch (e) {
		console.error('[shrim] Single sign-on failed after Immich signed you in:', e);
		redirect(303, '/login?sso=unexpected');
	} finally {
		await endImmichSession(result.immichSession);
	}
	redirect(303, '/');
};

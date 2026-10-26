import { redirect } from '@sveltejs/kit';
import { authEnabled } from '#lib/server/auth.ts';
import { SSO_COOKIE, SSO_PATH, startSso } from '#lib/server/sso.ts';
import type { RequestHandler } from './$types';

/**
 * A link, not a form: the page's CSP only lets forms post to this agent, and that would cover
 * the redirect too. Starting a sign-in changes nothing until the provider sends this same browser back.
 */
export const GET: RequestHandler = async ({ url, cookies }) => {
	if (!authEnabled()) redirect(303, '/');
	let started;
	try {
		started = await startSso(url.origin);
	} catch {
		redirect(303, '/login?sso=unavailable');
	}
	cookies.set(SSO_COOKIE, started.state, {
		path: SSO_PATH,
		httpOnly: true,
		// Lax: the provider sends people back here with a top-level GET.
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		maxAge: 600
	});
	redirect(303, started.url, { external: true });
};

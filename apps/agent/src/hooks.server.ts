import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { authEnabled, localUser, resolveSession } from '#lib/server/auth.ts';
import { config } from '#lib/server/config.ts';
import { refuseLargeBody } from '#lib/server/form.ts';
import { hostAllowed } from '#lib/server/hosts.ts';
import { enqueue } from '#lib/server/handler.ts';
import { startRelay } from '#lib/server/relay.ts';

export async function init() {
	startRelay(enqueue);
}

const PUBLIC = new Set(['/login', '/login/sso', '/login/sso/start']);

/** Forms and JSON only: friends' uploads come in through the relay, not here. */
const MAX_BODY = 256 * 1024;

/** Without sign-in, nothing else stops a page that reaches the agent under a name of its own. */
const checkHost = !authEnabled() || config.allowedHosts.length > 0;

export const handle: Handle = async ({ event, resolve }) => {
	const { hostname } = event.url;
	if (checkHost && !hostAllowed(hostname, config.allowedHosts)) {
		return new Response(
			`This agent doesn't answer on ${hostname}. Open it by IP address, or add ${hostname} to SHRIM_ALLOWED_HOSTS.\n`,
			{ status: 403, headers: { 'content-type': 'text/plain; charset=utf-8', 'x-content-type-options': 'nosniff' } }
		);
	}
	const refused = refuseLargeBody(event.request, MAX_BODY);
	if (refused) return refused;

	event.locals.signedIn = false;
	if (!authEnabled()) {
		event.locals.user = localUser();
		event.locals.signedIn = true;
	} else {
		const found = await resolveSession(event.cookies, event.url.protocol === 'https:');
		if (found.user) {
			event.locals.user = found.user;
			event.locals.signedIn = true;
		} else if (!PUBLIC.has(event.url.pathname)) {
			if (event.request.method !== 'GET' || event.url.pathname.startsWith('/api/')) {
				return Response.json({ error: 'signed_out' }, { status: 401 });
			}
			redirect(303, found.expired ? '/login?expired=1' : '/login');
		}
	}
	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	// same-origin, not no-referrer: no-referrer makes browsers send `Origin: null` on form posts, which fails CSRF checks.
	response.headers.set('referrer-policy', 'same-origin');
	response.headers.set('x-frame-options', 'DENY');
	// Pages show who is signed in and their links: never keep them in a shared cache.
	if (!response.headers.has('cache-control')) response.headers.set('cache-control', 'private, no-store');
	return response;
};

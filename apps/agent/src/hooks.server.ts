import { redirect } from '@sveltejs/kit';
import type { Handle } from '@sveltejs/kit/hooks';
import { authEnabled, localUser, resolveSession } from '#lib/server/auth.ts';
import { enqueue } from '#lib/server/handler.ts';
import { startRelay } from '#lib/server/relay.ts';

export async function init() {
	startRelay(enqueue);
}

const PUBLIC = new Set(['/login', '/login/sso', '/login/sso/start']);

export const handle: Handle = async ({ event, resolve }) => {
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

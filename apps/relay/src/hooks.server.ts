import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, accountForSession, toAccount } from '#lib/server/accounts.ts';
import { checkBillingConfig } from '#lib/server/billing.ts';
import { config } from '#lib/server/config.ts';
import { refuseLargeBody } from '#lib/server/http.ts';
import { checkMailConfig } from '#lib/server/mail.ts';
import { startMaintenance } from '#lib/server/maintenance.ts';

export function init() {
	checkBillingConfig();
	checkMailConfig();
	startMaintenance();
}

const KB = 1024;

/**
 * Browsers that have been here once never try plain http again, so nobody on the network
 * can answer that first request in our place. Two years; no subdomains, which a
 * self-hosted relay may not own.
 */
const HSTS = config.publicOrigin?.startsWith('https://') ? 'max-age=63072000' : null;

/**
 * The most a request body may hold. Viewer requests (uploads included) and agent
 * responses stream through and cap themselves; forms and JSON are small.
 */
function bodyLimit(path: string): number | null {
	if (path.startsWith('/api/v1/s/') || /^\/agent\/v1\/requests\/[^/]+\/response$/.test(path)) return null;
	if (path === '/api/stripe/webhook') return 1024 * KB;
	return 256 * KB;
}

export const handle: Handle = async ({ event, resolve }) => {
	const limit = bodyLimit(event.url.pathname);
	const refused = limit === null ? null : refuseLargeBody(event.request, limit);
	if (refused) return refused;

	const row = accountForSession(event.cookies.get(SESSION_COOKIE));
	event.locals.account = row ? toAccount(row) : null;

	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	// same-origin, not no-referrer: no-referrer makes browsers send `Origin: null` on form posts, which fails CSRF checks.
	response.headers.set('referrer-policy', 'same-origin');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
	if (HSTS) response.headers.set('strict-transport-security', HSTS);
	return response;
};

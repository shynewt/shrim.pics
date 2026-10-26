import type { Handle } from '@sveltejs/kit/hooks';
import { SESSION_COOKIE, accountForSession, toAccount } from '#lib/server/accounts.ts';
import { checkBillingConfig } from '#lib/server/billing.ts';
import { startMaintenance } from '#lib/server/maintenance.ts';

export function init() {
	checkBillingConfig();
	startMaintenance();
}

export const handle: Handle = async ({ event, resolve }) => {
	const row = accountForSession(event.cookies.get(SESSION_COOKIE));
	event.locals.account = row ? toAccount(row) : null;

	const response = await resolve(event);
	response.headers.set('x-content-type-options', 'nosniff');
	// same-origin, not no-referrer: no-referrer makes browsers send `Origin: null` on form posts, which fails CSRF checks.
	response.headers.set('referrer-policy', 'same-origin');
	response.headers.set('x-frame-options', 'DENY');
	response.headers.set('permissions-policy', 'camera=(), microphone=(), geolocation=(), interest-cohort=()');
	return response;
};

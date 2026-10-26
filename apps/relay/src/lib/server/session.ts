import type { Cookies } from '@sveltejs/kit';
import { SESSION_COOKIE, SESSION_DAYS, createSession } from './accounts.ts';
import { config } from './config.ts';

export function startSession(cookies: Cookies, accountId: string) {
	cookies.set(SESSION_COOKIE, createSession(accountId), {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: config.secureCookies,
		maxAge: SESSION_DAYS * 86_400
	});
}

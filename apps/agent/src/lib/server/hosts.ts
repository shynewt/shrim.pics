import { isIP } from 'node:net';

/**
 * Without sign-in (SHRIM_AUTH=none), any web page could otherwise point a name of its own at
 * the agent's address (DNS rebinding) and read the agent as if it were the same site. IP
 * addresses and localhost can't be pointed anywhere else, so they always work.
 * `.example.com` allows example.com and every name under it.
 */
export function hostAllowed(hostname: string, allowed: readonly string[]): boolean {
	const host = hostname
		.toLowerCase()
		.replace(/^\[(.*)\]$/, '$1')
		.replace(/\.$/, '');
	if (isIP(host) || host === 'localhost' || host.endsWith('.localhost')) return true;
	return allowed.some((a) => (a.startsWith('.') ? host === a.slice(1) || host.endsWith(a) : host === a));
}

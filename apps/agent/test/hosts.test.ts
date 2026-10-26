import { describe, expect, it } from 'vitest';
import { hostAllowed } from '../src/lib/server/hosts.ts';

describe('hostAllowed', () => {
	it('always answers on IP addresses and localhost', () => {
		for (const host of ['192.168.1.20', '100.64.0.7', '[::1]', '[fd7a:115c:a1e0::1]', 'localhost', 'agent.localhost']) {
			expect(hostAllowed(host, [])).toBe(true);
		}
	});

	it('answers on other names only when they are listed', () => {
		expect(hostAllowed('rebind.attacker.example', [])).toBe(false);
		expect(hostAllowed('nas.home.arpa', ['nas.home.arpa'])).toBe(true);
		expect(hostAllowed('NAS.home.arpa.', ['nas.home.arpa'])).toBe(true);
		expect(hostAllowed('other.home.arpa', ['nas.home.arpa'])).toBe(false);
	});

	it('takes a leading dot to mean the name and everything under it', () => {
		expect(hostAllowed('box.tail1234.ts.net', ['.ts.net'])).toBe(true);
		expect(hostAllowed('ts.net', ['.ts.net'])).toBe(true);
		expect(hostAllowed('evil-ts.net', ['.ts.net'])).toBe(false);
	});
});

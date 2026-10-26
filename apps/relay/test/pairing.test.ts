import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.SHRIM_DATA_DIR = mkdtempSync(join(tmpdir(), 'shrim-pairing-'));
const accounts = await import('../src/lib/server/accounts.ts');
const { safeNext } = await import('../src/lib/server/next.ts');

describe('pairing', () => {
	it('hands the token to the agent once, after the owner approves', async () => {
		const owner = await accounts.createAccount('pair@shrim.test', 'a-long-enough-password');
		const { deviceCode, userCode } = accounts.startPairing();
		expect(userCode).toMatch(/^[2-9A-HJ-NP-Z]{4}-[2-9A-HJ-NP-Z]{4}$/);
		expect(accounts.pollPairing(deviceCode)).toEqual({ status: 'pending' });

		// Typed sloppily by a human: lowercase, no dash, with spaces.
		expect(accounts.approvePairing(` ${userCode.replace('-', '').toLowerCase()} `, owner.id)).toBe('approved');
		expect(accounts.approvePairing(userCode, owner.id)).toBe('used');
		// Nothing secret waits in the database for the agent.
		expect(accounts.agentTokenInfo(owner.id)).toBeNull();

		const polled = accounts.pollPairing(deviceCode);
		expect(polled.status).toBe('approved');
		const token = (polled as { token: string }).token;
		expect(accounts.accountForAgentToken(`Bearer ${token}`)?.id).toBe(owner.id);
		// Collected once, then gone.
		expect(accounts.pollPairing(deviceCode)).toEqual({ status: 'expired' });
	});

	it('rejects unknown codes and wrong device codes', () => {
		expect(accounts.approvePairing('ZZZZ-ZZZZ', 'nobody')).toBe('not_found');
		expect(accounts.approvePairing('nonsense', 'nobody')).toBe('not_found');
		expect(accounts.pollPairing('not-a-real-device-code-at-all')).toEqual({ status: 'expired' });
	});
});

describe('next redirects stay on this site', () => {
	it.each([
		['/pair?code=ABCD-EFGH', '/pair?code=ABCD-EFGH'],
		['/dashboard', '/dashboard'],
		['https://evil.example', '/dashboard'],
		['//evil.example', '/dashboard'],
		['/\\evil.example', '/dashboard'],
		[null, '/dashboard']
	])('%s → %s', (input, expected) => {
		expect(safeNext(input)).toBe(expected);
	});
});

describe('easy ids', async () => {
	const { easyId } = await import('@shrim/protocol');
	it("never repeat among one account's live links", async () => {
		const owner = await accounts.createAccount(`easy-${Date.now()}@shrim.test`, 'a-long-enough-password');
		const ids = Array.from({ length: 300 }, () => accounts.createShare(owner.id, false, null));
		expect(new Set(ids.map(easyId)).size).toBe(300);
	});
});

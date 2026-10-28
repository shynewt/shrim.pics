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

describe('setup tokens', async () => {
	const { db } = await import('../src/lib/server/db.ts');
	const count = (accountId: string) =>
		(db.prepare('SELECT COUNT(*) AS n FROM setup_tokens WHERE account_id = ?').get(accountId) as { n: number }).n;

	it('give the agent its own token once, and the other setup tokens stop working', async () => {
		const owner = await accounts.createAccount('setup@shrim.test', 'a-long-enough-password');
		const first = accounts.createSetupToken(owner.id);
		const second = accounts.createSetupToken(owner.id);
		expect(first.token).toMatch(/^shr_setup_/);

		const token = accounts.redeemSetupToken(second.token);
		expect(accounts.accountForAgentToken(`Bearer ${token}`)?.id).toBe(owner.id);
		expect(accounts.redeemSetupToken(second.token)).toBeNull();
		expect(accounts.redeemSetupToken(first.token)).toBeNull();
		expect(count(owner.id)).toBe(0);
	});

	it('refuse expired, unknown and malformed tokens', async () => {
		const owner = await accounts.createAccount('setup-old@shrim.test', 'a-long-enough-password');
		const { token } = accounts.createSetupToken(owner.id);
		db.prepare('UPDATE setup_tokens SET expires_at = ? WHERE account_id = ?').run(Date.now() - 1, owner.id);
		expect(accounts.redeemSetupToken(token)).toBeNull();
		expect(accounts.redeemSetupToken('shr_setup_made-up')).toBeNull();
		expect(accounts.redeemSetupToken('')).toBeNull();
		expect(accounts.agentTokenInfo(owner.id)).toBeNull();
	});

	it('stop working once an agent connects another way, or is disconnected', async () => {
		const owner = await accounts.createAccount('setup-code@shrim.test', 'a-long-enough-password');
		const leaked = accounts.createSetupToken(owner.id).token;
		const { deviceCode, userCode } = accounts.startPairing();
		accounts.approvePairing(userCode, owner.id);
		const paired = accounts.pollPairing(deviceCode) as { token: string };
		expect(accounts.redeemSetupToken(leaked)).toBeNull();
		expect(accounts.accountForAgentToken(`Bearer ${paired.token}`)?.id).toBe(owner.id);

		const later = accounts.createSetupToken(owner.id).token;
		accounts.removeAgentToken(owner.id);
		expect(accounts.redeemSetupToken(later)).toBeNull();
	});

	it('keep only the newest few per account', async () => {
		const owner = await accounts.createAccount('setup-many@shrim.test', 'a-long-enough-password');
		const tokens = Array.from({ length: 7 }, () => accounts.createSetupToken(owner.id).token);
		expect(count(owner.id)).toBe(5);
		expect(accounts.redeemSetupToken(tokens[0])).toBeNull();
		expect(accounts.redeemSetupToken(tokens[6])).not.toBeNull();
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

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

process.env.SHRIM_DATA_DIR = mkdtempSync(join(tmpdir(), 'shrim-reset-'));
const accounts = await import('../src/lib/server/accounts.ts');
const { db } = await import('../src/lib/server/db.ts');
const { cleanUp } = await import('../src/lib/server/maintenance.ts');
const mail = await import('../src/lib/server/mail.ts');

afterEach(() => vi.useRealTimers());

describe('password reset', () => {
	it('sets a new password once, signs everyone out, and kills older links', async () => {
		const a = await accounts.createAccount('reset@shrim.test', 'the-old-password');
		const session = accounts.createSession(a.id);
		const first = accounts.createPasswordReset(a.id);
		const second = accounts.createPasswordReset(a.id);

		// Stored hashed, one per account.
		const rows = db.prepare('SELECT token_hash FROM password_resets WHERE account_id = ?').all(a.id) as {
			token_hash: string;
		}[];
		expect(rows).toEqual([{ token_hash: accounts.sha256(second) }]);

		expect(accounts.accountForPasswordReset(first)).toBeUndefined();
		expect(accounts.accountForPasswordReset(second)?.id).toBe(a.id);

		expect(await accounts.resetPassword(second, 'the-new-password')).toMatchObject({ id: a.id });
		const row = accounts.accountById(a.id)!;
		expect(await accounts.verifyPassword('the-new-password', row.password_hash)).toBe(true);
		expect(await accounts.verifyPassword('the-old-password', row.password_hash)).toBe(false);
		expect(accounts.accountForSession(session)).toBeUndefined();

		// Used up.
		expect(await accounts.resetPassword(second, 'yet-another-password')).toBeNull();
	});

	it('gives one winner when the same link is used twice at once', async () => {
		const a = await accounts.createAccount('race@shrim.test', 'the-old-password');
		const token = accounts.createPasswordReset(a.id);
		const results = await Promise.all([
			accounts.resetPassword(token, 'password-number-one'),
			accounts.resetPassword(token, 'password-number-two')
		]);
		expect(results.filter(Boolean)).toHaveLength(1);
	});

	it('expires after an hour and is cleaned up', async () => {
		const a = await accounts.createAccount('expire@shrim.test', 'the-old-password');
		const token = accounts.createPasswordReset(a.id);
		vi.useFakeTimers({ now: Date.now() + accounts.RESET_MINUTES * 60_000 + 1000, toFake: ['Date'] });
		expect(accounts.accountForPasswordReset(token)).toBeUndefined();
		expect(await accounts.resetPassword(token, 'too-late-password')).toBeNull();
		cleanUp();
		expect(db.prepare('SELECT COUNT(*) AS n FROM password_resets WHERE account_id = ?').get(a.id)).toEqual({ n: 0 });
	});

	it('ignores missing and made-up tokens', () => {
		expect(accounts.accountForPasswordReset('')).toBeUndefined();
		expect(accounts.accountForPasswordReset(null)).toBeUndefined();
		expect(accounts.accountForPasswordReset('not-a-real-token')).toBeUndefined();
	});
});

describe('account search', () => {
	it('finds by part of the email, account ID or link ID, with LIKE wildcards taken literally', async () => {
		const a = await accounts.createAccount('Find.Me_100%@shrim.test', 'a-long-enough-password');
		await accounts.createAccount('findxme@shrim.test', 'a-long-enough-password');
		const link = accounts.createShare(a.id, false, null);

		expect(accounts.searchAccounts('find.me').map((r) => r.email)).toEqual(['find.me_100%@shrim.test']);
		expect(accounts.searchAccounts('me_1').map((r) => r.id)).toEqual([a.id]);
		expect(accounts.searchAccounts('100%').map((r) => r.id)).toEqual([a.id]);
		expect(accounts.searchAccounts(a.id).map((r) => r.id)).toEqual([a.id]);
		expect(accounts.searchAccounts(link)[0]).toMatchObject({ id: a.id, liveLinks: 1, agentPairedAt: null });
		expect(accounts.searchAccounts('nobody-has-this')).toEqual([]);
		expect(accounts.searchAccounts('').length).toBeGreaterThanOrEqual(2);
	});
});

describe('emails', () => {
	it('carry the link in text and HTML, with nothing loaded from elsewhere', () => {
		const e = mail.resetEmail('someone@shrim.test', 'https://shrim.pics', 'abc_DEF-123');
		expect(e.subject).toBe('Reset your shrim.pics password');
		expect(e.text).toContain('https://shrim.pics/reset?token=abc_DEF-123');
		expect(e.html).toContain('<a href="https://shrim.pics/reset?token=abc_DEF-123">');
		expect(e.html).not.toMatch(/<img|<link|src=|url\(/);
	});
});

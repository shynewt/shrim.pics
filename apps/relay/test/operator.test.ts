import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.SHRIM_DATA_DIR = mkdtempSync(join(tmpdir(), 'shrim-operator-'));
process.env.SHRIM_ADMIN_EMAILS = 'ops@shrim.test, other-ops@shrim.test';
const accounts = await import('../src/lib/server/accounts.ts');

const flags = (id: string) => {
	const { admin, adminPending } = accounts.toAccount(accounts.accountById(id)!);
	return { admin, adminPending };
};

describe('operator rights', () => {
	it('wait until the listed address is confirmed, by its own account', async () => {
		const ops = await accounts.createAccount('Ops@shrim.test', 'a-long-password');
		const other = await accounts.createAccount('other-ops@shrim.test', 'a-long-password');
		const someone = await accounts.createAccount('someone@shrim.test', 'a-long-password');
		expect(flags(ops.id)).toEqual({ admin: false, adminPending: true });
		expect(flags(someone.id)).toEqual({ admin: false, adminPending: false });

		const token = accounts.createEmailConfirmation(ops.id);
		// Someone else's link, a made-up one, or an older one: no.
		expect(accounts.confirmEmail(token, other.id)).toBe(false);
		expect(accounts.confirmEmail('made-up', ops.id)).toBe(false);
		const newer = accounts.createEmailConfirmation(ops.id);
		expect(accounts.confirmEmail(token, ops.id)).toBe(false);

		expect(accounts.confirmEmail(newer, ops.id)).toBe(true);
		expect(flags(ops.id)).toEqual({ admin: true, adminPending: false });
		expect(accounts.confirmEmail(newer, ops.id)).toBe(false); // used up
	});

	it('come with a password reset too, since its link went to the address', async () => {
		const ops = accounts.accountByEmail('other-ops@shrim.test')!;
		expect(flags(ops.id).admin).toBe(false);
		await accounts.resetPassword(accounts.createPasswordReset(ops.id), 'a-new-long-password');
		expect(flags(ops.id)).toEqual({ admin: true, adminPending: false });
	});
});

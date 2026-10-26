import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.SHRIM_DATA_DIR = mkdtempSync(join(tmpdir(), 'shrim-input-'));
const { validEmail } = await import('../src/lib/server/accounts.ts');
const { refuseLargeBody } = await import('../src/lib/server/http.ts');

describe('validEmail', () => {
	it('takes ordinary addresses and refuses the rest', () => {
		for (const ok of ['a@b.co', 'first.last+tag@mail.example.org', 'josé@exämple.de'])
			expect(validEmail(ok)).toBe(true);
		for (const bad of ['', 'a', 'a@b', 'a@b.', 'a@.b', 'a@b..c', 'a b@c.de', 'a@b@c.de', `${'a'.repeat(250)}@b.co`]) {
			expect(validEmail(bad)).toBe(false);
		}
	});

	it('answers in linear time, even for input built to make a regex backtrack', () => {
		const evil = `a@${'.'.repeat(100_000)}@`;
		const started = performance.now();
		expect(validEmail(evil)).toBe(false);
		expect(/^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/.test(evil)).toBe(false); // without the length cap, too
		expect(performance.now() - started).toBeLessThan(50);
	});
});

describe('refuseLargeBody', () => {
	const post = (headers: Record<string, string>) =>
		new Request('http://relay.test/login', { method: 'POST', headers, body: 'x', duplex: 'half' } as RequestInit);

	it('lets small bodies and bodiless requests through', () => {
		expect(refuseLargeBody(new Request('http://relay.test/'), 10)).toBeNull();
		expect(refuseLargeBody(post({ 'content-length': '1' }), 10)).toBeNull();
	});

	it('refuses bodies over the limit, and bodies that do not say their size', () => {
		expect(refuseLargeBody(post({ 'content-length': '11' }), 10)?.status).toBe(413);
		expect(refuseLargeBody(post({}), 10)?.status).toBe(411);
		expect(refuseLargeBody(post({ 'content-length': 'lots' }), 10)?.status).toBe(411);
	});
});

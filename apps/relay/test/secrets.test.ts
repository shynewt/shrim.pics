import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { secret } from '../src/lib/server/config.ts';

const dir = mkdtempSync(join(tmpdir(), 'shrim-secrets-'));
const file = (content: string) => {
	const path = join(dir, `s${Math.random().toString(36).slice(2)}`);
	writeFileSync(path, content);
	return path;
};

describe('secret', () => {
	it('reads the plain variable as before, or an empty string', () => {
		expect(secret('TOKEN', { TOKEN: 'abc' })).toBe('abc');
		expect(secret('TOKEN', {})).toBe('');
	});

	it('reads the file named by <NAME>_FILE', () => {
		expect(secret('TOKEN', { TOKEN_FILE: file('from-file') })).toBe('from-file');
	});

	it('drops one trailing newline, and only one', () => {
		expect(secret('TOKEN', { TOKEN_FILE: file('abc\n') })).toBe('abc');
		expect(secret('TOKEN', { TOKEN_FILE: file('abc\r\n') })).toBe('abc');
		expect(secret('TOKEN', { TOKEN_FILE: file('abc\n\n') })).toBe('abc\n');
		expect(secret('TOKEN', { TOKEN_FILE: file(' a b ') })).toBe(' a b ');
	});

	it('refuses to start when both are set', () => {
		expect(() => secret('TOKEN', { TOKEN: 'abc', TOKEN_FILE: file('def') })).toThrow(
			'Set either TOKEN or TOKEN_FILE, not both'
		);
	});

	it('treats an empty variable as unset, as env files often leave them blank', () => {
		expect(secret('TOKEN', { TOKEN: '', TOKEN_FILE: file('def') })).toBe('def');
		expect(secret('TOKEN', { TOKEN: 'abc', TOKEN_FILE: '' })).toBe('abc');
	});

	it('fails when the file cannot be read, naming it but never printing contents', () => {
		const missing = join(dir, 'nope');
		expect(() => secret('TOKEN', { TOKEN_FILE: missing })).toThrow(`TOKEN_FILE (${missing}) could not be read: ENOENT`);
		expect(() => secret('TOKEN', { TOKEN_FILE: dir })).toThrow('could not be read: EISDIR');

		const read = () => {
			throw Object.assign(new Error('hunter2 leaked in the message'), { code: 'EACCES' });
		};
		const error = (() => {
			try {
				secret('TOKEN', { TOKEN_FILE: '/run/secrets/token' }, read);
			} catch (e) {
				return (e as Error).message;
			}
		})();
		expect(error).toBe('TOKEN_FILE (/run/secrets/token) could not be read: EACCES');
	});
});

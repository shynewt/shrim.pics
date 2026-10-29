import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'shrim-agent-auto-'));
const { wanted, withLink } = await import('../src/lib/server/auto-links.ts');
const { AGENT_MADE, ownText } = await import('../src/lib/server/immich.ts');

const since = '2026-10-29T10:00:00.000Z';
const link = (over: Record<string, unknown> = {}) => ({
	id: 'link-1',
	key: 'key-1',
	type: 'ALBUM' as const,
	description: null,
	password: null,
	createdAt: '2026-10-29T10:05:00.000Z',
	expiresAt: null,
	allowUpload: false,
	allowDownload: true,
	showMetadata: true,
	...over
});

describe('which Immich links get a shrim.pics link', () => {
	it('a new one does', () => {
		expect(wanted(link(), since, [], [])).toBe(true);
	});

	it('older, password, expired and the agent’s own links don’t', () => {
		expect(wanted(link({ createdAt: '2026-10-29T09:00:00.000Z' }), since, [], [])).toBe(false);
		expect(wanted(link({ password: 'secret' }), since, [], [])).toBe(false);
		expect(wanted(link({ expiresAt: '2026-01-01T00:00:00.000Z' }), since, [], [])).toBe(false);
		expect(wanted(link({ description: AGENT_MADE }), since, [], [])).toBe(false);
	});

	it('nor one that already has a link, or whose link was revoked here', () => {
		const share = { immich: { key: 'key-1' } } as never;
		expect(wanted(link(), since, [share], [])).toBe(false);
		expect(wanted(link(), since, [], ['link-1'])).toBe(false);
	});
});

describe('the description', () => {
	it('puts the link first, on a line of its own, and keeps theirs', () => {
		expect(withLink('https://shrim.pics/s/a#k', null)).toBe('https://shrim.pics/s/a#k');
		expect(withLink('https://shrim.pics/s/a#k', '  ')).toBe('https://shrim.pics/s/a#k');
		expect(withLink('https://shrim.pics/s/a#k', 'for the neighbours')).toBe(
			'https://shrim.pics/s/a#k\nfor the neighbours'
		);
	});
});

describe('what friends see as the description', () => {
	it('leaves out the link the agent put in front, and its own note', () => {
		expect(ownText('https://shrim.pics/s/aRL1oNrr4K#AxzKk3Bo-tz_0j\nfor the neighbours')).toBe('for the neighbours');
		expect(ownText('https://share.example.com/s/abc#k')).toBe('');
		expect(ownText(AGENT_MADE)).toBe('');
		expect(ownText(null)).toBe('');
	});

	it('keeps links people wrote themselves', () => {
		expect(ownText('Photos from https://example.com/party')).toBe('Photos from https://example.com/party');
		expect(ownText('Our trip\nhttps://shrim.pics/s/a#k')).toBe('Our trip\nhttps://shrim.pics/s/a#k');
	});
});

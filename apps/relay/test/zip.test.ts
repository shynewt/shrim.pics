import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ZipWriter, crc32 } from '../src/lib/viewer/zip.ts';

describe('zip writer', () => {
	it('computes the standard CRC-32', () => {
		expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
	});

	it('writes a zip that unzip accepts, with unique names', async () => {
		const parts: Uint8Array[] = [];
		const zip = new ZipWriter(async (c) => void parts.push(c.slice()));
		await zip.add('a.jpg', new TextEncoder().encode('first'));
		await zip.add('a.jpg', new TextEncoder().encode('second'));
		await zip.add('ünïcode.txt', new Uint8Array(0));
		await zip.finish();
		const dir = mkdtempSync(join(tmpdir(), 'shrim-zip-'));
		const file = join(dir, 'out.zip');
		writeFileSync(file, Buffer.concat(parts));
		const listing = execFileSync('unzip', ['-l', file], { encoding: 'utf8' });
		expect(listing).toContain('a.jpg');
		expect(listing).toContain('a (2).jpg');
		execFileSync('unzip', ['-q', '-o', file, '-d', dir]);
		expect(readFileSync(join(dir, 'a (2).jpg'), 'utf8')).toBe('second');
		execFileSync('unzip', ['-tq', file]); // CRCs check out
	});
});

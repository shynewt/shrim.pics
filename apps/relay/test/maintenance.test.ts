import { existsSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const dataDir = mkdtempSync(join(tmpdir(), 'shrim-maintenance-'));
process.env.SHRIM_DATA_DIR = dataDir;
const { backup, lastBackup } = await import('../src/lib/server/maintenance.ts');

const dir = join(dataDir, 'backups');

describe('backup', () => {
	it('puts a complete copy under the final name and leaves no temporary file', () => {
		const file = backup();
		expect(file.startsWith(dir)).toBe(true);
		expect(existsSync(file)).toBe(true);
		expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
		expect(lastBackup()?.size).toBeGreaterThan(0);
	});

	it('replaces the same day’s backup, going through a temporary name', () => {
		const file = backup();
		// A stale temporary file of the same day must not make VACUUM INTO refuse.
		writeFileSync(`${file}.tmp`, 'half a copy');
		expect(backup()).toBe(file);
		expect(existsSync(`${file}.tmp`)).toBe(false);
	});

	it('removes leftover temporary files of earlier days, and keeps unrelated files', () => {
		mkdirSync(dir, { recursive: true });
		writeFileSync(join(dir, 'relay-2020-01-01.sqlite.tmp'), 'half a copy');
		writeFileSync(join(dir, 'notes.txt'), 'mine');
		backup();
		const names = readdirSync(dir);
		expect(names).not.toContain('relay-2020-01-01.sqlite.tmp');
		expect(names).toContain('notes.txt');
	});

	it('keeps the newest 14 daily backups', () => {
		for (let day = 1; day <= 20; day++) {
			writeFileSync(join(dir, `relay-2020-02-${String(day).padStart(2, '0')}.sqlite`), 'x');
		}
		backup();
		const backups = readdirSync(dir).filter((f) => /^relay-.*\.sqlite$/.test(f));
		expect(backups).toHaveLength(14);
		expect(backups).not.toContain('relay-2020-02-01.sqlite');
	});
});

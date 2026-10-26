/**
 * Daily housekeeping: a consistent copy of the database, and removing data
 * we promised not to keep (see the privacy page).
 */
import { mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { config } from './config.ts';
import { db } from './db.ts';

const DAY = 86_400_000;
const KEEP_BACKUPS = 14;

const backupDir = () => config.backupDir || join(config.dataDir, 'backups');

export function backup(): string {
	const dir = backupDir();
	mkdirSync(dir, { recursive: true });
	const file = join(dir, `relay-${new Date().toISOString().slice(0, 10)}.sqlite`);
	rmSync(file, { force: true });
	db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
	const old = readdirSync(dir)
		.filter((f) => /^relay-\d{4}-\d\d-\d\d\.sqlite$/.test(f))
		.sort()
		.slice(0, -KEEP_BACKUPS);
	for (const f of old) rmSync(join(dir, f), { force: true });
	return file;
}

export function lastBackup(): { at: number; size: number } | null {
	try {
		const newest = readdirSync(backupDir())
			.filter((f) => /^relay-\d{4}-\d\d-\d\d\.sqlite$/.test(f))
			.sort()
			.at(-1);
		if (!newest) return null;
		const s = statSync(join(backupDir(), newest));
		return { at: s.mtimeMs, size: s.size };
	} catch {
		return null;
	}
}

/** The live database on disk (with its write-ahead log). */
export function databaseSize(): number {
	let total = 0;
	for (const f of ['relay.sqlite', 'relay.sqlite-wal']) {
		try {
			total += statSync(join(config.dataDir, f)).size;
		} catch {
			// no WAL yet
		}
	}
	return total;
}

export function cleanUp() {
	const now = Date.now();
	db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now);
	db.prepare('DELETE FROM password_resets WHERE expires_at < ?').run(now);
	db.prepare('DELETE FROM email_confirmations WHERE expires_at < ?').run(now);
	db.prepare('DELETE FROM pairing_codes WHERE expires_at < ?').run(now - DAY);
	// Resolved reports (they contain full links) are kept 12 months, then deleted.
	db.prepare('DELETE FROM reports WHERE resolved_at IS NOT NULL AND resolved_at < ?').run(now - 365 * DAY);
	db.prepare('DELETE FROM stripe_events WHERE received_at < ?').run(now - 90 * DAY);
}

export function startMaintenance() {
	const g = globalThis as unknown as { __shrimMaintenance?: boolean };
	if (g.__shrimMaintenance) return;
	g.__shrimMaintenance = true;
	const run = () => {
		try {
			cleanUp();
			backup();
		} catch (e) {
			console.error('[maintenance]', e);
		}
	};
	setTimeout(run, 60_000).unref();
	setInterval(run, DAY).unref();
}

import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { config } from './config.ts';

const MIGRATIONS = [
	`
	CREATE TABLE accounts (
		id TEXT PRIMARY KEY,
		email TEXT NOT NULL UNIQUE,
		password_hash TEXT NOT NULL,
		active_until INTEGER,
		suspended_at INTEGER,
		created_at INTEGER NOT NULL
	);
	CREATE TABLE sessions (
		token_hash TEXT PRIMARY KEY,
		account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL
	);
	CREATE TABLE agent_tokens (
		account_id TEXT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
		token_hash TEXT NOT NULL UNIQUE,
		created_at INTEGER NOT NULL,
		seen_at INTEGER
	);
	CREATE TABLE shares (
		id TEXT PRIMARY KEY,
		account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
		allow_upload INTEGER NOT NULL,
		expires_at INTEGER,
		created_at INTEGER NOT NULL,
		disabled_at INTEGER,
		disabled_by TEXT,
		views INTEGER NOT NULL DEFAULT 0,
		bytes_out INTEGER NOT NULL DEFAULT 0,
		bytes_in INTEGER NOT NULL DEFAULT 0
	);
	CREATE INDEX shares_account ON shares(account_id);
	CREATE TABLE reports (
		id TEXT PRIMARY KEY,
		share_id TEXT NOT NULL,
		link TEXT NOT NULL,
		reason TEXT NOT NULL,
		details TEXT NOT NULL,
		contact TEXT NOT NULL,
		created_at INTEGER NOT NULL,
		resolved_at INTEGER
	);
	`,
	`
	ALTER TABLE accounts ADD COLUMN stripe_customer_id TEXT;
	ALTER TABLE accounts ADD COLUMN stripe_subscription_id TEXT;
	ALTER TABLE accounts ADD COLUMN plan_status TEXT;
	ALTER TABLE accounts ADD COLUMN plan_cancel_at_period_end INTEGER NOT NULL DEFAULT 0;
	CREATE UNIQUE INDEX accounts_stripe_customer ON accounts(stripe_customer_id);
	CREATE TABLE stripe_events (
		id TEXT PRIMARY KEY,
		received_at INTEGER NOT NULL
	);
	`,
	`
	CREATE TABLE pairing_codes (
		device_hash TEXT PRIMARY KEY,
		user_code TEXT NOT NULL UNIQUE,
		created_at INTEGER NOT NULL,
		expires_at INTEGER NOT NULL,
		account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
		approved_at INTEGER,
		token TEXT
	);
	`,
	`
	ALTER TABLE pairing_codes ADD COLUMN denied_at INTEGER;
	`,
	`
	CREATE TABLE password_resets (
		token_hash TEXT PRIMARY KEY,
		account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
		created_at INTEGER NOT NULL,
		expires_at INTEGER NOT NULL
	);
	CREATE INDEX password_resets_account ON password_resets(account_id);
	`,
	`
	ALTER TABLE accounts ADD COLUMN email_confirmed_at INTEGER;
	CREATE TABLE email_confirmations (
		token_hash TEXT PRIMARY KEY,
		account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
		expires_at INTEGER NOT NULL
	);
	CREATE INDEX email_confirmations_account ON email_confirmations(account_id);
	`,
	`
	-- Agent tokens are made when the agent collects them now; none wait here in the clear.
	UPDATE pairing_codes SET token = NULL;
	`
];

function open(): DatabaseSync {
	mkdirSync(config.dataDir, { recursive: true });
	const db = new DatabaseSync(join(config.dataDir, 'relay.sqlite'));
	db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
	return db;
}

function migrate(db: DatabaseSync) {
	const { user_version } = db.prepare('PRAGMA user_version').get() as { user_version: number };
	for (let v = user_version; v < MIGRATIONS.length; v++) {
		db.exec('BEGIN');
		db.exec(MIGRATIONS[v]);
		db.exec(`PRAGMA user_version = ${v + 1}`);
		db.exec('COMMIT');
	}
}

// One connection per process, kept across dev reloads (which may bring new migrations).
const g = globalThis as unknown as { __shrimRelayDb?: DatabaseSync };
export const db: DatabaseSync = (g.__shrimRelayDb ??= open());
migrate(db);

export interface AccountRow {
	id: string;
	email: string;
	password_hash: string;
	active_until: number | null;
	suspended_at: number | null;
	created_at: number;
	stripe_customer_id: string | null;
	stripe_subscription_id: string | null;
	/** Stripe subscription status, e.g. active, past_due, canceled. */
	plan_status: string | null;
	plan_cancel_at_period_end: number;
	/** When the owner proved the address is theirs (a confirmation link, or a password reset). */
	email_confirmed_at: number | null;
}

export interface ShareRow {
	id: string;
	account_id: string;
	allow_upload: number;
	expires_at: number | null;
	created_at: number;
	disabled_at: number | null;
	disabled_by: string | null;
	views: number;
	bytes_out: number;
	bytes_in: number;
}

export interface ReportRow {
	id: string;
	share_id: string;
	link: string;
	reason: string;
	details: string;
	contact: string;
	created_at: number;
	resolved_at: number | null;
}

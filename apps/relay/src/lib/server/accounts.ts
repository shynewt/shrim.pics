import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { AGENT_TOKEN_PREFIX, easyId } from '@shrim/protocol';
import { config } from './config.ts';
import { db, type AccountRow, type ReportRow, type ShareRow } from './db.ts';
import { DEMO_SHARE_ID } from './demo/index.ts';

const scryptAsync = promisify(scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const SCRYPT = { N: 16384, r: 8, p: 1 };
const DAY = 86_400_000;
export const SESSION_COOKIE = 'shrim_session';
export const SESSION_DAYS = 30;
export const MIN_PASSWORD = 10;
/** Reset links last an hour (the pages and emails say so). */
export const RESET_MINUTES = 60;

export const sha256 = (s: string) => createHash('sha256').update(s).digest('base64url');
export const randomToken = (bytes = 24) => randomBytes(bytes).toString('base64url');

const BASE62 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
export function randomId(length = 10): string {
	// Rejection sampling keeps the distribution uniform.
	let out = '';
	while (out.length < length) {
		for (const b of randomBytes(length * 2)) {
			if (b < 248 && out.length < length) out += BASE62[b % 62];
		}
	}
	return out;
}

export async function hashPassword(password: string): Promise<string> {
	const salt = randomBytes(16);
	const hash = await scryptAsync(password, salt, 32, SCRYPT);
	return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64url')}$${hash.toString('base64url')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
	const [kind, N, r, p, salt, hash] = stored.split('$');
	if (kind !== 'scrypt') return false;
	const expected = Buffer.from(hash, 'base64url');
	const actual = await scryptAsync(password, Buffer.from(salt, 'base64url'), expected.length, {
		N: Number(N),
		r: Number(r),
		p: Number(p)
	});
	return timingSafeEqual(actual, expected);
}

export interface Account {
	id: string;
	email: string;
	activeUntil: number | null;
	suspended: boolean;
	active: boolean;
	/** Listed in SHRIM_ADMIN_EMAILS, with the address confirmed. */
	admin: boolean;
	/** Listed, but the address isn't confirmed yet: no operator pages until it is. */
	adminPending: boolean;
	createdAt: number;
}

export function toAccount(row: AccountRow): Account {
	const suspended = row.suspended_at !== null;
	const paid = config.billing === 'off' || (row.active_until ?? 0) > Date.now();
	// Anyone can sign up with any address, so being listed isn't enough on its own.
	const listed = config.adminEmails.includes(row.email);
	const confirmed = row.email_confirmed_at !== null;
	return {
		id: row.id,
		email: row.email,
		activeUntil: row.active_until,
		suspended,
		active: paid && !suspended,
		admin: listed && confirmed,
		adminPending: listed && !confirmed,
		createdAt: row.created_at
	};
}

export const normalizeEmail = (email: string) => email.trim().toLowerCase();

/**
 * someone@example.com, at most 254 characters (the SMTP limit). Each part excludes the
 * character that ends it, so the pattern can't backtrack: matching takes linear time.
 */
const EMAIL = /^[^\s@]+@[^\s@.]+(?:\.[^\s@.]+)+$/;
export const validEmail = (email: string) => email.length <= 254 && EMAIL.test(email);

export function accountByEmail(email: string): AccountRow | undefined {
	return db.prepare('SELECT * FROM accounts WHERE email = ?').get(normalizeEmail(email)) as AccountRow | undefined;
}

export function accountById(id: string): AccountRow | undefined {
	return db.prepare('SELECT * FROM accounts WHERE id = ?').get(id) as AccountRow | undefined;
}

export function accountCount(): number {
	return (db.prepare('SELECT COUNT(*) AS n FROM accounts').get() as { n: number }).n;
}

export async function createAccount(email: string, password: string): Promise<AccountRow> {
	const row: AccountRow = {
		id: randomId(16),
		email: normalizeEmail(email),
		password_hash: await hashPassword(password),
		active_until: null,
		suspended_at: null,
		created_at: Date.now(),
		stripe_customer_id: null,
		stripe_subscription_id: null,
		plan_status: null,
		plan_cancel_at_period_end: 0,
		plan_period_start: null,
		refunded_at: null,
		checkout_session_id: null,
		email_confirmed_at: null
	};
	db.prepare(
		'INSERT INTO accounts (id, email, password_hash, active_until, suspended_at, created_at) VALUES (?, ?, ?, ?, ?, ?)'
	).run(row.id, row.email, row.password_hash, row.active_until, row.suspended_at, row.created_at);
	return row;
}

export function extendPlan(accountId: string, days = 365) {
	const row = accountById(accountId);
	if (!row) return;
	const from = Math.max(Date.now(), row.active_until ?? 0);
	db.prepare('UPDATE accounts SET active_until = ? WHERE id = ?').run(from + days * DAY, accountId);
}

export function setSuspended(accountId: string, suspended: boolean) {
	db.prepare('UPDATE accounts SET suspended_at = ? WHERE id = ?').run(suspended ? Date.now() : null, accountId);
}

export function createSession(accountId: string): string {
	const token = randomToken(32);
	db.prepare('INSERT INTO sessions (token_hash, account_id, expires_at) VALUES (?, ?, ?)').run(
		sha256(token),
		accountId,
		Date.now() + SESSION_DAYS * DAY
	);
	return token;
}

export function accountForSession(token: string | undefined): AccountRow | undefined {
	if (!token) return undefined;
	return db
		.prepare(
			'SELECT a.* FROM sessions s JOIN accounts a ON a.id = s.account_id WHERE s.token_hash = ? AND s.expires_at > ?'
		)
		.get(sha256(token), Date.now()) as AccountRow | undefined;
}

export function deleteSession(token: string) {
	db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

// A random token in an emailed link, stored hashed, single-use, short-lived.
// Asking again replaces the old link.

export function createPasswordReset(accountId: string): string {
	const token = randomToken(32);
	const now = Date.now();
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM password_resets WHERE account_id = ?').run(accountId);
		db.prepare('INSERT INTO password_resets (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
			sha256(token),
			accountId,
			now,
			now + RESET_MINUTES * 60_000
		);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return token;
}

/** The account a reset link belongs to, while it's still good. */
export function accountForPasswordReset(token: string | null | undefined): AccountRow | undefined {
	if (!token) return undefined;
	return db
		.prepare(
			'SELECT a.* FROM password_resets r JOIN accounts a ON a.id = r.account_id WHERE r.token_hash = ? AND r.expires_at > ?'
		)
		.get(sha256(token), Date.now()) as AccountRow | undefined;
}

/**
 * Sets a new password with a reset link. The link is used up, any other
 * links die, and every session is signed out. Null if the link isn't good.
 */
export async function resetPassword(token: string, password: string): Promise<AccountRow | null> {
	if (!accountForPasswordReset(token)) return null;
	const hash = await hashPassword(password);
	// Checked again after the await: two tabs racing with the same link get one winner.
	const account = accountForPasswordReset(token);
	if (!account) return null;
	db.exec('BEGIN');
	try {
		// The link came to the address, so it's confirmed too.
		db.prepare(
			'UPDATE accounts SET password_hash = ?, email_confirmed_at = COALESCE(email_confirmed_at, ?) WHERE id = ?'
		).run(hash, Date.now(), account.id);
		db.prepare('DELETE FROM password_resets WHERE account_id = ?').run(account.id);
		db.prepare('DELETE FROM sessions WHERE account_id = ?').run(account.id);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return account;
}

// A link only that mailbox gets, opened while signed in to the account: someone who
// signed up with another person's address can't confirm it, and its owner can't confirm
// an account they don't control (they reset its password instead, which also confirms).

export const CONFIRM_HOURS = 24;

/** A new confirmation link for the account. Asking again replaces the old one. */
export function createEmailConfirmation(accountId: string): string {
	const token = randomToken(32);
	db.exec('BEGIN');
	try {
		db.prepare('DELETE FROM email_confirmations WHERE account_id = ?').run(accountId);
		db.prepare('INSERT INTO email_confirmations (token_hash, account_id, expires_at) VALUES (?, ?, ?)').run(
			sha256(token),
			accountId,
			Date.now() + CONFIRM_HOURS * 3_600_000
		);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return token;
}

export function confirmEmail(token: string, accountId: string): boolean {
	const row = db
		.prepare('SELECT account_id FROM email_confirmations WHERE token_hash = ? AND expires_at > ?')
		.get(sha256(token), Date.now()) as { account_id: string } | undefined;
	if (row?.account_id !== accountId) return false;
	db.exec('BEGIN');
	try {
		db.prepare('UPDATE accounts SET email_confirmed_at = ? WHERE id = ?').run(Date.now(), accountId);
		db.prepare('DELETE FROM email_confirmations WHERE account_id = ?').run(accountId);
		db.exec('COMMIT');
	} catch (e) {
		db.exec('ROLLBACK');
		throw e;
	}
	return true;
}

/** Makes a new agent token, replacing any old one. The token is only ever shown once. */
export function rotateAgentToken(accountId: string): string {
	const token = AGENT_TOKEN_PREFIX + randomToken(24);
	db.prepare(
		`INSERT INTO agent_tokens (account_id, token_hash, created_at) VALUES (?, ?, ?)
		 ON CONFLICT(account_id) DO UPDATE SET token_hash = excluded.token_hash, created_at = excluded.created_at`
	).run(accountId, sha256(token), Date.now());
	// A leftover setup token could otherwise replace this agent later.
	db.prepare('DELETE FROM setup_tokens WHERE account_id = ?').run(accountId);
	return token;
}

export function agentTokenInfo(accountId: string): { createdAt: number; seenAt: number | null } | null {
	const row = db.prepare('SELECT created_at, seen_at FROM agent_tokens WHERE account_id = ?').get(accountId) as
		{ created_at: number; seen_at: number | null } | undefined;
	return row ? { createdAt: row.created_at, seenAt: row.seen_at } : null;
}

/** A code was approved just now, and the agent is about to pick up its token. */
export function pairingJustApproved(accountId: string, withinMs = 10 * 60_000): boolean {
	return !!db
		.prepare('SELECT 1 FROM pairing_codes WHERE account_id = ? AND approved_at > ? LIMIT 1')
		.get(accountId, Date.now() - withinMs);
}

export function markAgentSeen(accountId: string) {
	db.prepare('UPDATE agent_tokens SET seen_at = ? WHERE account_id = ?').run(Date.now(), accountId);
}

export function accountForAgentToken(header: string | null): AccountRow | undefined {
	const token = header?.match(/^Bearer (.+)$/)?.[1];
	if (!token?.startsWith(AGENT_TOKEN_PREFIX)) return undefined;
	return db
		.prepare('SELECT a.* FROM agent_tokens t JOIN accounts a ON a.id = t.account_id WHERE t.token_hash = ?')
		.get(sha256(token)) as AccountRow | undefined;
}

export function createShare(accountId: string, allowUpload: boolean, expiresAt: number | null): string {
	// Easy IDs (emoji pairs) must not repeat among the account's live links:
	// the id is random anyway, so just draw another.
	const taken = new Set(
		sharesForAccount(accountId)
			.filter((s) => shareState(s) === 'live')
			.map((s) => easyId(s.id))
	);
	for (let attempt = 0; ; attempt++) {
		const id = randomId(10);
		if (id === DEMO_SHARE_ID || (taken.has(easyId(id)) && attempt < 200)) continue;
		try {
			db.prepare(
				'INSERT INTO shares (id, account_id, allow_upload, expires_at, created_at) VALUES (?, ?, ?, ?, ?)'
			).run(id, accountId, allowUpload ? 1 : 0, expiresAt, Date.now());
			return id;
		} catch (e) {
			if (!String(e).includes('UNIQUE')) throw e;
		}
	}
}

export function shareById(id: string): ShareRow | undefined {
	return db.prepare('SELECT * FROM shares WHERE id = ?').get(id) as ShareRow | undefined;
}

export function sharesForAccount(accountId: string): ShareRow[] {
	return db
		.prepare('SELECT * FROM shares WHERE account_id = ? ORDER BY created_at DESC')
		.all(accountId) as unknown as ShareRow[];
}

export function disableShare(id: string, by: 'owner' | 'operator') {
	db.prepare('UPDATE shares SET disabled_at = ?, disabled_by = ? WHERE id = ? AND disabled_at IS NULL').run(
		Date.now(),
		by,
		id
	);
}

export function enableShare(id: string) {
	db.prepare('UPDATE shares SET disabled_at = NULL, disabled_by = NULL WHERE id = ?').run(id);
}

export type ShareState = 'live' | 'disabled' | 'expired';

export function shareState(s: ShareRow): ShareState {
	if (s.disabled_at !== null) return 'disabled';
	if (s.expires_at !== null && s.expires_at <= Date.now()) return 'expired';
	return 'live';
}

export function countView(id: string) {
	db.prepare('UPDATE shares SET views = views + 1 WHERE id = ?').run(id);
}

export function recordTraffic(id: string, out: number, inn: number) {
	db.prepare('UPDATE shares SET bytes_out = bytes_out + ?, bytes_in = bytes_in + ? WHERE id = ?').run(out, inn, id);
}

export function createReport(r: { shareId: string; link: string; reason: string; details: string; contact: string }) {
	db.prepare(
		'INSERT INTO reports (id, share_id, link, reason, details, contact, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
	).run(randomId(12), r.shareId, r.link, r.reason, r.details, r.contact, Date.now());
}

export function openReports(): (ReportRow & {
	account_id: string | null;
	email: string | null;
	share_disabled: number | null;
	suspended_at: number | null;
})[] {
	return db
		.prepare(
			`SELECT r.*, s.account_id, a.email, s.disabled_at AS share_disabled, a.suspended_at
			 FROM reports r LEFT JOIN shares s ON s.id = r.share_id LEFT JOIN accounts a ON a.id = s.account_id
			 WHERE r.resolved_at IS NULL ORDER BY r.created_at DESC`
		)
		.all() as never;
}

export function openReportCount(accountId: string): number {
	return (
		db
			.prepare(
				'SELECT COUNT(*) AS n FROM reports r JOIN shares s ON s.id = r.share_id WHERE s.account_id = ? AND r.resolved_at IS NULL'
			)
			.get(accountId) as { n: number }
	).n;
}

export function resolveReport(id: string) {
	db.prepare('UPDATE reports SET resolved_at = ? WHERE id = ?').run(Date.now(), id);
}

// Only what the relay already keeps (see the privacy page): no new tracking.

const WEEK = 7 * DAY;
const WEEKS = 12;

/** Counts per week for the last 12 weeks, oldest first, from a column of timestamps. */
function weekly(table: 'accounts' | 'shares', now: number): { start: number; count: number }[] {
	const from = now - WEEKS * WEEK;
	const rows = db.prepare(`SELECT created_at AS t FROM ${table} WHERE created_at >= ?`).all(from) as { t: number }[];
	const weeks = Array.from({ length: WEEKS }, (_, i) => ({ start: from + i * WEEK, count: 0 }));
	for (const { t } of rows) weeks[Math.min(WEEKS - 1, Math.floor((t - from) / WEEK))].count++;
	return weeks;
}

export function operatorOverview(now = Date.now()) {
	const one = (sql: string, ...args: (number | string)[]) =>
		(db.prepare(sql).get(...args) as { n: number | null }).n ?? 0;
	const month = now - 30 * DAY;
	const billing = config.billing !== 'off';
	return {
		accounts: {
			total: one('SELECT COUNT(*) AS n FROM accounts'),
			new30: one('SELECT COUNT(*) AS n FROM accounts WHERE created_at >= ?', month),
			suspended: one('SELECT COUNT(*) AS n FROM accounts WHERE suspended_at IS NOT NULL'),
			weekly: weekly('accounts', now)
		},
		plans: billing
			? {
					paying: one('SELECT COUNT(*) AS n FROM accounts WHERE active_until > ? AND suspended_at IS NULL', now),
					ending: one(
						'SELECT COUNT(*) AS n FROM accounts WHERE active_until > ? AND suspended_at IS NULL AND plan_cancel_at_period_end = 1',
						now
					),
					pastDue: one(
						"SELECT COUNT(*) AS n FROM accounts WHERE active_until > ? AND suspended_at IS NULL AND plan_status = 'past_due'",
						now
					),
					lapsed: one('SELECT COUNT(*) AS n FROM accounts WHERE active_until <= ?', now),
					never: one('SELECT COUNT(*) AS n FROM accounts WHERE active_until IS NULL')
				}
			: null,
		agents: {
			paired: one('SELECT COUNT(*) AS n FROM agent_tokens'),
			seenWeek: one('SELECT COUNT(*) AS n FROM agent_tokens WHERE seen_at >= ?', now - WEEK),
			pairingWaiting: one(
				'SELECT COUNT(*) AS n FROM pairing_codes WHERE approved_at IS NULL AND denied_at IS NULL AND expires_at > ?',
				now
			)
		},
		links: {
			live: one(
				'SELECT COUNT(*) AS n FROM shares WHERE disabled_at IS NULL AND (expires_at IS NULL OR expires_at > ?)',
				now
			),
			withUploads: one(
				'SELECT COUNT(*) AS n FROM shares WHERE disabled_at IS NULL AND (expires_at IS NULL OR expires_at > ?) AND allow_upload = 1',
				now
			),
			new30: one('SELECT COUNT(*) AS n FROM shares WHERE created_at >= ?', month),
			expired: one('SELECT COUNT(*) AS n FROM shares WHERE disabled_at IS NULL AND expires_at <= ?', now),
			byOwner: one("SELECT COUNT(*) AS n FROM shares WHERE disabled_by = 'owner'"),
			byOperator: one("SELECT COUNT(*) AS n FROM shares WHERE disabled_by = 'operator'"),
			weekly: weekly('shares', now)
		},
		traffic: {
			views: one('SELECT SUM(views) AS n FROM shares'),
			bytesOut: one('SELECT SUM(bytes_out) AS n FROM shares'),
			bytesIn: one('SELECT SUM(bytes_in) AS n FROM shares')
		},
		busiest: (
			db
				.prepare(
					`SELECT s.id, a.id AS account_id, a.email, s.views, s.bytes_out, s.bytes_in, s.disabled_at, s.expires_at
					 FROM shares s JOIN accounts a ON a.id = s.account_id
					 WHERE s.bytes_out + s.bytes_in > 0
					 ORDER BY s.bytes_out + s.bytes_in DESC LIMIT 5`
				)
				.all() as {
				id: string;
				account_id: string;
				email: string;
				views: number;
				bytes_out: number;
				bytes_in: number;
				disabled_at: number | null;
				expires_at: number | null;
			}[]
		).map((r) => ({
			id: r.id,
			accountId: r.account_id,
			owner: r.email,
			views: r.views,
			bytesOut: r.bytes_out,
			bytesIn: r.bytes_in,
			live: r.disabled_at === null && (r.expires_at === null || r.expires_at > now)
		})),
		openReports: one('SELECT COUNT(*) AS n FROM reports WHERE resolved_at IS NULL')
	};
}

export interface AccountSummary {
	id: string;
	email: string;
	createdAt: number;
	suspended: boolean;
	agentPairedAt: number | null;
	agentSeenAt: number | null;
	liveLinks: number;
}

export const ACCOUNT_SEARCH_LIMIT = 50;

/**
 * Accounts whose email contains `query` (or whose account or link ID is
 * exactly `query`), newest first. Empty query: the newest accounts.
 * One more than the limit is returned so callers can tell there are more.
 */
export function searchAccounts(query: string, now = Date.now()): AccountSummary[] {
	const q = query.trim().toLowerCase();
	const like = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
	const rows = db
		.prepare(
			`SELECT a.id, a.email, a.created_at, a.suspended_at, t.created_at AS agent_created, t.seen_at AS agent_seen,
				(SELECT COUNT(*) FROM shares s WHERE s.account_id = a.id AND s.disabled_at IS NULL
					AND (s.expires_at IS NULL OR s.expires_at > ?)) AS live_links
			 FROM accounts a LEFT JOIN agent_tokens t ON t.account_id = a.id
			 WHERE ? = '' OR a.email LIKE ? ESCAPE '\\' OR a.id = ? OR a.id = (SELECT account_id FROM shares WHERE id = ?)
			 ORDER BY a.created_at DESC LIMIT ?`
		)
		.all(now, q, like, query.trim(), query.trim(), ACCOUNT_SEARCH_LIMIT + 1) as {
		id: string;
		email: string;
		created_at: number;
		suspended_at: number | null;
		agent_created: number | null;
		agent_seen: number | null;
		live_links: number;
	}[];
	return rows.map((r) => ({
		id: r.id,
		email: r.email,
		createdAt: r.created_at,
		suspended: r.suspended_at !== null,
		agentPairedAt: r.agent_created,
		agentSeenAt: r.agent_seen,
		liveLinks: r.live_links
	}));
}

// The agent asks for a code, the owner approves it while signed in, the agent
// collects its token. Like signing in to a TV.

/** No 0/O, 1/I/L and no vowels, so codes never spell words. 20^8 ≈ 2.6 × 10^10 codes. */
const CODE_ALPHABET = '23456789CFGHJMPQRVWX';
const PAIR_MINUTES = 10;

export function formatPairCode(raw: string): string {
	const clean = raw.toUpperCase().replace(/[^0-9A-Z]/g, '');
	if (clean.length !== 8 || [...clean].some((c) => !CODE_ALPHABET.includes(c))) return '';
	return `${clean.slice(0, 4)}-${clean.slice(4)}`;
}

function randomCode(): string {
	let raw = '';
	while (raw.length < 8) {
		for (const b of randomBytes(16)) {
			// 240 is the largest multiple of 20 below 256: no bias.
			if (b < 240 && raw.length < 8) raw += CODE_ALPHABET[b % 20];
		}
	}
	return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

// The agent's address, only to tell the owner whether the request came from
// their own network. Memory only, gone when the code expires.
const g = globalThis as unknown as { __shrimPairIps?: Map<string, { ip: string; until: number }> };
const pairIps = (g.__shrimPairIps ??= new Map<string, { ip: string; until: number }>());

export function startPairing(agentIp?: string): { deviceCode: string; userCode: string; expiresAt: number } {
	const deviceCode = randomToken(32);
	const expiresAt = Date.now() + PAIR_MINUTES * 60_000;
	for (const [code, v] of pairIps) if (v.until < Date.now()) pairIps.delete(code);
	for (;;) {
		const userCode = randomCode();
		try {
			db.prepare('INSERT INTO pairing_codes (device_hash, user_code, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
				sha256(deviceCode),
				userCode,
				Date.now(),
				expiresAt
			);
			if (agentIp) pairIps.set(userCode, { ip: agentIp, until: expiresAt });
			return { deviceCode, userCode, expiresAt };
		} catch (e) {
			if (!String(e).includes('UNIQUE')) throw e;
		}
	}
}

interface PairingRow {
	device_hash: string;
	user_code: string;
	created_at: number;
	expires_at: number;
	account_id: string | null;
	approved_at: number | null;
	denied_at: number | null;
}

export type PairingCheck = 'pending' | 'not_found' | 'expired' | 'used' | 'denied';

function findPairing(userCode: string): { row: PairingRow | undefined; state: PairingCheck } {
	const code = formatPairCode(userCode);
	const row = code
		? (db.prepare('SELECT * FROM pairing_codes WHERE user_code = ?').get(code) as PairingRow | undefined)
		: undefined;
	if (!row) return { row, state: 'not_found' };
	if (row.denied_at) return { row, state: 'denied' };
	if (row.approved_at) return { row, state: 'used' };
	if (row.expires_at < Date.now()) return { row, state: 'expired' };
	return { row, state: 'pending' };
}

export function describePairing(userCode: string, viewerIp: string) {
	const { row, state } = findPairing(userCode);
	if (!row || state !== 'pending') return { state };
	const agentIp = pairIps.get(row.user_code)?.ip;
	return {
		state,
		createdAt: row.created_at,
		sameNetwork: agentIp === undefined ? null : agentIp === viewerIp
	};
}

export function approvePairing(userCode: string, accountId: string): PairingCheck | 'approved' {
	const { row, state } = findPairing(userCode);
	if (!row || state !== 'pending') return state;
	// No token yet: it's made when the agent collects it, so it's never stored in the clear.
	db.prepare('UPDATE pairing_codes SET account_id = ?, approved_at = ? WHERE device_hash = ?').run(
		accountId,
		Date.now(),
		row.device_hash
	);
	pairIps.delete(row.user_code);
	return 'approved';
}

export function denyPairing(userCode: string): PairingCheck | 'denied_now' {
	const { row, state } = findPairing(userCode);
	if (!row || state !== 'pending') return state;
	db.prepare('UPDATE pairing_codes SET denied_at = ? WHERE device_hash = ?').run(Date.now(), row.device_hash);
	pairIps.delete(row.user_code);
	return 'denied_now';
}

export type PollResult =
	{ status: 'pending' } | { status: 'expired' } | { status: 'denied' } | { status: 'approved'; token: string };

export function pollPairing(deviceCode: string): PollResult {
	const row = db.prepare('SELECT * FROM pairing_codes WHERE device_hash = ?').get(sha256(deviceCode)) as
		PairingRow | undefined;
	if (!row) return { status: 'expired' };
	if (row.denied_at) {
		db.prepare('DELETE FROM pairing_codes WHERE device_hash = ?').run(row.device_hash);
		return { status: 'denied' };
	}
	if (row.approved_at && row.account_id) {
		db.prepare('DELETE FROM pairing_codes WHERE device_hash = ?').run(row.device_hash);
		// Made only now: the old agent, if any, keeps working until the new one has its token.
		return { status: 'approved', token: rotateAgentToken(row.account_id) };
	}
	if (row.expires_at < Date.now()) return { status: 'expired' };
	return { status: 'pending' };
}

// The dashboard puts a setup token in the compose snippet; the agent trades it for its own
// token on first start. Single use and short-lived, since compose files get shared.
const SETUP_TOKEN_PREFIX = 'shr_setup_';
const SETUP_HOURS = 24;
// Every visit to the setup page makes one; a few stay valid so an earlier copy still works.
const SETUP_KEEP = 5;

export function createSetupToken(accountId: string): { token: string; expiresAt: number } {
	const token = SETUP_TOKEN_PREFIX + randomToken(24);
	const now = Date.now();
	const expiresAt = now + SETUP_HOURS * 3_600_000;
	db.prepare('INSERT INTO setup_tokens (token_hash, account_id, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
		sha256(token),
		accountId,
		now,
		expiresAt
	);
	db.prepare(
		`DELETE FROM setup_tokens WHERE account_id = ? AND token_hash NOT IN
		 (SELECT token_hash FROM setup_tokens WHERE account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ?)`
	).run(accountId, accountId, SETUP_KEEP);
	return { token, expiresAt };
}

/** The agent's own token, or null if the setup token is unknown, used or expired. */
export function redeemSetupToken(token: string): string | null {
	if (!token.startsWith(SETUP_TOKEN_PREFIX)) return null;
	const row = db
		.prepare('DELETE FROM setup_tokens WHERE token_hash = ? AND expires_at > ? RETURNING account_id')
		.get(sha256(token), Date.now()) as { account_id: string } | undefined;
	return row ? rotateAgentToken(row.account_id) : null;
}

/** Forget the agent: its token stops working and it drops off. */
export function removeAgentToken(accountId: string) {
	db.prepare('DELETE FROM agent_tokens WHERE account_id = ?').run(accountId);
	db.prepare('DELETE FROM setup_tokens WHERE account_id = ?').run(accountId);
}

/** Everything we hold about an account, for "Download my data". */
export function exportAccount(accountId: string) {
	const a = accountById(accountId);
	if (!a) return null;
	return {
		exportedAt: new Date().toISOString(),
		account: {
			email: a.email,
			createdAt: new Date(a.created_at).toISOString(),
			planActiveUntil: a.active_until ? new Date(a.active_until).toISOString() : null,
			planStatus: a.plan_status,
			refundedAt: a.refunded_at ? new Date(a.refunded_at).toISOString() : null,
			stripeCustomerId: a.stripe_customer_id
		},
		agent: agentTokenInfo(accountId),
		shareLinks: sharesForAccount(accountId).map((s) => ({
			id: s.id,
			createdAt: new Date(s.created_at).toISOString(),
			expiresAt: s.expires_at ? new Date(s.expires_at).toISOString() : null,
			disabledAt: s.disabled_at ? new Date(s.disabled_at).toISOString() : null,
			allowsUploads: !!s.allow_upload,
			views: s.views,
			bytesSent: s.bytes_out,
			bytesReceived: s.bytes_in
		}))
	};
}

/** Deletes the account and everything tied to it. Reports about its links stay (they're about someone else's safety). */
export function deleteAccount(accountId: string) {
	db.prepare('DELETE FROM accounts WHERE id = ?').run(accountId);
}

/** The agent changed a live link: new expiry, or uploads turned on or off in Immich. */
export function updateShare(
	id: string,
	accountId: string,
	patch: { expiresAt?: number | null; allowUpload?: boolean }
) {
	const share = shareById(id);
	if (!share || share.account_id !== accountId || share.disabled_at !== null) return false;
	if (patch.expiresAt !== undefined)
		db.prepare('UPDATE shares SET expires_at = ? WHERE id = ?').run(patch.expiresAt, id);
	if (patch.allowUpload !== undefined) {
		db.prepare('UPDATE shares SET allow_upload = ? WHERE id = ?').run(patch.allowUpload ? 1 : 0, id);
	}
	return true;
}

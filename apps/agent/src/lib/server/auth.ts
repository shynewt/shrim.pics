/**
 * SHRIM_AUTH=immich (default): nobody types an Immich password here; the only Immich
 * credential kept is each person's narrow API key, in a state file readable by the agent
 * alone. The browser only gets a random token in an httpOnly cookie; the file keeps its
 * hash. Keys are never sent to the relay and never logged.
 *
 * SHRIM_AUTH=none: no sign-in; anyone who can reach the page is the one user.
 */
import { createHash, randomBytes } from 'node:crypto';
import type { Cookies } from '@sveltejs/kit';
import { config } from './config.ts';
import { ImmichSignedOut, apiKeyExists, deleteApiKey, whoAmI, type ImmichUser } from './immich.ts';
import { save, state, type ApiKeyCredential, type Credential, type KeyInfo, type StoredPerson } from './state.ts';

export const AUTH_COOKIE = 'shrim_agent_session';
/** Signed in for a year from the last visit. */
const SESSION_DAYS = 365;
const RECHECK_MS = 5 * 60_000;

export interface AgentUser {
	/** Immich user id. Empty with SHRIM_AUTH=none. */
	id: string;
	name: string;
	email: string;
	isAdmin: boolean;
	/** Null with SHRIM_AUTH=none and no key. */
	credential: ApiKeyCredential | null;
	via: 'sso' | 'apiKey' | 'none';
	keyName: string | null;
	/** A key they used before that is still in Immich: they may want to delete it. */
	olderKey: string | null;
}

export const authEnabled = () => config.auth === 'immich';

const hash = (token: string) => createHash('sha256').update(token).digest('base64url');
const days = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString();
const personOf = (userId: string) => state.people.find((p) => p.userId === userId);

function toUser(p: StoredPerson): AgentUser {
	return {
		id: p.userId,
		name: p.name,
		email: p.email,
		isAdmin: p.isAdmin,
		credential: p.credential,
		via: p.via,
		keyName: p.keyInfo?.name ?? null,
		olderKey: p.olderKey ?? null
	};
}

/** SHRIM_AUTH=none: whoever is here, with the agent's own key if it has one. */
export function localUser(): AgentUser {
	return {
		id: '',
		name: '',
		email: '',
		isAdmin: true,
		credential: state.immichApiKey
			? {
					kind: 'apiKey',
					key: state.immichApiKey,
					fullAccess: false,
					canUpdate: !!state.immichKeyCanUpdate,
					canDelete: !!state.immichKeyCanDelete
				}
			: null,
		via: 'none',
		keyName: null,
		olderKey: null
	};
}

/** Everyone the agent may act for in the background: people with a key here, or the one local user. */
export function keyHolders(): AgentUser[] {
	if (!authEnabled()) {
		const local = localUser();
		return local.credential ? [local] : [];
	}
	return state.people.filter((p) => p.credential).map(toUser);
}

function setCookie(cookies: Cookies, token: string, secure: boolean) {
	cookies.set(AUTH_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure,
		maxAge: SESSION_DAYS * 86_400
	});
}

/** Forgets someone's key here (Immich refused it, or they signed out everywhere), and signs them out. */
function forgetKey(p: StoredPerson) {
	p.credential = null;
	state.sessions = state.sessions.filter((s) => s.userId !== p.userId);
	save();
}

/**
 * Remembers the key the agent now uses for someone, and tidies up the one they used before:
 * a key the agent made itself is deleted when `immichSession` (a fresh SSO sign-in) allows it;
 * otherwise they're told its name, to delete it in Immich if they like.
 */
export async function rememberPerson(
	user: ImmichUser,
	via: 'sso' | 'apiKey',
	credential: ApiKeyCredential,
	keyInfo: KeyInfo,
	immichSession?: Credential
) {
	const known = personOf(user.id);
	const old = known?.keyInfo;
	let olderKey = known?.olderKey;
	if (old && old.id !== keyInfo.id) {
		olderKey = old.name;
		if (immichSession) {
			try {
				// Ours: delete it. Theirs: only mention it if it's still there.
				if (old.madeByAgent) await deleteApiKey(immichSession, old.id);
				if (old.madeByAgent || !(await apiKeyExists(immichSession, old.id))) olderKey = known?.olderKey;
			} catch {
				// Couldn't tell: they'll see its name.
			}
		}
	}
	const person: StoredPerson = {
		userId: user.id,
		name: user.name,
		email: user.email,
		isAdmin: user.isAdmin,
		via,
		credential,
		keyInfo,
		olderKey,
		checkedAt: Date.now()
	};
	state.people = [...state.people.filter((p) => p.userId !== user.id), person];
	// automatic links start from their first sign-in: older Immich links are left alone
	state.autoLinks.since[user.id] ??= new Date().toISOString();
	if (user.isAdmin) claimUnowned(user);
	save();
}

/**
 * Links made before sign-in existed (an older agent, or SHRIM_AUTH=none) have no owner.
 * The first Immich admin who signs in takes them on, as the person who set the agent up.
 */
function claimUnowned(user: ImmichUser) {
	const unowned = state.shares.filter((s) => !s.ownerId);
	if (!unowned.length) return;
	for (const s of unowned) Object.assign(s, { ownerId: user.id, ownerName: user.name });
	// They went through the first-run steps back then.
	if (state.setupSeen && !state.setupSeenBy.includes(user.id)) state.setupSeenBy.push(user.id);
}

export function dismissOlderKey(userId: string) {
	const p = personOf(userId);
	if (p?.olderKey) {
		p.olderKey = undefined;
		save();
	}
}

export function startSession(cookies: Cookies, secure: boolean, userId: string) {
	const token = randomBytes(32).toString('base64url');
	const now = Date.now();
	state.sessions = state.sessions.filter((s) => Date.parse(s.expiresAt) > now);
	state.sessions.push({
		id: hash(token),
		userId,
		createdAt: new Date(now).toISOString(),
		expiresAt: days(SESSION_DAYS)
	});
	save();
	setCookie(cookies, token, secure);
}

const checking = new Map<string, Promise<boolean>>();

/** Asks Immich whether the key still works, and refreshes name and admin role. */
function recheck(p: StoredPerson): Promise<boolean> {
	const running = checking.get(p.userId);
	if (running) return running;
	const job = (async () => {
		if (!p.credential) return false;
		try {
			const u = await whoAmI(p.credential, 4000);
			if (u.id !== p.userId) {
				forgetKey(p);
				return false;
			}
			Object.assign(p, { name: u.name, email: u.email, isAdmin: u.isAdmin });
			return true;
		} catch (e) {
			if (e instanceof ImmichSignedOut) {
				forgetKey(p);
				return false;
			}
			// Immich is down or busy: that's no reason to sign anyone out.
			return true;
		} finally {
			p.checkedAt = Date.now();
			save();
			checking.delete(p.userId);
		}
	})();
	checking.set(p.userId, job);
	return job;
}

export type Resolved = { user: AgentUser } | { user: null; expired: boolean };

/** The person behind this browser's cookie. `expired`: they were signed in, but not any more. */
export async function resolveSession(cookies: Cookies, secure: boolean): Promise<Resolved> {
	const token = cookies.get(AUTH_COOKIE);
	if (!token) return { user: null, expired: false };
	const id = hash(token);
	const s = state.sessions.find((x) => x.id === id);
	const p = s && personOf(s.userId);
	if (!s || !p?.credential || Date.parse(s.expiresAt) <= Date.now()) {
		if (s) {
			state.sessions = state.sessions.filter((x) => x !== s);
			save();
		}
		cookies.delete(AUTH_COOKIE, { path: '/' });
		return { user: null, expired: !!s };
	}
	if (Date.now() - p.checkedAt > RECHECK_MS && !(await recheck(p))) {
		cookies.delete(AUTH_COOKIE, { path: '/' });
		return { user: null, expired: true };
	}
	// Still in use: keep it another year (at most once a day, to spare the disk).
	if (Date.parse(s.expiresAt) < Date.now() + (SESSION_DAYS - 1) * 86_400_000) {
		s.expiresAt = days(SESSION_DAYS);
		save();
		setCookie(cookies, token, secure);
	}
	return { user: toUser(p) };
}

/**
 * Signs this browser out. Once nobody is signed in as them any more, the agent forgets
 * their key too; it stays in Immich (a key can't delete itself) under the name returned.
 */
export function endSession(cookies: Cookies): { forgotKey: string | null } {
	const token = cookies.get(AUTH_COOKIE);
	cookies.delete(AUTH_COOKIE, { path: '/' });
	const s = token ? state.sessions.find((x) => x.id === hash(token)) : undefined;
	if (!s) return { forgotKey: null };
	state.sessions = state.sessions.filter((x) => x !== s);
	const p = personOf(s.userId);
	if (p?.credential && !state.sessions.some((x) => x.userId === s.userId)) {
		forgetKey(p);
		return { forgotKey: p.keyInfo?.name ?? null };
	}
	save();
	return { forgotKey: null };
}

/** Immich refused this key mid-request: forget it and sign its person out. */
export function forgetCredential(cred: Credential) {
	if (cred.kind !== 'apiKey') return;
	const p = state.people.find((x) => x.credential?.key === cred.key);
	if (p) forgetKey(p);
}

/** Someone's key, to tidy up their Immich link when an admin revokes it. */
export function credentialOf(userId: string | undefined): ApiKeyCredential | null {
	return (userId && personOf(userId)?.credential) || null;
}

export function can(cred: ApiKeyCredential | null, what: 'update' | 'delete'): boolean {
	if (!cred) return false;
	return what === 'update' ? cred.canUpdate : cred.canDelete;
}

// Keys are long and random, but there's no reason to let anyone try thousands.

const WINDOW_MS = 15 * 60_000;
const LIMIT = 20;
const failures = new Map<string, number[]>();

function recent(ip: string): number[] {
	const now = Date.now();
	const list = (failures.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
	if (list.length) failures.set(ip, list);
	else failures.delete(ip);
	return list;
}

export const tooManyAttempts = (ip: string) => recent(ip).length >= LIMIT;

export function noteFailure(ip: string) {
	failures.set(ip, [...recent(ip), Date.now()]);
	// Keep the map small.
	if (failures.size > 5000) for (const k of failures.keys()) recent(k);
}

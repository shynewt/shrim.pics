import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { ImmichLinkRef } from '@shrim/protocol';
import { config } from './config.ts';

export interface StoredShare {
	/** Relay share id */
	id: string;
	/** Share key, base64url. Never leaves this machine except inside the link. */
	key: string;
	immich: ImmichLinkRef;
	label: string;
	albumName: string;
	linkType: 'ALBUM' | 'INDIVIDUAL';
	allowUpload: boolean;
	createdAt: string;
	expiresAt: string | null;
	/** Set when the agent made the Immich link itself, so revoking can remove it too. */
	immichLinkId?: string;
	allowDownload?: boolean;
	showMetadata?: boolean;
	/** Who made it (their Immich user). Missing with SHRIM_AUTH=none. */
	ownerId?: string;
	ownerName?: string;
	/** Made by itself for a link someone created in Immich (SHRIM_AUTO_LINKS). */
	auto?: AutoLink;
}

export interface AutoLink {
	/** The Immich link it follows: deleting or changing that one deletes or changes this one. */
	immichLinkId: string;
	/** The description before ours went in front, to put back if the link is revoked here. */
	description: string | null;
	/** Immich's expiry when we last looked: only a change there is copied over. */
	expiresAt: string | null;
}

/** A narrow Immich API key: the only Immich credential the agent ever keeps. */
export interface ApiKeyCredential {
	kind: 'apiKey';
	key: string;
	fullAccess: boolean;
	canUpdate: boolean;
	canDelete: boolean;
}

/**
 * Never sent to the relay, never logged. A `session` only lives during an SSO sign-in,
 * to make that person's API key; it's never stored.
 */
export type Credential = ApiKeyCredential | { kind: 'session'; token: string };

/** Kept after the secret is forgotten, to tidy up later. */
export interface KeyInfo {
	id: string;
	name: string;
	/** The agent made it (at an SSO sign-in), so it may delete it again. */
	madeByAgent: boolean;
}

export interface StoredPerson {
	userId: string;
	name: string;
	email: string;
	isAdmin: boolean;
	via: 'sso' | 'apiKey';
	/** Null once they signed out everywhere, or Immich stopped accepting the key. */
	credential: ApiKeyCredential | null;
	keyInfo: KeyInfo | null;
	/** A key they used before that is still in Immich and that the agent couldn't delete. */
	olderKey?: string;
	/** When Immich last confirmed the key still works (ms). */
	checkedAt: number;
}

/** The cookie holds a random token; only its hash is kept here. */
export interface StoredSession {
	/** sha256 of the cookie token, base64url */
	id: string;
	userId: string;
	createdAt: string;
	expiresAt: string;
}

export interface AgentState {
	relayUrl: string;
	agentToken: string;
	/** sha256 of the setup token the relay already answered, so a restart doesn't send it again. */
	setupTokenUsed?: string;
	/** SHRIM_AUTH=none only: an Immich API key with a few permissions, for the album picker. */
	immichApiKey: string;
	immichApiKeySavedAt?: string;
	immichKeyCanDelete?: boolean;
	immichKeyCanUpdate?: boolean;
	/** Immich's public address, learned from pasted links (only to link to its settings). */
	immichPublicUrl?: string;
	/** SHRIM_AUTH=none: the first-run steps were finished once. */
	setupSeen?: boolean;
	setupSeenBy: string[];
	people: StoredPerson[];
	sessions: StoredSession[];
	shares: StoredShare[];
	autoLinks: {
		/** Per person (user id, or '' with SHRIM_AUTH=none): only Immich links made after this get one. */
		since: Record<string, string>;
		/** Immich links whose shrim.pics link was revoked here: left alone from then on. */
		ignored: string[];
		/** People who turned it off for themselves (user id, or ''). */
		off: string[];
	};
}

const file = join(config.dataDir, 'state.json');

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

/**
 * Every field gets a default, so files from older agents keep their pairing and links;
 * unknown fields are dropped. Also run on the state kept across dev reloads.
 */
export function upgrade(raw: unknown): AgentState {
	const s = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	return {
		relayUrl: str(s.relayUrl) || config.relayUrl,
		agentToken: str(s.agentToken),
		setupTokenUsed: str(s.setupTokenUsed) || undefined,
		immichApiKey: config.immichApiKey || str(s.immichApiKey),
		immichApiKeySavedAt: typeof s.immichApiKeySavedAt === 'string' ? s.immichApiKeySavedAt : undefined,
		immichKeyCanDelete: s.immichKeyCanDelete === true,
		immichKeyCanUpdate: s.immichKeyCanUpdate === true,
		immichPublicUrl: str(s.immichPublicUrl) || undefined,
		setupSeen: s.setupSeen === true,
		setupSeenBy: arr<string>(s.setupSeenBy).filter((x) => typeof x === 'string'),
		// People need a user id; a key, if any, is only ever an API key.
		people: arr<StoredPerson>(s.people)
			.filter((p) => p && typeof p.userId === 'string')
			.map((p) => ({
				...p,
				credential: p.credential?.kind === 'apiKey' && typeof p.credential.key === 'string' ? p.credential : null,
				keyInfo: p.keyInfo ?? null,
				checkedAt: typeof p.checkedAt === 'number' ? p.checkedAt : 0
			})),
		// Only these fields: never carry an older format's Immich sign-in tokens along.
		sessions: arr<StoredSession>(s.sessions)
			.filter((x) => x && typeof x.id === 'string' && typeof x.userId === 'string')
			.map(({ id, userId, createdAt, expiresAt }) => ({ id, userId, createdAt, expiresAt })),
		shares: arr<StoredShare>(s.shares).filter((x) => x && typeof x.id === 'string' && typeof x.key === 'string'),
		autoLinks: autoLinks(s.autoLinks)
	};
}

function autoLinks(raw: unknown): AgentState['autoLinks'] {
	const a = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
	const since = a.since && typeof a.since === 'object' ? (a.since as Record<string, unknown>) : {};
	return {
		since: Object.fromEntries(Object.entries(since).filter((e): e is [string, string] => typeof e[1] === 'string')),
		ignored: arr<string>(a.ignored).filter((x) => typeof x === 'string'),
		off: arr<string>(a.off).filter((x) => typeof x === 'string')
	};
}

function load(): AgentState {
	mkdirSync(config.dataDir, { recursive: true, mode: 0o700 });
	try {
		return upgrade(JSON.parse(readFileSync(file, 'utf8')));
	} catch (e) {
		if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e;
		return upgrade({});
	}
}

const g = globalThis as unknown as { __shrimAgentState?: AgentState };
// In dev, the state survives code reloads in memory: bring that copy up to date too, in place.
if (g.__shrimAgentState) {
	const live = g.__shrimAgentState as unknown as Record<string, unknown>;
	const next = upgrade(live);
	for (const k of Object.keys(live)) if (!(k in next)) delete live[k];
	Object.assign(live, next);
}
export const state: AgentState = (g.__shrimAgentState ??= load());

/** Writes atomically, readable by this user only (it holds share keys and Immich sign-ins). */
export function save() {
	const tmp = `${file}.${process.pid}.tmp`;
	writeFileSync(tmp, JSON.stringify(state, null, '\t'), { mode: 0o600 });
	renameSync(tmp, file);
}

export function findShare(id: string): StoredShare | undefined {
	return state.shares.find((s) => s.id === id);
}

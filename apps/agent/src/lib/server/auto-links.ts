/**
 * SHRIM_AUTO_LINKS: Immich has no plugins or webhooks, so the agent looks at each person's Immich
 * share links every so often. One made after they signed in here gets a shrim.pics link, put at the
 * start of its description, so Immich itself (web and app) shows what to send. Deleting the Immich
 * link, or changing its expiry or uploads there, carries over.
 */
import { can, forgetCredential, keyHolders, type AgentUser } from './auth.ts';
import { config } from './config.ts';
import { forgetShare } from './handler.ts';
import {
	AGENT_MADE,
	ImmichError,
	ImmichSignedOut,
	listSharedLinks,
	ownText,
	setSharedLinkDescription,
	sharedLink,
	type OwnSharedLink
} from './immich.ts';
import { RelayError, disableRelayShare, updateRelayShare } from './relay.ts';
import { createShare, forget, linkOf } from './shares.ts';
import { save, state, type ApiKeyCredential, type StoredShare } from './state.ts';

const EVERY_MS = 30_000;

/**
 * `unavailable`: SHRIM_AUTO_LINKS=off. `off`: they turned it off. `noRead`/`noUpdate`: their key
 * lacks sharedLink.read or sharedLink.update. `plan`: the relay wants a plan first.
 */
export type AutoLinkStatus = 'unavailable' | 'off' | 'on' | 'noRead' | 'noUpdate' | 'plan';

const status = new Map<string, AutoLinkStatus>();

/** `userId` is '' with SHRIM_AUTH=none. */
export function autoLinkStatus(userId: string): AutoLinkStatus {
	if (!config.autoLinks) return 'unavailable';
	if (state.autoLinks.off.includes(userId)) return 'off';
	return status.get(userId) ?? 'on';
}

/** Turning it back on starts afresh: links made while it was off are left alone. */
export function setAutoLinks(userId: string, on: boolean) {
	state.autoLinks.off = state.autoLinks.off.filter((id) => id !== userId);
	if (on) state.autoLinks.since[userId] = new Date().toISOString();
	else state.autoLinks.off.push(userId);
	status.delete(userId);
	save();
}

/** Ours first, on a line of its own: Immich's app shows a description on one line, cut short. */
export const withLink = (url: string, description: string | null) =>
	description?.trim() ? `${url}\n${description.trim()}` : url;

/** Should this Immich link get a shrim.pics link? */
export function wanted(link: OwnSharedLink, since: string, shares: StoredShare[], ignored: string[]): boolean {
	if (Date.parse(link.createdAt) <= Date.parse(since)) return false;
	// the agent can't open password links, and its own links already have one
	if (link.password || link.description === AGENT_MADE) return false;
	if (link.expiresAt && Date.parse(link.expiresAt) <= Date.now()) return false;
	if (ignored.includes(link.id)) return false;
	return !shares.some(
		(s) =>
			s.immichLinkId === link.id || s.auto?.immichLinkId === link.id || ('key' in s.immich && s.immich.key === link.key)
	);
}

async function follow(share: StoredShare, link: OwnSharedLink) {
	const auto = share.auto!;
	const patch: { allowUpload?: boolean; expiresAt?: string | null } = {};
	if (link.allowUpload !== share.allowUpload) patch.allowUpload = link.allowUpload;
	if (link.expiresAt !== auto.expiresAt) patch.expiresAt = link.expiresAt;
	// edited in Immich since: revoking puts back what they have now
	const text = ownText(link.description) || null;
	if (text !== auto.description) {
		auto.description = text;
		save();
	}
	const local = link.allowDownload !== share.allowDownload || link.showMetadata !== share.showMetadata;
	if (!Object.keys(patch).length && !local) return;
	if (Object.keys(patch).length) await updateRelayShare(share.id, patch);
	Object.assign(share, {
		allowUpload: link.allowUpload,
		allowDownload: link.allowDownload,
		showMetadata: link.showMetadata,
		...(patch.expiresAt !== undefined ? { expiresAt: patch.expiresAt } : {})
	});
	auto.expiresAt = link.expiresAt;
	save();
	forgetShare(share.id);
}

async function make(owner: AgentUser, cred: ApiKeyCredential, link: OwnSharedLink) {
	const ref = { key: link.key };
	const full = await sharedLink(ref);
	const share = await createShare(owner, ref, full, {
		label: '',
		expiresAt: link.expiresAt,
		auto: { immichLinkId: link.id, description: link.description, expiresAt: link.expiresAt }
	});
	if (!can(cred, 'update')) return;
	try {
		await setSharedLinkDescription(cred, link.id, withLink(linkOf(share), link.description));
	} catch (e) {
		if (!(e instanceof ImmichError && e.code === 'not_allowed')) throw e;
		status.set(owner.id, 'noUpdate');
	}
}

/** One person's links. Returns the Immich link ids seen, or null if the list couldn't be read. */
async function person(owner: AgentUser): Promise<Set<string> | null> {
	const cred = owner.credential!;
	let links: OwnSharedLink[];
	try {
		links = await listSharedLinks(cred);
	} catch (e) {
		if (e instanceof ImmichSignedOut) forgetCredential(cred);
		else if (e instanceof ImmichError && e.code === 'not_allowed') status.set(owner.id, 'noRead');
		return null;
	}
	const since = (state.autoLinks.since[owner.id] ??= new Date().toISOString());
	const byId = new Map(links.map((l) => [l.id, l]));

	for (const share of state.shares.filter((s) => s.auto && (s.ownerId ?? '') === owner.id)) {
		const link = byId.get(share.auto!.immichLinkId);
		if (link) await follow(share, link);
		else {
			await forget(share.id, 'gone');
			await disableRelayShare(share.id).catch(() => {});
		}
	}

	// turned off: links made before still follow Immich, no new ones
	if (state.autoLinks.off.includes(owner.id)) return new Set(byId.keys());
	status.set(owner.id, can(cred, 'update') ? 'on' : 'noUpdate');
	for (const link of links) {
		if (!wanted(link, since, state.shares, state.autoLinks.ignored)) continue;
		try {
			await make(owner, cred, link);
		} catch (e) {
			// no plan: try again once there is one
			if (e instanceof RelayError && e.status === 402) {
				status.set(owner.id, 'plan');
				break;
			}
			throw e;
		}
	}
	save();
	return new Set(byId.keys());
}

async function tick() {
	if (!state.agentToken) return;
	const seen = new Set<string>();
	let complete = true;
	for (const owner of keyHolders()) {
		const ids = await person(owner).catch((e: unknown) => {
			console.warn(`[shrim] automatic links: ${e instanceof Error ? e.message : String(e)}`);
			return null;
		});
		if (ids) for (const id of ids) seen.add(id);
		else complete = false;
	}
	// forget revoked links whose Immich link is gone too
	if (complete && state.autoLinks.ignored.some((id) => !seen.has(id))) {
		state.autoLinks.ignored = state.autoLinks.ignored.filter((id) => seen.has(id));
		save();
	}
}

let running = false;

/** Looks now, e.g. when someone opens the agent, rather than at the next round. */
export function checkAutoLinks() {
	if (!config.autoLinks || running) return;
	running = true;
	void tick().finally(() => (running = false));
}

const g = globalThis as unknown as { __shrimAutoLinks?: ReturnType<typeof setInterval> };

export function startAutoLinks() {
	clearInterval(g.__shrimAutoLinks);
	if (config.autoLinks) g.__shrimAutoLinks = setInterval(checkAutoLinks, EVERY_MS);
}

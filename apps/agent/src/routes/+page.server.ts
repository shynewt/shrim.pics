import { fail, redirect } from '@sveltejs/kit';
import { parseImmichLink, type ImmichLinkRef } from '@shrim/protocol';
import { authEnabled, can, dismissOlderKey, endSession, forgetCredential, type AgentUser } from '#lib/server/auth.ts';
import { config } from '#lib/server/config.ts';
import { apiKeysPage, immichPublicUrl } from '#lib/server/public-url.ts';
import { enqueue, forgetShare } from '#lib/server/handler.ts';
import { createShare, forget, linkOf, ownerCredential } from '#lib/server/shares.ts';
import { autoLinkStatus, checkAutoLinks, setAutoLinks } from '#lib/server/auto-links.ts';
import {
	API_KEY_OPTIONAL,
	API_KEY_PERMISSIONS,
	ImmichError,
	ImmichSignedOut,
	checkApiKey,
	createAlbumLink,
	deleteSharedLink,
	ping,
	sharedLink,
	updateSharedLink,
	type SharedLink
} from '#lib/server/immich.ts';
import {
	RelayError,
	cancelPairing,
	connection,
	disableRelayShare,
	disconnect,
	listRelayShares,
	pairing,
	setupTokenRejected,
	refreshMe,
	startPairing,
	updateRelayShare
} from '#lib/server/relay.ts';
import { save, state, type StoredShare } from '#lib/server/state.ts';
import { formText } from '#lib/server/form.ts';
import type { Actions, PageServerLoad } from './$types';

const EXPIRY_DAYS = new Set([0, 1, 7, 30, 90]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Their own link (with SHRIM_AUTH=none, every link is). */
const isMine = (user: AgentUser, s: StoredShare) => !authEnabled() || (!!s.ownerId && s.ownerId === user.id);
const canSee = (user: AgentUser, s: StoredShare) => user.isAdmin || isMine(user, s);

function signedOut(user: AgentUser): never {
	if (user.credential) forgetCredential(user.credential);
	redirect(303, '/login?expired=1');
}

const adminOnly = () => fail(403, { error: 'adminOnly' as const });

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;
	checkAutoLinks();
	// Someone may have just subscribed: look at the account again if it's been a while.
	const [immichOk, remote] = await Promise.all([
		ping(),
		state.agentToken ? listRelayShares() : null,
		refreshMe(15_000)
	]);
	const byId = new Map(remote?.map((r) => [r.id, r]) ?? []);
	const conn = connection();

	// Links you turned off on the dashboard are gone for good: drop them here too.
	for (const r of remote ?? []) {
		if (r.state === 'disabled' && r.disabledBy === 'owner') await forget(r.id);
	}

	return {
		auth: config.auth,
		me: {
			id: user.id,
			name: user.name,
			email: user.email,
			isAdmin: user.isAdmin,
			via: user.via,
			olderKey: user.olderKey
		},
		immich: {
			url: config.immichUrl,
			ok: immichOk,
			/** The album list works: signed in with Immich, or (SHRIM_AUTH=none) the agent has a key. */
			canList: !!user.credential,
			publicUrl: immichPublicUrl(null),
			apiKeysUrl: apiKeysPage(immichPublicUrl(null))
		},
		autoLinks: !['unavailable', 'off', 'noRead'].includes(autoLinkStatus(user.id)),
		// on, but their key is missing a permission: say so here, not only in Settings
		autoLinksIssue: (['noRead', 'noUpdate'] as const).find((s) => s === autoLinkStatus(user.id)) ?? null,
		setupSeen: authEnabled() ? state.setupSeenBy.includes(user.id) : !!state.setupSeen,
		relay: {
			url: state.relayUrl,
			status: conn.status,
			accountActive: conn.me?.accountActive ?? null,
			// Which shrim.pics account this agent uses: only for whoever manages the connection.
			email: user.isAdmin ? (conn.me?.email ?? null) : null,
			hasToken: !!state.agentToken
		},
		pairing: user.isAdmin ? pairing() : null,
		setupRejected: user.isAdmin && setupTokenRejected(),
		permissions: API_KEY_PERMISSIONS,
		optionalPermissions: API_KEY_OPTIONAL,
		keyCanUpdate: can(user.credential, 'update'),
		shares: state.shares
			.filter((s) => canSee(user, s))
			.reverse()
			.map((s) => {
				const r = byId.get(s.id);
				const expired = !!s.expiresAt && Date.parse(s.expiresAt) <= Date.now();
				const mine = isMine(user, s);
				return {
					id: s.id,
					label: s.label,
					albumName: s.albumName,
					mine,
					owner: mine ? null : (s.ownerName ?? null),
					// Someone else's link opens their album: an admin may revoke it, not open it.
					link: mine ? linkOf(s) : null,
					allowUpload: s.allowUpload,
					madeByAgent: !!s.immichLinkId,
					fromImmich: !!s.auto,
					removesImmichLink: !!s.immichLinkId && can(ownerCredential(s), 'delete'),
					allowDownload: s.allowDownload ?? null,
					showMetadata: s.showMetadata ?? null,
					createdAt: s.createdAt,
					expiresAt: s.expiresAt,
					expired: expired || r?.state === 'expired',
					disabledByOperator: r?.state === 'disabled' && r.disabledBy === 'operator',
					// The relay doesn't know it: made with another account, or that account is gone.
					unknown: remote !== null && !r,
					views: r?.views ?? null
				};
			})
	};
};

type CreateError = 'empty' | 'format' | 'notFound' | 'password' | 'immichDown' | 'relayDown' | 'plan' | 'noKey';

async function finishShare(
	owner: AgentUser,
	ref: ImmichLinkRef,
	link: SharedLink,
	label: string,
	days: number,
	immichLinkId?: string
) {
	const expiresAt = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
	const share = await createShare(owner, ref, link, { label, expiresAt, immichLinkId });
	return {
		id: share.id,
		link: linkOf(share),
		label: label || link.album?.albumName || 'Shared photos',
		allowUpload: link.allowUpload,
		allowDownload: link.allowDownload,
		showMetadata: link.showMetadata,
		expiresAt
	};
}

function readCommon(form: FormData) {
	const label = formText(form, 'label').trim().slice(0, 80);
	const days = Number(form.get('expires') ?? 30);
	return { label, days: EXPIRY_DAYS.has(days) ? days : 30 };
}

function relayFailure(e: unknown): CreateError {
	return e instanceof RelayError && e.status === 402 ? 'plan' : 'relayDown';
}

export const actions: Actions = {
	/** From the album picker: we make the Immich link ourselves. */
	createFromAlbum: async ({ request, locals }) => {
		const user = locals.user;
		const cred = user.credential;
		const form = await request.formData();
		const albumId = formText(form, 'albumId');
		const { label, days } = readCommon(form);
		const err = (error: CreateError) => fail(400, { error, albumId });
		if (!cred) return err('noKey');
		if (!UUID.test(albumId)) return err('notFound');

		let made: { id: string; key: string };
		try {
			// As this person, so the Immich link is theirs in Immich too.
			made = await createAlbumLink(cred, {
				albumId,
				allowUpload: form.get('allowUpload') === 'on',
				allowDownload: form.get('allowDownload') === 'on',
				showMetadata: form.get('showMetadata') === 'on'
			});
		} catch (e) {
			if (e instanceof ImmichSignedOut && authEnabled()) signedOut(user);
			return err(e instanceof ImmichError && e.code !== 'immich_unreachable' ? 'notFound' : 'immichDown');
		}
		const ref = { key: made.key };
		try {
			const link = await sharedLink(ref);
			return { created: await finishShare(user, ref, link, label, days, made.id) };
		} catch (e) {
			// Don't leave an orphan link behind in Immich.
			await deleteSharedLink(cred, made.id).catch(() => {});
			return err(e instanceof ImmichError ? 'immichDown' : relayFailure(e));
		}
	},

	/** From a pasted Immich link: no API key needed. */
	create: async ({ request, locals }) => {
		const form = await request.formData();
		const url = formText(form, 'url').trim();
		const { label, days } = readCommon(form);
		const err = (error: CreateError) => fail(400, { url, label, days, error });

		if (!url) return err('empty');
		const ref = parseImmichLink(url);
		if (!ref) return err('format');

		let link;
		try {
			link = await sharedLink(ref);
		} catch (e) {
			if (e instanceof ImmichError && e.code === 'not_allowed') return err('password');
			if (e instanceof ImmichError && (e.code === 'link_gone' || e.code === 'not_found')) return err('notFound');
			return err('immichDown');
		}
		if (link.password) return err('password');
		// Remember where Immich lives publicly, only to link to its settings later. Only from an
		// admin: the key is checked, the host isn't, and everyone's sign-in page links there.
		if (locals.user.isAdmin && !state.immichPublicUrl) {
			try {
				state.immichPublicUrl = new URL(url).origin;
			} catch {
				// a bare key: nothing to learn
			}
		}
		try {
			return { created: await finishShare(locals.user, ref, link, label, days) };
		} catch (e) {
			return err(relayFailure(e));
		}
	},

	autoLinks: async ({ request, locals }) => {
		if (!config.autoLinks) return fail(400, { autoLinksError: true });
		const on = (await request.formData()).get('on') === 'on';
		setAutoLinks(locals.user.id, on);
		return { autoLinks: on };
	},

	revoke: async ({ request, locals }) => {
		const id = formText(await request.formData(), 'id');
		const share = state.shares.find((s) => s.id === id);
		if (!share || !canSee(locals.user, share)) return fail(404, { revokeError: true });
		// Dropping the key is what really ends the link; the rest is tidying up.
		await forget(id);
		await disableRelayShare(id).catch(() => {});
		return { revoked: id };
	},

	edit: async ({ request, locals }) => {
		const user = locals.user;
		const form = await request.formData();
		const id = formText(form, 'id');
		const share = state.shares.find((s) => s.id === id);
		// Only the person who made a link changes it.
		if (!share || !isMine(user, share)) return fail(404, { editError: 'notFound' as const });

		share.label = formText(form, 'label', share.label).trim().slice(0, 80);

		const cred = user.credential;
		try {
			if (share.immichLinkId && cred && can(cred, 'update')) {
				await updateSharedLink(cred, share.immichLinkId, {
					allowUpload: form.get('allowUpload') === 'on',
					allowDownload: form.get('allowDownload') === 'on',
					showMetadata: form.get('showMetadata') === 'on',
					expiresAt: null
				});
			}
			// Whatever Immich says now is the truth (it may have been changed there too).
			const link = await sharedLink(share.immich);
			share.allowUpload = link.allowUpload;
			share.allowDownload = link.allowDownload;
			share.showMetadata = link.showMetadata;
		} catch (e) {
			save();
			if (e instanceof ImmichSignedOut && authEnabled()) signedOut(user);
			return fail(400, {
				editError: e instanceof ImmichError && e.code === 'link_gone' ? ('gone' as const) : ('immichDown' as const)
			});
		}

		const expires = formText(form, 'expires', 'keep');
		const patch: { allowUpload: boolean; expiresAt?: string | null } = { allowUpload: share.allowUpload };
		if (expires !== 'keep') {
			const days = Number(expires);
			if (!EXPIRY_DAYS.has(days)) return fail(400, { editError: 'format' as const });
			patch.expiresAt = days ? new Date(Date.now() + days * 86_400_000).toISOString() : null;
		}
		try {
			await updateRelayShare(id, patch);
		} catch {
			save();
			return fail(502, { editError: 'relayDown' as const });
		}
		if (patch.expiresAt !== undefined) share.expiresAt = patch.expiresAt;
		save();
		forgetShare(id); // so the next request sees the new settings
		return { edited: id };
	},

	/** SHRIM_AUTH=none only: with sign-in, everyone uses their own Immich account. */
	saveApiKey: async ({ request }) => {
		if (authEnabled()) return fail(403, { keyError: 'invalid' as const, missing: [] });
		const key = formText(await request.formData(), 'apiKey').trim();
		if (!key) return fail(400, { keyError: 'empty' as const });
		let check;
		try {
			check = await checkApiKey(key);
		} catch {
			return fail(502, { keyError: 'immichDown' as const });
		}
		if (!check.ok) return fail(400, { keyError: check.reason, missing: check.missing ?? [] });
		state.immichApiKey = key;
		state.immichApiKeySavedAt = new Date().toISOString();
		state.autoLinks.since[''] ??= state.immichApiKeySavedAt;
		state.immichKeyCanDelete = check.canDelete;
		state.immichKeyCanUpdate = check.canUpdate;
		save();
		return { keySaved: true, fullAccess: check.fullAccess, canDelete: check.canDelete, canUpdate: check.canUpdate };
	},

	removeApiKey: () => {
		if (authEnabled()) return fail(403, { keyRemoved: false });
		state.immichApiKey = '';
		state.immichApiKeySavedAt = undefined;
		state.immichKeyCanDelete = undefined;
		state.immichKeyCanUpdate = undefined;
		save();
		return { keyRemoved: true };
	},

	markSetupSeen: ({ locals }) => {
		if (!authEnabled()) state.setupSeen = true;
		else if (!state.setupSeenBy.includes(locals.user.id)) state.setupSeenBy.push(locals.user.id);
		save();
		return { setupSeen: true };
	},

	pair: async ({ request, locals }) => {
		if (!locals.user.isAdmin) return adminOnly();
		const relayUrl = formText(await request.formData(), 'relayUrl', state.relayUrl)
			.trim()
			.replace(/\/$/, '');
		try {
			const u = new URL(relayUrl);
			if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error();
		} catch {
			return fail(400, { pairError: 'url' as const, relayUrl });
		}
		try {
			await startPairing(relayUrl, enqueue);
		} catch {
			return fail(502, { pairError: 'unreachable' as const, relayUrl });
		}
		save();
		return { pairing: true };
	},

	cancelPairing: ({ locals }) => {
		if (!locals.user.isAdmin) return adminOnly();
		cancelPairing();
		return { pairingCancelled: true };
	},

	disconnect: async ({ locals }) => {
		if (!locals.user.isAdmin) return adminOnly();
		await disconnect();
		return { disconnected: true };
	},

	/** Signs this browser out. Once no browser is signed in as them, the agent forgets their key. */
	signOut: ({ cookies }) => {
		const { forgotKey } = endSession(cookies);
		redirect(303, forgotKey ? `/login?forgot=${encodeURIComponent(forgotKey)}` : '/login');
	},

	dismissOlderKey: ({ locals }) => {
		dismissOlderKey(locals.user.id);
		return { olderKeyDismissed: true };
	}
};

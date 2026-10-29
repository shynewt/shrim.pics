import { generateShareKey, shareLink, toBase64Url, type ImmichLinkRef } from '@shrim/protocol';
import { authEnabled, can, credentialOf, localUser, type AgentUser } from './auth.ts';
import { forgetShare } from './handler.ts';
import { deleteSharedLink, setSharedLinkDescription, type SharedLink } from './immich.ts';
import { connection, createRelayShare } from './relay.ts';
import { save, state, type AutoLink, type StoredShare } from './state.ts';

export function relayOrigin() {
	return connection().me?.publicOrigin ?? state.relayUrl;
}

export const linkOf = (s: StoredShare) => shareLink(relayOrigin(), s.id, Buffer.from(s.key, 'base64url'));

/** What the agent can act on a link's Immich side with: its owner's sign-in, if they have one. */
export const ownerCredential = (s: StoredShare) => (authEnabled() ? credentialOf(s.ownerId) : localUser().credential);

export async function createShare(
	owner: AgentUser,
	ref: ImmichLinkRef,
	link: SharedLink,
	opts: { label: string; expiresAt: string | null; immichLinkId?: string; auto?: AutoLink }
): Promise<StoredShare> {
	const id = await createRelayShare(link.allowUpload, opts.expiresAt);
	const share: StoredShare = {
		id,
		key: toBase64Url(generateShareKey()),
		immich: ref,
		label: opts.label,
		albumName: link.album?.albumName ?? '',
		linkType: link.type,
		allowUpload: link.allowUpload,
		createdAt: new Date().toISOString(),
		expiresAt: opts.expiresAt,
		immichLinkId: opts.immichLinkId,
		allowDownload: link.allowDownload,
		showMetadata: link.showMetadata,
		...(authEnabled() ? { ownerId: owner.id, ownerName: owner.name } : {}),
		...(opts.auto ? { auto: opts.auto } : {})
	};
	state.shares.push(share);
	save();
	return share;
}

/**
 * Forgets a link here: its key, and the Immich link if we made it (as its owner, if we still can).
 * An automatic link's Immich link is theirs: it stays, with its old description back, and is left
 * alone from then on. `gone`: the Immich link itself was deleted, so there's nothing to tidy there.
 */
export async function forget(id: string, why: 'revoked' | 'gone' = 'revoked') {
	const share = state.shares.find((s) => s.id === id);
	if (!share) return;
	state.shares = state.shares.filter((s) => s.id !== id);
	save();
	forgetShare(id);
	if (why === 'gone') return;
	if (share.auto && !state.autoLinks.ignored.includes(share.auto.immichLinkId)) {
		state.autoLinks.ignored.push(share.auto.immichLinkId);
		save();
	}
	const cred = ownerCredential(share);
	if (!cred) return;
	if (share.immichLinkId && can(cred, 'delete')) {
		await deleteSharedLink(cred, share.immichLinkId).catch(() => {});
	}
	if (share.auto && can(cred, 'update')) {
		await setSharedLinkDescription(cred, share.auto.immichLinkId, share.auto.description ?? '').catch(() => {});
	}
}

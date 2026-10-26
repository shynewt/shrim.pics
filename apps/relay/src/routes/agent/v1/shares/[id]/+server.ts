import { disableShare, shareById, updateShare } from '#lib/server/accounts.ts';
import { agentAccount } from '#lib/server/agent-auth.ts';
import { relayError } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = ({ params, request }) => {
	const account = agentAccount(request, { requireActive: false });
	if (account instanceof Response) return account;
	const share = shareById(params.id);
	if (!share || share.account_id !== account.id) return relayError(404, 'not_found');
	disableShare(share.id, 'owner');
	return new Response(null, { status: 204 });
};

/** Change a live link's expiry (ISO date or null) or whether it takes uploads. */
export const PATCH: RequestHandler = async ({ params, request }) => {
	const account = agentAccount(request, { requireActive: false });
	if (account instanceof Response) return account;
	const body = (await request.json().catch(() => null)) as { expiresAt?: unknown; allowUpload?: unknown } | null;
	if (!body) return relayError(400, 'bad_request');
	const patch: { expiresAt?: number | null; allowUpload?: boolean } = {};
	if (body.expiresAt === null) patch.expiresAt = null;
	else if (body.expiresAt !== undefined) {
		const t = typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN;
		if (!Number.isFinite(t) || t <= Date.now()) return relayError(400, 'bad_request');
		patch.expiresAt = t;
	}
	if (typeof body.allowUpload === 'boolean') patch.allowUpload = body.allowUpload;
	if (!updateShare(params.id, account.id, patch)) return relayError(404, 'not_found');
	return new Response(null, { status: 204 });
};

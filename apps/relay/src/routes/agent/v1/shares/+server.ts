import type { CreatedShare } from '@shrim/protocol';
import { createShare, shareState, sharesForAccount } from '#lib/server/accounts.ts';
import { agentAccount } from '#lib/server/agent-auth.ts';
import { relayError } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request }) => {
	const account = agentAccount(request, { requireActive: false });
	if (account instanceof Response) return account;
	return Response.json(
		sharesForAccount(account.id).map((s) => ({
			id: s.id,
			state: shareState(s),
			disabledBy: s.disabled_by,
			views: s.views
		}))
	);
};

export const POST: RequestHandler = async ({ request }) => {
	const account = agentAccount(request);
	if (account instanceof Response) return account;
	const body = (await request.json().catch(() => null)) as { allowUpload?: unknown; expiresAt?: unknown } | null;
	if (!body || typeof body.allowUpload !== 'boolean') return relayError(400, 'bad_request');
	let expiresAt: number | null = null;
	if (body.expiresAt !== null && body.expiresAt !== undefined) {
		expiresAt = typeof body.expiresAt === 'string' ? Date.parse(body.expiresAt) : NaN;
		if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return relayError(400, 'bad_request');
	}
	const created: CreatedShare = { id: createShare(account.id, body.allowUpload, expiresAt) };
	return Response.json(created, { status: 201 });
};

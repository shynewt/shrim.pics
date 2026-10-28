import { redeemSetupToken } from '#lib/server/accounts.ts';
import { relayError } from '#lib/server/http.ts';
import { limits } from '#lib/server/limits.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	if (!limits.setup.take(getClientAddress())) return relayError(429, 'slow_down');
	const body = (await request.json().catch(() => null)) as { setupToken?: unknown } | null;
	if (typeof body?.setupToken !== 'string') return relayError(400, 'bad_request');
	const token = redeemSetupToken(body.setupToken);
	return Response.json(token ? { status: 'approved', token } : { status: 'invalid' });
};

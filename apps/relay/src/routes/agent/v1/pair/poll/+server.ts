import { pollPairing } from '#lib/server/accounts.ts';
import { relayError } from '#lib/server/http.ts';
import type { RequestHandler } from './$types';

/** The agent checks whether its code was approved. Hands over the token once. */
export const POST: RequestHandler = async ({ request }) => {
	const body = (await request.json().catch(() => null)) as { deviceCode?: unknown } | null;
	if (typeof body?.deviceCode !== 'string' || body.deviceCode.length < 20) return relayError(400, 'bad_request');
	return Response.json(pollPairing(body.deviceCode));
};

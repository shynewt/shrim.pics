import { startPairing } from '#lib/server/accounts.ts';
import { config } from '#lib/server/config.ts';
import { relayError } from '#lib/server/http.ts';
import { limits } from '#lib/server/limits.ts';
import type { RequestHandler } from './$types';

/** An agent without a token asks for a pairing code to show its owner. */
export const POST: RequestHandler = ({ url, getClientAddress }) => {
	if (!limits.auth.take(getClientAddress())) return relayError(429, 'slow_down');
	const { deviceCode, userCode, expiresAt } = startPairing(getClientAddress());
	const origin = config.publicOrigin ?? url.origin;
	return Response.json({
		deviceCode,
		userCode,
		expiresAt,
		approveUrl: `${origin}/connect?code=${encodeURIComponent(userCode)}`,
		interval: 3
	});
};

import { createSetupToken } from '#lib/server/accounts.ts';
import { relayError } from '#lib/server/http.ts';
import { limits } from '#lib/server/limits.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = ({ locals }) => {
	if (!locals.account) return relayError(401, 'unauthorized');
	if (!limits.setup.take(`account:${locals.account.id}`)) return relayError(429, 'slow_down');
	return Response.json(createSetupToken(locals.account.id));
};

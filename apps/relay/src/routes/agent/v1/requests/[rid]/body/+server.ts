import { agentAccount } from '#lib/server/agent-auth.ts';
import { relayError } from '#lib/server/http.ts';
import { takeBody } from '#lib/server/router.ts';
import type { RequestHandler } from './$types';

/** Streams a request body that was too large to inline in the event. */
export const GET: RequestHandler = ({ params, request }) => {
	const account = agentAccount(request);
	if (account instanceof Response) return account;
	const body = takeBody(account.id, params.rid);
	if (!body) return relayError(404, 'not_found');
	return new Response(body, { headers: { 'content-type': 'application/octet-stream' } });
};

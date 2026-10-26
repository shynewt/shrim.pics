import { agentAccount } from '#lib/server/agent-auth.ts';
import { connectAgent } from '#lib/server/router.ts';
import type { RequestHandler } from './$types';

/** The agent's inbox. Requests arrive here as server-sent events. */
export const GET: RequestHandler = ({ request }) => {
	// Unpaid accounts may connect (set up first, pay after); their links still don't open.
	const account = agentAccount(request, { requireActive: false });
	if (account instanceof Response) return account;
	return new Response(connectAgent(account.id), {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-store',
			'x-accel-buffering': 'no'
		}
	});
};

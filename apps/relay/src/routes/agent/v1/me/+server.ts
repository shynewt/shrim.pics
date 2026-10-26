import type { AgentMe } from '@shrim/protocol';
import { removeAgentToken } from '#lib/server/accounts.ts';
import { agentAccount } from '#lib/server/agent-auth.ts';
import { config } from '#lib/server/config.ts';
import { disconnectAgent } from '#lib/server/router.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = ({ request, url }) => {
	const account = agentAccount(request, { requireActive: false });
	if (account instanceof Response) return account;
	const me: AgentMe = {
		accountActive: account.active,
		publicOrigin: config.publicOrigin ?? url.origin,
		email: account.email
	};
	return Response.json(me);
};

/** The agent disconnects itself: its token stops working here too. */
export const DELETE: RequestHandler = ({ request }) => {
	const account = agentAccount(request, { requireActive: false });
	if (account instanceof Response) return account;
	removeAgentToken(account.id);
	disconnectAgent(account.id);
	return new Response(null, { status: 204 });
};

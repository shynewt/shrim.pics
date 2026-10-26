import { accountForAgentToken, toAccount, type Account } from './accounts.ts';
import { relayError } from './http.ts';

export function agentAccount(request: Request, { requireActive = true } = {}): Account | Response {
	const row = accountForAgentToken(request.headers.get('authorization'));
	if (!row) return relayError(401, 'unauthorized');
	const account = toAccount(row);
	if (account.suspended) return relayError(403, 'unauthorized');
	if (requireActive && !account.active) return relayError(402, 'inactive');
	return account;
}

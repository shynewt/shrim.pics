import type { RelayErrorCode } from '@shrim/protocol';
import { agentAccount } from '#lib/server/agent-auth.ts';
import { relayError } from '#lib/server/http.ts';
import { answer } from '#lib/server/router.ts';
import type { RequestHandler } from './$types';

const AGENT_ERRORS: Partial<Record<RelayErrorCode, number>> = {
	not_found: 404,
	gone: 410,
	bad_request: 400,
	slow_down: 429
};

/**
 * The agent answers a request. Either an encrypted stream (piped to the
 * viewer as it arrives), or `x-shrim-error` when the agent couldn't even
 * decrypt the request.
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const account = agentAccount(request);
	if (account instanceof Response) return account;

	const code = request.headers.get('x-shrim-error') as RelayErrorCode | null;
	if (code) {
		const status = AGENT_ERRORS[code];
		if (!status) return relayError(400, 'bad_request');
		request.body?.cancel().catch(() => {});
		return answer(account.id, params.rid, { ok: false, code, status })
			? new Response(null, { status: 204 })
			: relayError(404, 'not_found');
	}

	if (!request.body) return relayError(400, 'bad_request');
	const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
	if (!answer(account.id, params.rid, { ok: true, stream: readable })) {
		request.body.cancel().catch(() => {});
		return relayError(404, 'not_found');
	}
	// Hold the agent's request open until the viewer has everything.
	try {
		await request.body.pipeTo(writable);
	} catch {
		return relayError(499, 'timeout');
	}
	return new Response(null, { status: 204 });
};

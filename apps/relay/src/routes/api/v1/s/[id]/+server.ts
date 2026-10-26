import { INLINE_LIMIT, MAX_REQUEST_BODY, MAX_UPLOAD_REQUEST_BODY, SHARE_ID_PATTERN } from '@shrim/protocol';
import { accountById, recordTraffic, shareById, shareState, toAccount } from '#lib/server/accounts.ts';
import { answerDemo, isDemoShare } from '#lib/server/demo/index.ts';
import { countBytes, relayError, splitBody } from '#lib/server/http.ts';
import { limits } from '#lib/server/limits.ts';
import { forward } from '#lib/server/router.ts';
import type { RequestHandler } from './$types';

/** The viewer's only endpoint: an encrypted request in, an encrypted response out. */
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	if (!SHARE_ID_PATTERN.test(params.id)) return relayError(404, 'not_found');
	if (!limits.viewer.take(getClientAddress())) return relayError(429, 'slow_down');

	// The example album: answered here, encrypted like an agent would, and not counted anywhere.
	if (isDemoShare(params.id)) {
		const { inline, tooLarge } = await splitBody(request.body, MAX_REQUEST_BODY, MAX_REQUEST_BODY);
		if (tooLarge || !inline) return relayError(413, 'too_large');
		const stream = await answerDemo(inline);
		if (!stream) return relayError(400, 'bad_request');
		return new Response(stream, {
			headers: { 'content-type': 'application/octet-stream', 'cache-control': 'no-store' }
		});
	}

	const share = shareById(params.id);
	if (!share) return relayError(404, 'not_found');
	if (shareState(share) !== 'live') return relayError(410, 'gone');
	const owner = accountById(share.account_id);
	if (!owner || !toAccount(owner).active) return relayError(402, 'inactive');

	const max = share.allow_upload ? MAX_UPLOAD_REQUEST_BODY : MAX_REQUEST_BODY;
	const declared = Number(request.headers.get('content-length') ?? 0);
	if (declared > max) return relayError(413, 'too_large');

	const { inline, rest, tooLarge } = await splitBody(request.body, INLINE_LIMIT, max);
	if (tooLarge) return relayError(413, 'too_large');
	const bytesIn = inline?.length ?? declared;

	const outcome = await forward(share.account_id, share.id, { inline, body: rest }, request.signal);
	if (!outcome.ok) return relayError(outcome.status, outcome.code);

	const counted = countBytes(outcome.stream, (out) => recordTraffic(share.id, out, bytesIn));
	return new Response(counted, {
		headers: {
			'content-type': 'application/octet-stream',
			'cache-control': 'no-store'
		}
	});
};

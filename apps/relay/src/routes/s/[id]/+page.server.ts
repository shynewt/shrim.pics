import { SHARE_ID_PATTERN } from '@shrim/protocol';
import { accountById, countView, shareById, shareState, toAccount } from '#lib/server/accounts.ts';
import { isDemoShare } from '#lib/server/demo/index.ts';
import { agentOnline } from '#lib/server/router.ts';
import type { PageServerLoad } from './$types';

export type ShareStatus = 'live' | 'invalid' | 'expired' | 'disabled' | 'unavailable' | 'offline';

/** Tells the viewer straight away whether there's any point in trying. Knows nothing about the content. */
export const load: PageServerLoad = ({ params, setHeaders }) => {
	setHeaders({ 'cache-control': 'no-store', 'x-robots-tag': 'noindex, nofollow' });
	const status = (s: ShareStatus) => ({ id: params.id, status: s, demo: false });

	if (!SHARE_ID_PATTERN.test(params.id)) return status('invalid');
	// The example album is always there (unless SHRIM_DEMO=off) and isn't counted.
	if (isDemoShare(params.id)) return { ...status('live'), demo: true };
	const share = shareById(params.id);
	if (!share) return status('invalid');
	const state = shareState(share);
	if (state !== 'live') return status(state);
	const owner = accountById(share.account_id);
	if (!owner || !toAccount(owner).active) return status('unavailable');
	if (!agentOnline(share.account_id)) return status('offline');
	countView(share.id);
	return status('live');
};

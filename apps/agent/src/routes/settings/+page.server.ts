import { authEnabled, can } from '#lib/server/auth.ts';
import { config } from '#lib/server/config.ts';
import { API_KEY_OPTIONAL, ping, serverInfo } from '#lib/server/immich.ts';
import { apiKeysPage, immichPublicUrl } from '#lib/server/public-url.ts';
import { ssoCallbackUrl } from '#lib/server/sso.ts';
import { connection, refreshMe } from '#lib/server/relay.ts';
import { state } from '#lib/server/state.ts';
import type { PageServerLoad } from './$types';

export { actions } from '../+page.server.ts';

export const load: PageServerLoad = async ({ locals, url }) => {
	const user = locals.user;
	const [ok, info] = await Promise.all([ping(), serverInfo(), refreshMe(15_000)]);
	const c = connection();
	const cred = user.credential;
	// The agent's own key only exists with SHRIM_AUTH=none.
	const key = authEnabled() ? '' : state.immichApiKey;
	return {
		auth: config.auth,
		me: {
			name: user.name,
			email: user.email,
			isAdmin: user.isAdmin,
			via: user.via,
			keyName: user.keyName,
			olderKey: user.olderKey,
			// The last few characters, so people can tell which of their keys this is.
			keyHint: authEnabled() && cred?.kind === 'apiKey' ? cred.key.slice(-4) : null,
			fullAccess: cred?.kind === 'apiKey' && cred.fullAccess,
			canUpdate: can(cred, 'update'),
			canDelete: can(cred, 'delete')
		},
		relay: {
			url: state.relayUrl,
			status: c.status,
			email: user.isAdmin ? (c.me?.email ?? null) : null,
			connected: !!state.agentToken,
			fromEnv: !!process.env.SHRIM_RELAY_URL
		},
		immich: {
			url: config.immichUrl,
			ok,
			hasKey: !!key,
			keyHint: key ? key.slice(-4) : null,
			keySavedAt: state.immichApiKeySavedAt ?? null,
			keyFromEnv: !!config.immichApiKey,
			keyCanUpdate: !!state.immichKeyCanUpdate,
			keyCanDelete: !!state.immichKeyCanDelete,
			publicUrl: state.immichPublicUrl ?? null,
			apiKeysUrl: apiKeysPage(immichPublicUrl(info))
		},
		optionalPermissions: API_KEY_OPTIONAL,
		sso: authEnabled() && user.isAdmin ? { enabled: !!info?.oauth, callbackUrl: ssoCallbackUrl(url.origin) } : null
	};
};

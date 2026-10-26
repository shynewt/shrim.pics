import { resolve } from 'node:path';

const env = process.env;

function authMode(value: string | undefined): 'immich' | 'none' {
	const v = (value ?? '').trim().toLowerCase();
	if (v === 'none') return 'none';
	if (v && v !== 'immich')
		console.warn(`[shrim] SHRIM_AUTH=${value} isn't known; using "immich" (sign in with Immich).`);
	return 'immich';
}

export const config = {
	immichUrl: (env.IMMICH_URL ?? 'http://immich-server:2283').replace(/\/$/, ''),
	/** Optional: Immich's address in a browser, to link people to their API keys. Usually found by itself. */
	immichPublicUrl: (env.IMMICH_PUBLIC_URL ?? '').replace(/\/$/, ''),
	/** Seeds the state on first start. Can be changed in the UI afterwards. */
	relayUrl: (env.SHRIM_RELAY_URL ?? 'https://shrim.pics').replace(/\/$/, ''),
	agentToken: env.SHRIM_AGENT_TOKEN ?? '',
	/**
	 * `immich` (default): everyone signs in with their own Immich account.
	 * `none`: no sign-in, for when something in front (a VPN, Authelia…) already checks who you are.
	 */
	auth: authMode(env.SHRIM_AUTH),
	/**
	 * Names the agent answers on besides IP addresses and localhost, e.g. `nas.home.arpa,.ts.net`.
	 * Checked with SHRIM_AUTH=none (always, once set): see lib/server/hosts.ts.
	 */
	allowedHosts: (env.SHRIM_ALLOWED_HOSTS ?? '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean),
	/** Only with SHRIM_AUTH=none: lets the agent list albums and create Immich share links. */
	immichApiKey: env.IMMICH_API_KEY ?? '',
	dataDir: resolve(env.DATA_DIR ?? '.data'),
	maxUploadBytes: Number(env.SHRIM_MAX_UPLOAD_MB ?? 4096) * 1024 * 1024,
	concurrency: Number(env.SHRIM_CONCURRENCY ?? 12)
};

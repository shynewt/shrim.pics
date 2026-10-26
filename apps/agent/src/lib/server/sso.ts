/**
 * Immich isn't a sign-in provider itself, but its OAuth endpoints take the address to come
 * back to, so the agent runs the same flow Immich's web app does, with its own callback.
 * The provider must allow <agent>/login/sso as a redirect URI: the one setup step.
 */
import { createHash, randomBytes } from 'node:crypto';
import {
	AGENT_KEY_NAME,
	AGENT_KEY_PERMISSIONS,
	ImmichError,
	createApiKey,
	logout,
	oauthAuthorize,
	oauthCallback,
	type ImmichUser
} from './immich.ts';
import type { ApiKeyCredential, Credential, KeyInfo } from './state.ts';

export const SSO_COOKIE = 'shrim_agent_sso';
export const SSO_PATH = '/login/sso';
const TTL_MS = 10 * 60_000;

export const ssoCallbackUrl = (origin: string) => `${origin}${SSO_PATH}`;

const g = globalThis as unknown as { __shrimSso?: Map<string, { verifier: string; at: number }> };
const pending = (g.__shrimSso ??= new Map<string, { verifier: string; at: number }>());

const random = () => randomBytes(32).toString('base64url');

export async function startSso(origin: string): Promise<{ url: string; state: string }> {
	const now = Date.now();
	for (const [k, v] of pending) if (now - v.at > TTL_MS) pending.delete(k);
	const state = random();
	const verifier = random();
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	const url = await oauthAuthorize(ssoCallbackUrl(origin), state, challenge);
	pending.set(state, { verifier, at: now });
	return { url, state };
}

export type SsoResult =
	| { ok: true; user: ImmichUser; credential: ApiKeyCredential; keyInfo: KeyInfo; immichSession: Credential }
	| { ok: false; reason: 'expired' | 'denied' | 'failed' | 'immichDown' };

/** The caller must log `immichSession` out (`endImmichSession`) once done with it. */
export async function finishSso(url: URL, cookieState: string | undefined): Promise<SsoResult> {
	const state = url.searchParams.get('state') ?? '';
	const attempt = state && state === cookieState ? pending.get(state) : undefined;
	if (state) pending.delete(state);
	if (!attempt || Date.now() - attempt.at > TTL_MS) return { ok: false, reason: 'expired' };
	if (url.searchParams.has('error')) return { ok: false, reason: 'denied' };

	let signIn;
	try {
		signIn = await oauthCallback(url.href, state, attempt.verifier);
	} catch (e) {
		return { ok: false, reason: e instanceof ImmichError && e.code === 'immich_unreachable' ? 'immichDown' : 'failed' };
	}
	if (!signIn) return { ok: false, reason: 'failed' };

	const immichSession: Credential = { kind: 'session', token: signIn.token };
	try {
		const key = await createApiKey(immichSession, AGENT_KEY_NAME, AGENT_KEY_PERMISSIONS);
		return {
			ok: true,
			user: signIn.user,
			credential: { kind: 'apiKey', key: key.secret, fullAccess: false, canUpdate: true, canDelete: true },
			keyInfo: { id: key.id, name: AGENT_KEY_NAME, madeByAgent: true },
			immichSession
		};
	} catch {
		await logout(immichSession);
		return { ok: false, reason: 'failed' };
	}
}

/** The Immich sign-in from SSO has done its job: end it, so the agent never holds one. */
export const endImmichSession = (immichSession: Credential) => logout(immichSession);

import { fail, isRedirect, redirect, type RequestEvent } from '@sveltejs/kit';
import { authEnabled, noteFailure, rememberPerson, startSession, tooManyAttempts } from '#lib/server/auth.ts';
import { formText } from '#lib/server/form.ts';
import { ImmichError, SIGN_IN_KEY_PERMISSIONS, checkApiKey, serverInfo, whoAmI } from '#lib/server/immich.ts';
import { immichPublicUrl } from '#lib/server/public-url.ts';
import { ssoCallbackUrl } from '#lib/server/sso.ts';
import type { ApiKeyCredential } from '#lib/server/state.ts';
import type { Actions, PageServerLoad } from './$types';

/** Immich's default label says "Login with OAuth"; say it our way unless the admin named it. */
function ssoLabel(text: string) {
	return !text.trim() || /^log\s*in with oauth$/i.test(text.trim()) ? 'Sign in with SSO' : text.trim();
}

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!authEnabled() || locals.signedIn) redirect(303, '/');
	const info = await serverInfo();
	return {
		sso: info?.oauth ? { label: ssoLabel(info.oauthButtonText) } : null,
		/** For Immich admins setting it up: the address the provider must allow. */
		ssoCallbackUrl: ssoCallbackUrl(url.origin),
		immichUrl: immichPublicUrl(info),
		immichReachable: info !== null
	};
};

export const actions: Actions = {
	apiKey: async (event) => {
		try {
			return await signInWithKey(event);
		} catch (e) {
			if (isRedirect(e)) throw e;
			// Say what broke in the logs (never the key), and something useful on the page.
			console.error('[shrim] Sign-in with an API key failed:', e);
			return fail(500, { keyError: 'unexpected', missing: [] as string[] });
		}
	}
};

async function signInWithKey({ request, cookies, url, getClientAddress }: RequestEvent) {
	const key = formText(await request.formData(), 'apiKey')
		.trim()
		.slice(0, 512);
	const ip = getClientAddress();
	const failure = (status: number, keyError: string, missing: string[] = []) => fail(status, { keyError, missing });
	if (!key) return failure(400, 'empty');
	if (tooManyAttempts(ip)) return failure(429, 'tooMany');

	let check;
	try {
		check = await checkApiKey(key, SIGN_IN_KEY_PERMISSIONS);
	} catch {
		return failure(502, 'immichDown');
	}
	if (!check.ok) {
		if (check.reason === 'invalid') noteFailure(ip);
		return failure(400, check.reason, check.missing);
	}
	const credential: ApiKeyCredential = {
		kind: 'apiKey',
		key,
		fullAccess: check.fullAccess,
		canUpdate: check.canUpdate,
		canDelete: check.canDelete
	};
	let user;
	try {
		user = await whoAmI(credential);
	} catch (e) {
		return failure(502, e instanceof ImmichError && e.code === 'immich_unreachable' ? 'immichDown' : 'invalid');
	}
	await rememberPerson(user, 'apiKey', credential, { id: check.id, name: check.name, madeByAgent: false });
	startSession(cookies, url.protocol === 'https:', user.id);
	redirect(303, '/');
}

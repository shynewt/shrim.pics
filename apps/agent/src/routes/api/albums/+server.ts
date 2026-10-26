import { authEnabled, forgetCredential } from '#lib/server/auth.ts';
import { ImmichError, ImmichSignedOut, listAlbums } from '#lib/server/immich.ts';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	const { credential, id } = locals.user;
	if (!credential) return Response.json({ error: 'no_key' }, { status: 400 });
	try {
		return Response.json(await listAlbums(credential, id || undefined));
	} catch (e) {
		if (e instanceof ImmichSignedOut && authEnabled()) {
			forgetCredential(credential);
			return Response.json({ error: 'signed_out' }, { status: 401 });
		}
		const code = e instanceof ImmichError ? e.code : 'immich_unreachable';
		return Response.json({ error: code }, { status: 502 });
	}
};

import { parseImmichLink } from '@shrim/protocol';
import { ImmichError, sharedLink } from '#lib/server/immich.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { url } = (await request.json().catch(() => ({}))) as { url?: string };
	const ref = parseImmichLink(url ?? '');
	if (!ref) return Response.json({ error: 'format' }, { status: 400 });
	try {
		const link = await sharedLink(ref);
		return Response.json({
			albumName: link.album?.albumName ?? null,
			type: link.type,
			count: link.album?.assetCount ?? link.assets.length,
			allowUpload: link.allowUpload,
			allowDownload: link.allowDownload,
			showMetadata: link.showMetadata,
			password: !!link.password
		});
	} catch (e) {
		const code = e instanceof ImmichError ? e.code : 'immich_unreachable';
		const error =
			code === 'not_allowed' ? 'password' : code === 'link_gone' || code === 'not_found' ? 'notFound' : 'immichDown';
		return Response.json({ error }, { status: 400 });
	}
};

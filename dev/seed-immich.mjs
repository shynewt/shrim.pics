// Seeds a local Immich with an admin, an album of sample photos and shared links.
// Usage: node dev/seed-immich.mjs <dir-with-photos> [immich-url]
// Prints JSON with the created shared links. Safe to run more than once.
import { readdir } from 'node:fs/promises';
import { openAsBlob } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
const IMMICH = (process.argv[3] ?? process.env.IMMICH_URL ?? 'http://localhost:2283').replace(/\/$/, '');
const ADMIN = { email: 'admin@shrim.test', password: 'shrim-dev-password', name: 'Dev Admin' };
const ALBUM = 'Lisbon, August';

if (!dir) {
	console.error('Usage: node dev/seed-immich.mjs <dir-with-photos> [immich-url]');
	process.exit(1);
}

/**
 * @param {string} path
 * @param {{ token?: string, method?: string, body?: unknown, form?: FormData }} [options]
 * @returns {Promise<any>} Immich's JSON. A dev script, so its shape is trusted.
 */
async function api(path, { token, method = 'GET', body, form } = {}) {
	/** @type {Record<string, string>} */
	const headers = {};
	if (token) headers.authorization = `Bearer ${token}`;
	if (body) headers['content-type'] = 'application/json';
	const res = await fetch(`${IMMICH}/api${path}`, {
		method,
		headers,
		body: form ?? (body ? JSON.stringify(body) : undefined)
	});
	const text = await res.text();
	const data = text ? JSON.parse(text) : null;
	if (!res.ok) throw Object.assign(new Error(`${method} ${path} → ${res.status} ${text}`), { status: res.status });
	return data;
}

async function main() {
	try {
		await api('/auth/admin-sign-up', { method: 'POST', body: ADMIN });
	} catch (e) {
		if (/** @type {{ status?: number }} */ (e).status !== 400) throw e; // already signed up
	}
	const { accessToken: token } = await api('/auth/login', {
		method: 'POST',
		body: { email: ADMIN.email, password: ADMIN.password }
	});

	const albums = await api('/albums', { token });
	let album = albums.find((/** @type {{ albumName: string }} */ a) => a.albumName === ALBUM);
	if (!album) {
		const files = (await readdir(dir)).filter((f) => /^(p\d+\.jpe?g|v\d+\.mp4)$/i.test(f)).sort();
		const ids = [];
		for (const f of files) {
			const form = new FormData();
			const type = f.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
			form.set('assetData', await openAsBlob(join(dir, f), { type }), f);
			form.set('deviceAssetId', `seed-${f}`);
			form.set('deviceId', 'shrim-seed');
			form.set('fileCreatedAt', new Date().toISOString());
			form.set('fileModifiedAt', new Date().toISOString());
			form.set('filename', f);
			const r = await api('/assets', { token, method: 'POST', form });
			ids.push(r.id);
		}
		album = await api('/albums', {
			token,
			method: 'POST',
			body: { albumName: ALBUM, description: 'A long weekend of tiles, trams and pastéis.', assetIds: ids }
		});
		// Give metadata extraction and thumbnail jobs a moment.
		await new Promise((r) => setTimeout(r, 4000));
	}

	// Make sure the album has a video, even if it was seeded before videos were added.
	const video = (await readdir(dir)).find((f) => /^v\d+\.mp4$/i.test(f));
	if (video) {
		const buckets = await api(`/timeline/buckets?albumId=${album.id}`, { token });
		let hasVideo = false;
		for (const { timeBucket } of buckets) {
			const bucket = await api(`/timeline/bucket?albumId=${album.id}&timeBucket=${timeBucket}`, { token });
			if (bucket.isImage.some((/** @type {boolean} */ isImage) => !isImage)) hasVideo = true;
		}
		if (!hasVideo) {
			const form = new FormData();
			form.set('assetData', await openAsBlob(join(dir, video), { type: 'video/mp4' }), video);
			form.set('fileCreatedAt', '2026-08-12T18:00:00.000Z');
			form.set('fileModifiedAt', '2026-08-12T18:00:00.000Z');
			form.set('filename', video);
			const r = await api('/assets', { token, method: 'POST', form });
			await api(`/albums/${album.id}/assets`, { token, method: 'PUT', body: { ids: [r.id] } });
			// Let Immich generate the thumbnail and read the duration.
			await new Promise((r) => setTimeout(r, 5000));
		}
	}

	const links = await api(`/shared-links?albumId=${album.id}`, { token });
	const want = [
		{ description: 'view', allowUpload: false, allowDownload: true, showMetadata: true },
		{ description: 'upload', allowUpload: true, allowDownload: true, showMetadata: true }
	];
	/** @type {Record<string, string>} */
	const out = {};
	for (const w of want) {
		let link = links.find((/** @type {{ description: string }} */ l) => l.description === w.description);
		if (!link) {
			link = await api('/shared-links', {
				token,
				method: 'POST',
				body: { type: 'ALBUM', albumId: album.id, ...w }
			});
		}
		out[w.description] = `${IMMICH}/share/${link.key}`;
	}

	// An "individual assets" link too, to cover the second link type.
	let single = links.find((/** @type {{ description: string }} */ l) => l.description === 'single');
	if (!single) {
		const bucket = await api(`/timeline/buckets?albumId=${album.id}`, { token });
		const first = await api(`/timeline/bucket?albumId=${album.id}&timeBucket=${bucket[0].timeBucket}`, { token });
		single = await api('/shared-links', {
			token,
			method: 'POST',
			body: {
				type: 'INDIVIDUAL',
				assetIds: first.id.slice(0, 3),
				description: 'single',
				allowDownload: false,
				showMetadata: false
			}
		});
	}
	out.single = `${IMMICH}/share/${single.key}`;
	out.albumId = album.id;
	out.token = token;
	console.log(JSON.stringify(out, null, 2));
}

main().catch((/** @type {Error} */ e) => {
	console.error(e.message);
	process.exit(1);
});

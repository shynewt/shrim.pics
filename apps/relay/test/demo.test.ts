import {
	collect,
	decryptStream,
	encryptToBytes,
	fromBase64Url,
	fromUtf8,
	generateShareKey,
	importShareKey,
	type AssetInfo,
	type Manifest,
	type RequestHead,
	type ResponseHead
} from '@shrim/protocol';
import { describe, expect, it } from 'vitest';
import { DEMO_KEY, DEMO_SHARE_ID, answerDemo, demoPath, isDemoShare } from '../src/lib/server/demo/index.ts';

const key = await importShareKey(fromBase64Url(DEMO_KEY));

/** What the viewer does: encrypt a request with the link's key, send it, decrypt the answer. */
async function ask(head: RequestHead, base = key) {
	const { salt, bytes } = await encryptToBytes(base, { kind: 'req', shareId: DEMO_SHARE_ID }, head);
	const stream = await answerDemo(bytes);
	if (!stream) return null;
	const raw = await collect(stream);
	const res = await decryptStream<ResponseHead>(
		key,
		{ kind: 'res', shareId: DEMO_SHARE_ID, bind: salt },
		new Blob([raw]).stream()
	);
	return { raw, head: res.head, body: await collect(res.body) };
}

const ascii = (b: Uint8Array, from: number, to: number) => fromUtf8(b.subarray(from, to));

describe('example album', () => {
	it('is on by default, at the link shown on the landing page', () => {
		expect(isDemoShare(DEMO_SHARE_ID)).toBe(true);
		expect(isDemoShare('Xk3f9QaPz3')).toBe(false);
		expect(demoPath()).toBe(`/s/${DEMO_SHARE_ID}#${DEMO_KEY}`);
	});

	it('answers the manifest, encrypted', async () => {
		const r = (await ask({ op: 'manifest' }))!;
		expect(ascii(r.raw, 0, 4)).toBe('SHR1');
		expect(r.head.status).toBe(200);
		const m = JSON.parse(fromUtf8(r.body)) as Manifest;
		expect(m.title).toBe('Spring in Seville');
		expect(m.assets).toHaveLength(18);
		expect(m).toMatchObject({ allowUpload: true, allowDownload: true, showMetadata: true, expiresAt: null });
		for (const a of m.assets) {
			expect(a.thumbhash).toBeTruthy();
			expect(a.takenAt).toMatch(/^2026-04-1[678]T/);
			expect(a.ratio).toBeGreaterThan(0.5);
		}
	});

	it('sends thumbnails, previews and originals that decrypt to images', async () => {
		const m = JSON.parse(fromUtf8((await ask({ op: 'manifest' }))!.body)) as Manifest;
		const asset = m.assets[0].id;
		for (const head of [
			{ op: 'thumb', asset, size: 'thumbnail' },
			{ op: 'thumb', asset, size: 'preview' },
			{ op: 'original', asset }
		] satisfies RequestHead[]) {
			const r = (await ask(head))!;
			expect(ascii(r.raw, 0, 4)).toBe('SHR1');
			expect(fromUtf8(r.raw).includes('WEBP')).toBe(false);
			expect(r.head).toMatchObject({ status: 200, type: 'image/webp', size: r.body.length });
			expect(ascii(r.body, 0, 4) + ascii(r.body, 8, 12)).toBe('RIFFWEBP');
		}
		const thumb = (await ask({ op: 'thumb', asset, size: 'thumbnail' }))!;
		const preview = (await ask({ op: 'thumb', asset, size: 'preview' }))!;
		expect(thumb.body.length).toBeLessThan(preview.body.length);
		expect((await ask({ op: 'original', asset }))!.head.filename).toBe('plaza-de-espana.webp');

		const info = JSON.parse(fromUtf8((await ask({ op: 'info', asset: m.assets[1].id }))!.body)) as AssetInfo;
		expect(info).toMatchObject({ filename: 'giralda.webp', camera: 'SONY DSLR-A550', place: 'Seville, Spain' });
	});

	it('refuses uploads, and has nothing sharper and no videos', async () => {
		const begin = (await ask({ op: 'upload.begin', name: 'a.jpg', type: 'image/jpeg', size: 10, modified: 0 }))!;
		expect(begin.head).toEqual({ status: 403, error: 'not_allowed' });
		const asset = '00000000-0000-4000-8000-000000000000';
		expect((await ask({ op: 'thumb', asset, size: 'thumbnail' }))!.head.status).toBe(404);
		expect((await ask({ op: 'thumb', asset: '../album.json', size: 'thumbnail' }))!.head.status).toBe(400);
		const m = JSON.parse(fromUtf8((await ask({ op: 'manifest' }))!.body)) as Manifest;
		expect((await ask({ op: 'fullsize', asset: m.assets[0].id }))!.head.status).toBe(404);
	});

	it("ignores requests that don't decrypt with the demo key", async () => {
		expect(await ask({ op: 'manifest' }, await importShareKey(generateShareKey()))).toBeNull();
		expect(await answerDemo(new TextEncoder().encode('SHR1 not really'))).toBeNull();
	});
});

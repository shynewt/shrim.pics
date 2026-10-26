/**
 * The example album (SHRIM_DEMO, on by default): the relay answers it itself,
 * encrypted like an agent would. Needs only a relay, no Immich and no agent.
 *
 *   E2E_RELAY_URL=http://localhost:5873 pnpm exec playwright test e2e/demo.spec.ts
 */
import { expect, test } from '@playwright/test';

const RELAY = process.env.E2E_RELAY_URL ?? 'http://localhost:5273';

test('the landing page opens the example album, end to end encrypted', async ({ page }) => {
	const bodies: { status: number; body: Buffer }[] = [];
	await page.route('**/api/v1/s/**', async (route) => {
		const response = await route.fetch();
		const body = await response.body();
		bodies.push({ status: response.status(), body });
		await route.fulfill({ response, body });
	});

	await page.goto(RELAY);
	await expect(page.getByRole('link', { name: 'See what friends get' })).toHaveAttribute('href', /^\/s\/\w{10}#/);
	await page.getByRole('link', { name: 'See an example album' }).click();
	await expect(page).toHaveURL(/\/s\/\w{10}#[\w-]{43}$/);
	const link = page.url();

	await expect(page.getByRole('heading', { name: 'Spring in Seville' })).toBeVisible();
	await expect(page.getByText('18 photos')).toBeVisible();
	const tiles = page.getByRole('button', { name: /^Photo \d+ of 18/ });
	await expect(tiles).toHaveCount(18);
	await expect(tiles.first().locator('img.shown')).toBeVisible();

	// Lightbox: the preview, its details, a download.
	await tiles.nth(1).click();
	const box = page.getByRole('dialog', { name: 'Photo viewer' });
	await expect(box).toBeVisible();
	await expect(box.getByText('2 of 18')).toBeVisible();
	await expect(box.locator('img.full.shown')).toBeVisible();
	await page.keyboard.press('i');
	await expect(box.getByText('SONY DSLR-A550')).toBeVisible();
	await expect(box.getByText('Seville, Spain')).toBeVisible();
	const download = page.waitForEvent('download');
	await box.getByRole('button', { name: 'Download' }).click();
	expect((await download).suggestedFilename()).toBe('giralda.webp');
	await page.keyboard.press('Escape'); // details
	await page.keyboard.press('Escape'); // lightbox
	await expect(box).toBeHidden();
	expect(page.url()).toBe(link);

	// "Add photos" explains instead of uploading.
	await page.getByRole('button', { name: 'Add photos' }).first().click();
	const note = page.getByRole('dialog', { name: /Add photos to Spring in Seville/ });
	await expect(note.getByText('This is an example album, so uploads are off.', { exact: false })).toBeVisible();
	await expect(note.locator('input[type=file]')).toHaveCount(0);
	await note.getByRole('button', { name: 'Close' }).last().click();
	await expect(note).toBeHidden();

	// Not a real album: nothing to report.
	await expect(page.getByRole('link', { name: 'Report this album' })).toHaveCount(0);
	await expect(page.getByText('An example album of public domain photos.')).toBeVisible();

	// Everything that came through the relay was ciphertext.
	expect(bodies.length).toBeGreaterThanOrEqual(20);
	for (const { status, body } of bodies) {
		expect(status).toBe(200);
		expect(body.subarray(0, 4).toString()).toBe('SHR1');
		// No image headers. Long enough that random ciphertext won't contain them by chance.
		for (const magic of ['JFIF\0', 'Exif\0\0', 'WEBPVP8', '\x89PNG\r\n']) {
			expect(body.includes(Buffer.from(magic, 'latin1'))).toBe(false);
		}
	}
});

test('a request without the key gets nothing', async ({ request }) => {
	const res = await request.post(`${RELAY}/api/v1/s/Xk3f9QaPz2`, {
		data: Buffer.from('SHR1 but not encrypted with the key'),
		headers: { 'content-type': 'application/octet-stream' }
	});
	expect(res.status()).toBe(400);
	expect(await res.json()).toEqual({ error: 'bad_request' });
});

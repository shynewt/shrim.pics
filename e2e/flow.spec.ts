/**
 * The whole product, end to end, against a real Immich:
 * sign up → sign in to the agent with an Immich API key → connect it with a code → make links (paste and album list)
 * → view → lightbox, slideshow, download all → upload → broken links
 * → report → revoke → delete account.
 *
 * Needs: Immich on IMMICH_URL (dev/immich) and the sample album from
 * dev/make-samples.sh in SAMPLES_DIR. playwright.config.ts starts a throwaway
 * relay and agent unless E2E_RELAY_URL / E2E_AGENT_URL point elsewhere.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const RELAY = process.env.E2E_RELAY_URL ?? 'http://localhost:5273';
const AGENT = process.env.E2E_AGENT_URL ?? 'http://localhost:5274';
const IMMICH = process.env.IMMICH_URL ?? 'http://localhost:2283';
const SAMPLES = process.env.SAMPLES_DIR ?? '/tmp/shrim-samples';
const OUT = process.env.E2E_OUT_DIR ?? join(import.meta.dirname, '.out');
const SHOTS = join(OUT, 'screens');
const TMP = join(OUT, 'tmp'); // downloads and upload files, removed after the run
/** ImageMagick 7 is `magick`, 6 (Ubuntu) is `convert`. */
const MAGICK = (() => {
	try {
		execFileSync('magick', ['-version'], { stdio: 'ignore' });
		return 'magick';
	} catch {
		return 'convert';
	}
})();

interface Seed {
	view: string;
	upload: string;
	single: string;
	albumId: string;
	token: string;
}

let seed: Seed;
let shareLink = '';
const owner = { email: `owner-${Date.now()}@shrim.test`, password: 'a-long-enough-password' };
/** The seeded Immich admin's API key: signs in to the agent and connects it. */
let adminKey: { secret: string; apiKey: { id: string } };

/** Navigates and waits until the app has hydrated (no requests in flight). */
async function open(page: Page, url: string) {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
}

const shot = (page: Page, name: string) => page.screenshot({ path: join(SHOTS, `${name}.png`), fullPage: true });

/** Signs in to the agent as the seeded Immich admin (with their API key), unless this browser already is. */
async function signInAgent(page: Page) {
	await open(page, `${AGENT}/login`);
	if (!new URL(page.url()).pathname.startsWith('/login')) return;
	await page.getByLabel('Your Immich API key').fill(adminKey.secret);
	await page.getByRole('button', { name: 'Sign in with this key' }).click();
	await page.waitForURL(`${AGENT}/`);
	await page.waitForLoadState('networkidle');
}

async function immich(path: string, init: RequestInit = {}) {
	const res = await fetch(`${IMMICH}/api${path}`, {
		...init,
		headers: { authorization: `Bearer ${seed.token}`, 'content-type': 'application/json', ...init.headers }
	});
	return res.status === 204 ? null : (res.json() as Promise<unknown>);
}

const albumCount = async () => ((await immich(`/albums/${seed.albumId}`)) as { assetCount: number }).assetCount;
const albumLinks = async () => ((await immich(`/shared-links?albumId=${seed.albumId}`)) as unknown[]).length;

/** Leaves the agent disconnected, with none of the admin's links. Signs in as the Immich admin. */
async function resetAgent(page: Page) {
	await signInAgent(page);
	await open(page, AGENT);
	for (;;) {
		const share = page.getByRole('button', { name: 'Share', exact: true }).first();
		const remove = page.getByRole('button', { name: 'Remove', exact: true }).first();
		if (await share.isVisible()) {
			await share.click();
			await page.getByRole('button', { name: 'Revoke link' }).click();
		} else if (await remove.isVisible()) {
			await remove.click();
		} else break;
		await page
			.getByRole('dialog')
			.getByRole('button', { name: /^(Revoke|Remove) link$/ })
			.click();
		await expect(page.getByRole('dialog')).toBeHidden();
	}
	await open(page, `${AGENT}/settings`);
	if (await page.getByRole('button', { name: 'Disconnect' }).isVisible()) {
		await page.getByRole('button', { name: 'Disconnect' }).click();
		await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
		await expect(page.getByRole('dialog')).toBeHidden();
	}
}

/** Makes a link by pasting an Immich link, from the first-run step or the dialog. */
async function createByPasting(page: Page, immichLink: string, name?: string) {
	if (await page.getByRole('button', { name: 'New share link' }).first().isVisible()) {
		await page.getByRole('button', { name: 'New share link' }).first().click();
	}
	// Choose "paste" (first run: a card; the dialog: a button), retrying until the field shows:
	// a click that lands just before the page has hydrated can be lost.
	const paste = page.getByText('Paste an Immich link', { exact: true });
	const orPaste = page.getByRole('button', { name: 'Paste a link' });
	await expect(async () => {
		if (await paste.isVisible()) await paste.click();
		if (await orPaste.isVisible()) await orPaste.click();
		await expect(page.getByLabel('Immich share link')).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 15_000 });

	await page.getByLabel('Immich share link').fill(immichLink);
	await page.getByLabel('Name').click();
	await expect(page.getByRole('list', { name: 'What friends can do' })).toBeVisible();
	if (name) await page.getByLabel('Name').fill(name);
	await shot(page, '04e-agent-paste');
	await page.getByRole('button', { name: 'Create link' }).click();
	await expect(page.locator('.ready .field')).toBeVisible({ timeout: 20_000 });
	return (await page.locator('.ready .field').getAttribute('title'))!;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	mkdirSync(SHOTS, { recursive: true });
	mkdirSync(TMP, { recursive: true });
	const out = execFileSync('node', [join(import.meta.dirname, '..', 'dev', 'seed-immich.mjs'), SAMPLES, IMMICH], {
		encoding: 'utf8'
	});
	seed = JSON.parse(out) as Seed;
	adminKey = (await immich('/api-keys', {
		method: 'POST',
		body: JSON.stringify({
			name: 'shrim agent e2e (flow)',
			permissions: ['user.read', 'album.read', 'sharedLink.create', 'sharedLink.update', 'sharedLink.delete']
		})
	})) as typeof adminKey;
});

test.afterAll(async () => {
	rmSync(TMP, { recursive: true, force: true });
	if (adminKey) await immich(`/api-keys/${adminKey.apiKey.id}`, { method: 'DELETE' }).catch(() => {});
});

test('landing page explains the product', async ({ page }) => {
	await open(page, RELAY);
	await expect(page.getByRole('heading', { level: 1 })).toHaveText(
		'Share Immich albums with a link. Keep your server to yourself.'
	);
	await expect(page.getByRole('heading', { name: 'Why people use it' })).toBeVisible();
	await page.getByText('Do my friends need an account or an app?').click();
	await expect(page.getByText('They open the link in any recent browser')).toBeVisible();
	await shot(page, '01-landing');
});

test('owner signs up, connects the agent with a code, and makes a link', async ({ page, context }) => {
	await resetAgent(page);

	// Relay: sign up, see the setup checklist, subscribe (test mode)
	await open(page, `${RELAY}/signup`);
	await page.getByLabel('Email').fill(owner.email);
	await page.getByLabel('Password', { exact: true }).fill('short');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByText('Use at least 10 characters.')).toBeVisible();
	await page.getByLabel('Password', { exact: true }).fill(owner.password);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(page.getByRole('heading', { name: 'Get set up' })).toBeVisible();
	await page.getByRole('button', { name: /Activate plan/ }).click();
	await expect(page.getByText('Plan active').first()).toBeVisible();
	await shot(page, '02-dashboard-setup');

	// Agent: it shows a code; approve it on the relay
	const agent = await context.newPage();
	await open(agent, AGENT);
	const codeBox = agent.locator('.code-display');
	await expect(codeBox).toBeVisible({ timeout: 20_000 });
	const code = (await codeBox.textContent())!.trim();
	expect(code).toMatch(/^[2-9CFGHJMPQRVWX]{4}-[2-9CFGHJMPQRVWX]{4}$/);
	await expect(agent.getByRole('button', { name: 'Copy code' })).toBeVisible();
	await shot(agent, '03-agent-code');
	await agent.emulateMedia({ colorScheme: 'dark' });
	await agent.waitForTimeout(400);
	await shot(agent, '03b-agent-code-dark');
	await agent.emulateMedia({ colorScheme: 'light' });

	const [approve] = await Promise.all([
		context.waitForEvent('page'),
		agent.getByRole('link', { name: /Approve on/ }).click()
	]);
	await approve.waitForLoadState('networkidle');
	await expect(approve.locator('.code-display')).toHaveText(code);
	// At home both share one public IP; in containers the addresses differ. Either way it says which.
	await expect(approve.getByText(/^From (your|a different) network$/)).toBeVisible();
	await shot(approve, '04-relay-confirm');
	await approve.emulateMedia({ colorScheme: 'dark' });
	await approve.waitForTimeout(400);
	await shot(approve, '04b-relay-confirm-dark');
	await approve.setViewportSize({ width: 390, height: 844 });
	await approve.waitForTimeout(200);
	await shot(approve, '04c-relay-confirm-phone');
	await approve.setViewportSize({ width: 1280, height: 860 });
	await approve.getByRole('button', { name: 'Connect agent' }).click();
	await expect(approve.getByRole('heading', { name: 'Agent connected' })).toBeVisible();
	await shot(approve, '04d-relay-connected-dark');
	await approve.close();

	// The agent carries on by itself; make the first link by pasting an Immich link
	await expect(agent.getByText(owner.email).first()).toBeVisible({ timeout: 20_000 });
	shareLink = await createByPasting(agent, seed.upload, 'Lisbon trip');
	expect(shareLink).toMatch(/\/s\/[A-Za-z0-9]{10}#[A-Za-z0-9_-]{43}$/);
	await shot(agent, '05-agent-link-ready');
	const goToLinks = agent.getByRole('button', { name: 'Go to my links' });
	if (await goToLinks.isVisible()) await goToLinks.click();
	else await agent.getByRole('button', { name: 'Done' }).click();
	await expect(agent.locator('li.share', { hasText: 'Lisbon trip' })).toBeVisible();
	await expect(agent.getByText('Friends can add photos').first()).toBeVisible();
	await shot(agent, '06-agent-list');

	// Relay dashboard lists the link by id only
	await open(page, `${RELAY}/dashboard`);
	const id = shareLink.match(/\/s\/([A-Za-z0-9]{10})#/)![1];
	await expect(page.getByText(id)).toBeVisible();
	await expect(page.getByText('Lisbon')).toHaveCount(0);
	await shot(page, '07-dashboard');
});

test('signed in with Immich, the agent lists your albums and makes the Immich link as you', async ({ page }) => {
	const before = await albumLinks();

	await signInAgent(page);
	await open(page, AGENT);
	await page.getByRole('button', { name: 'New share link' }).first().click();
	await page.getByPlaceholder('Search albums').fill('lisb');
	await page.getByRole('button', { name: /Lisbon, August/ }).click();
	await page.getByLabel(/Friends can download photos/).uncheck();
	await page.getByLabel('Name').fill('Lisbon, view only');
	await shot(page, '08-agent-picker-options');
	await page.getByRole('button', { name: 'Create link' }).click();
	await expect(page.getByRole('heading', { name: 'Your link is ready' })).toBeVisible({ timeout: 20_000 });
	const link = (await page.locator('.ready .field').getAttribute('title'))!;
	await shot(page, '08b-agent-link-ready');
	await page.emulateMedia({ colorScheme: 'dark' });
	await page.waitForTimeout(400); // let colour transitions finish
	await shot(page, '08c-agent-link-ready-dark');
	await page.emulateMedia({ colorScheme: 'light' });
	await page.setViewportSize({ width: 390, height: 844 });
	await page.waitForTimeout(400);
	await shot(page, '08d-agent-link-ready-phone');
	await page.setViewportSize({ width: 1280, height: 860 });
	await page.getByRole('button', { name: 'Done' }).click();
	expect(await albumLinks()).toBe(before + 1);

	// The link works, without downloads
	await open(page, link);
	await expect(page.getByRole('heading', { level: 1, name: 'Lisbon, August' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Download all' })).toHaveCount(0);

	// Edit it: rename, let friends add photos, never expire. The Immich link changes too.
	await open(page, AGENT);
	let row = page.locator('li.share', { hasText: 'Lisbon, view only' });
	await row.getByRole('button', { name: 'Edit link' }).click();
	const edit = page.getByRole('dialog', { name: 'Edit link' });
	await edit.getByLabel('Name').fill('Lisbon for family');
	await edit.getByLabel(/Friends can add photos/).check();
	await edit.getByText('Never', { exact: true }).click();
	await shot(page, '09-agent-edit');
	await edit.getByRole('button', { name: 'Save' }).click();
	await expect(page.getByText('Link updated')).toBeVisible();
	row = page.locator('li.share', { hasText: 'Lisbon for family' });
	await expect(row.getByText('Friends can add photos')).toBeVisible();
	await expect(row.getByText('No expiry')).toBeVisible();
	const links = (await immich(`/shared-links?albumId=${seed.albumId}`)) as Array<{
		description: string;
		allowUpload: boolean;
	}>;
	expect(links.find((l) => l.description === 'Made by the shrim.pics agent')?.allowUpload).toBe(true);

	// Remove it from the Edit dialog: the Immich link the agent made goes too.
	await row.getByRole('button', { name: 'Edit link' }).click();
	await page.getByRole('button', { name: 'Remove link' }).click();
	await expect(page.getByText('This also removes the link in Immich.')).toBeVisible();
	await page.getByRole('dialog').getByRole('button', { name: 'Revoke link' }).click();
	await expect(page.getByText('Link revoked')).toBeVisible();
	await expect(page.locator('li.share', { hasText: 'Lisbon for family' })).toHaveCount(0);
	await expect.poll(albumLinks).toBe(before);
});

test('a friend opens the link, browses, and the relay only sees ciphertext', async ({ page }) => {
	const relayBodies: Buffer[] = [];
	await page.route('**/api/v1/s/**', async (route) => {
		const res = await route.fetch();
		const body = await res.body();
		if (res.status() === 200) relayBodies.push(body);
		await route.fulfill({ response: res, body });
	});

	await open(page, shareLink);
	await expect(page.getByRole('heading', { level: 1, name: 'Lisbon, August' })).toBeVisible();
	await expect(page.getByText('A long weekend of tiles, trams and pastéis.')).toBeVisible();
	await expect(page.getByRole('heading', { level: 2, name: /Aug$/ }).first()).toBeVisible(); // date headers
	const tiles = page.getByRole('button', { name: /^(Photo|Video) \d+ of \d+/ });
	const count = await tiles.count();
	expect(count).toBeGreaterThanOrEqual(12);
	await page.waitForFunction(() => document.querySelectorAll('.tile img.shown').length >= 6);
	await shot(page, '10-viewer');

	// Nothing that went through the relay is readable.
	expect(relayBodies.length).toBeGreaterThanOrEqual(6);
	for (const body of relayBodies) {
		expect(body.subarray(0, 4).toString()).toBe('SHR1');
		expect(body.includes(Buffer.from('Lisbon'))).toBe(false);
		// No image headers. Long enough that random ciphertext won't contain them by chance.
		for (const magic of ['JFIF\0', 'Exif\0\0', 'WEBPVP8']) expect(body.includes(Buffer.from(magic))).toBe(false);
	}

	// Lightbox: open a seeded photo (they have camera data), details, next, close.
	const seeded = page.getByRole('button', { name: /^Photo \d+ of \d+, 1\d Aug 2026$/ }).first();
	const [, k, n] = (await seeded.getAttribute('aria-label'))!.match(/^Photo (\d+) of (\d+)/)!.map(Number);
	expect(n).toBe(count);
	await seeded.click();
	const box = page.getByRole('dialog', { name: 'Photo viewer' });
	await expect(box).toBeVisible();
	await expect(box.getByText(`${k} of ${n}`)).toBeVisible();
	await expect(box.getByText(/Aug 2026, \d\d:\d\d/)).toBeVisible();
	await expect(box.locator('img.full.shown')).toBeVisible();
	await page.keyboard.press('i');
	await expect(box.getByText('Fujifilm X100VI')).toBeVisible();
	await shot(page, '11-lightbox-details');
	await page.keyboard.press('ArrowRight');
	await expect(box.getByText(`${k + 1} of ${n}`)).toBeVisible();
	expect(page.url()).toBe(shareLink); // the key in the address bar is untouched
	await page.keyboard.press('Escape'); // closes details
	await page.keyboard.press('Escape'); // closes the lightbox
	await expect(box).toBeHidden();
	expect(page.url()).toBe(shareLink);

	// Back button closes the lightbox too.
	await tiles.nth(2).click();
	await expect(box).toBeVisible();
	await page.goBack();
	await expect(box).toBeHidden();
	expect(page.url()).toBe(shareLink);

	// Download gives the original file.
	await seeded.click();
	const download = page.waitForEvent('download');
	await box.getByRole('button', { name: 'Download' }).click();
	expect((await download).suggestedFilename()).toMatch(/^p\d+\.jpg$/);
	await page.keyboard.press('Escape');
});

test('the slideshow moves on by itself', async ({ page }) => {
	await open(page, shareLink);
	await page.getByRole('button', { name: 'Slideshow' }).click();
	const box = page.getByRole('dialog', { name: 'Photo viewer' });
	const counter = box.locator('.counter');
	await expect(counter).toHaveText(/\d+ of \d+/);
	const first = await counter.innerText();
	await expect(counter).not.toHaveText(first, { timeout: 15_000 });
	await page.keyboard.press('Escape'); // pause
	await page.keyboard.press('Escape'); // close
	await expect(box).toBeHidden();
});

test('download all saves a zip with every photo', async ({ page }) => {
	// Use the in-memory path: a native save dialog can't be driven here.
	await page.addInitScript(() => delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker);
	await open(page, shareLink);
	const items = await page.getByRole('button', { name: /^(Photo|Video) \d+ of \d+/ }).count();
	await page.getByRole('button', { name: 'Download all' }).click();
	const dialog = page.getByRole('dialog', { name: /Download/ });
	await expect(dialog.getByText(/as one zip file/)).toBeVisible();
	const download = page.waitForEvent('download', { timeout: 120_000 });
	await dialog.getByRole('button', { name: 'Download' }).click();
	const file = join(TMP, `album-${Date.now()}.zip`);
	await (await download).saveAs(file);
	await expect(dialog.getByText(/^Saved /)).toBeVisible();
	const listing = execFileSync('unzip', ['-Z1', file], { encoding: 'utf8' }).trim().split('\n');
	expect(listing.length).toBe(items);
	execFileSync('unzip', ['-tq', file]);
	await dialog.getByRole('button', { name: 'Done' }).click();
});

test('a friend adds photos and they land in the Immich album', async ({ page }) => {
	const before = await albumCount();
	await open(page, shareLink);
	await page.getByRole('button', { name: 'Add photos' }).first().click();
	const dialog = page.getByRole('dialog', { name: /Add photos to/ });
	await expect(dialog.getByText('Drop photos and videos here')).toBeVisible();

	// A fresh small image, and a big one (> 4 MiB) that goes up in several encrypted parts.
	const small = join(TMP, `upload-${Date.now()}.jpg`);
	execFileSync(MAGICK, ['-size', '900x600', `plasma:fractal`, '-seed', String(Date.now() % 100000), small]);
	const big = join(TMP, `big-${Date.now()}.jpg`);
	execFileSync(MAGICK, ['-size', '3200x2400', 'xc:', '+noise', 'Random', '-quality', '98', big]);
	await dialog.locator('input[type=file]').setInputFiles([small, big, join(import.meta.dirname, '..', 'README.md')]);
	await expect(dialog.getByText('Not a photo or video')).toBeVisible();
	await shot(page, '13-upload-list');
	await dialog.getByRole('button', { name: 'Upload 2 files' }).click();
	await expect(dialog.getByRole('heading', { name: '2 photos added' })).toBeVisible({ timeout: 60_000 });
	await shot(page, '14-upload-done');
	await dialog.getByRole('button', { name: 'Done' }).click();

	await expect.poll(albumCount, { timeout: 15_000 }).toBe(before + 2);
});

test('broken links explain themselves', async ({ page }) => {
	const [base] = shareLink.split('#');

	await open(page, base);
	await expect(page.getByRole('heading', { name: 'This link is incomplete' })).toBeVisible();
	await shot(page, '15-state-no-key');

	await open(page, `${base}#${'A'.repeat(43)}`);
	await expect(page.getByRole('heading', { name: "This link can't be opened" })).toBeVisible();

	await open(page, `${RELAY}/s/Zz00000000#${'A'.repeat(43)}`);
	await expect(page.getByRole('heading', { name: "This link doesn't work" })).toBeVisible();
});

test('someone reports an album from the viewer and the operator disables it', async ({ page, browser }) => {
	await open(page, shareLink);
	await page.getByRole('link', { name: 'Report this album' }).click();
	await expect(page.getByLabel('Link')).toHaveValue(shareLink); // prefilled, key included
	await page.getByLabel("What's wrong").selectOption('consent');
	await page.getByLabel(/Details/).fill('This is me, and I never agreed to this.');
	await page.getByRole('button', { name: 'Send report' }).click();
	await expect(page.getByRole('heading', { name: 'Thanks, we got your report' })).toBeVisible();

	// The operator (SHRIM_ADMIN_EMAILS) reviews it in a separate session.
	const ctx = await browser.newContext();
	const admin = await ctx.newPage();
	await open(admin, `${RELAY}/login`);
	await admin.getByLabel('Email').fill('admin@shrim.test');
	await admin.getByLabel('Password', { exact: true }).fill('operator-password');
	await admin.getByRole('button', { name: 'Sign in' }).click();
	const mismatch = admin.getByText("That email and password don't match");
	await Promise.race([admin.waitForURL(/\/dashboard$/), mismatch.waitFor()]);
	if (await mismatch.isVisible()) {
		await open(admin, `${RELAY}/signup`);
		await admin.getByLabel('Email').fill('admin@shrim.test');
		await admin.getByLabel('Password', { exact: true }).fill('operator-password');
		await admin.getByRole('button', { name: 'Create account' }).click();
	}
	await expect(admin).toHaveURL(/\/dashboard$/);
	await open(admin, `${RELAY}/admin`);
	const id = shareLink.match(/\/s\/([A-Za-z0-9]{10})#/)![1];
	const report = admin.locator('li', { hasText: id }).first();
	await expect(report.getByText('Shared without consent')).toBeVisible();
	await report.getByRole('button', { name: 'Disable link' }).click();
	await expect(admin.getByText('Link disabled').first()).toBeVisible();
	await ctx.close();

	await open(page, shareLink);
	await expect(page.getByRole('heading', { name: 'This link is no longer available' })).toBeVisible();
});

test('a link turned off by shrim.pics shows in the agent and can be removed', async ({ page }) => {
	await signInAgent(page);
	await open(page, AGENT);
	const row = page.locator('li.share', { hasText: 'Lisbon trip' }).first();
	await expect(row.getByText(/Turned off by/)).toBeVisible();
	await row.getByRole('button', { name: 'Remove' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Remove link' }).click();
	await expect(page.getByText('Link removed')).toBeVisible();
	await expect(page.locator('li.share', { hasText: 'Lisbon trip' })).toHaveCount(0);
});

test('the viewer works on a phone', async ({ browser }) => {
	const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
	const page = await ctx.newPage();
	await signInAgent(page);
	const link = await createByPasting(page, seed.view);
	await page.getByRole('button', { name: 'Done' }).click();

	await open(page, link);
	await expect(page.getByRole('heading', { level: 1, name: 'Lisbon, August' })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Add photos' })).toHaveCount(0);
	await page.waitForFunction(() => document.querySelectorAll('.tile img.shown').length >= 4);
	await shot(page, '18-viewer-mobile');
	await ctx.close();
});

test('disabling a link on the dashboard removes it from the agent', async ({ page, context }) => {
	await open(page, `${RELAY}/login`);
	await page.getByLabel('Email').fill(owner.email);
	await page.getByLabel('Password', { exact: true }).fill(owner.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	const live = page.locator('li.share', { has: page.getByRole('button', { name: 'Disable' }) }).first();
	const id = (await live.locator('.id').innerText()).trim();
	const emoji = (await live.locator('.easy-id').innerText()).trim();
	await shot(page, '19-dashboard');

	const agent = await context.newPage();
	await signInAgent(agent);
	await open(agent, AGENT);
	await expect(agent.locator('li.share .easy-id', { hasText: emoji })).toHaveCount(1); // same Easy ID in both

	await live.getByRole('button', { name: 'Disable' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Disable link' }).click();
	await expect(page.getByText('Link disabled')).toBeVisible();
	await expect(page.locator('li.share', { hasText: id }).getByText('Disabled')).toBeVisible();

	await open(agent, AGENT);
	await expect(agent.locator('li.share .easy-id', { hasText: emoji })).toHaveCount(0);
});

test('disconnecting from the agent disconnects it on the dashboard too', async ({ page, context }) => {
	await open(page, `${RELAY}/login`);
	await page.getByLabel('Email').fill(owner.email);
	await page.getByLabel('Password', { exact: true }).fill(owner.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await expect(page.getByText(/^Online, connected/)).toBeVisible();

	const agent = await context.newPage();
	await signInAgent(agent);
	await open(agent, `${AGENT}/settings`);
	await agent.getByRole('button', { name: 'Disconnect' }).click();
	await agent.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
	await expect(agent.getByText('Disconnected')).toBeVisible();

	// The relay forgot the token: not "offline", but not connected at all.
	await open(page, `${RELAY}/dashboard`);
	await expect(page.getByText('Not connected')).toBeVisible();
	await expect(page.getByText(/^No agent connected/)).toBeVisible();
	await expect(page.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
	await expect(page.getByRole('heading', { name: 'Connect your agent' })).toBeVisible();
	// The whole code fits in the field.
	const codeField = page.getByLabel('Code');
	await codeField.fill('ABCD-EFGH');
	expect(await codeField.evaluate((el: HTMLInputElement) => el.scrollWidth <= el.clientWidth)).toBe(true);
	await shot(page, '20-dashboard-no-agent');
	await page.setViewportSize({ width: 390, height: 844 });
	await page.waitForTimeout(300);
	await shot(page, '20b-dashboard-no-agent-phone');
});

test('an owner can delete their account', async ({ page }) => {
	await open(page, `${RELAY}/login`);
	await page.getByLabel('Email').fill(owner.email);
	await page.getByLabel('Password', { exact: true }).fill(owner.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
	await page.getByRole('button', { name: 'Delete…' }).click();
	await page.getByLabel('Your password').fill('wrong-password');
	await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click();
	await expect(page.getByText("That password isn't right.")).toBeVisible();
	await page.getByLabel('Your password').fill(owner.password);
	await page.getByRole('dialog').getByRole('button', { name: 'Delete account' }).click();
	await expect(page.getByText('Your account was deleted')).toBeVisible();
	await open(page, `${RELAY}/login`);
	await page.getByLabel('Email').fill(owner.email);
	await page.getByLabel('Password', { exact: true }).fill(owner.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	await expect(page.getByText("That email and password don't match")).toBeVisible();
});

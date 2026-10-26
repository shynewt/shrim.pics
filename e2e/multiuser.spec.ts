/**
 * Several people, one agent: everyone signs in with their own Immich account, with
 * a personal API key (or, when the dev sign-in provider runs, single sign-on).
 * The Immich admin connects the agent; a regular user sees only their own albums
 * and links; the admin sees everyone's and can revoke any. Sign out, a wrong key,
 * a key missing a permission, a deleted key, and SSO (dev/sso/up.mjs, else skipped).
 *
 * Needs: Immich on IMMICH_URL with the seeded admin (dev/seed-immich.mjs). Makes a
 * second Immich user with a small album of their own (reused on later runs), and
 * never touches the seeded "Lisbon, August" album or its links.
 */
import { execFileSync } from 'node:child_process';
import { openAsBlob } from 'node:fs';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const RELAY = process.env.E2E_RELAY_URL ?? 'http://localhost:5273';
const AGENT = process.env.E2E_AGENT_URL ?? 'http://localhost:5274';
const IMMICH = process.env.IMMICH_URL ?? 'http://localhost:2283';
const SAMPLES = process.env.SAMPLES_DIR ?? '/tmp/shrim-samples';
const OUT = process.env.E2E_OUT_DIR ?? join(import.meta.dirname, '.out');
const SHOTS = join(OUT, 'screens');

const ADMIN = { email: 'admin@shrim.test', password: 'shrim-dev-password', name: 'Dev Admin' };
const ROBIN = { email: 'robin@shrim.test', password: 'robin-dev-password', name: 'Robin Family' };
const ROBIN_ALBUM = 'Garden, spring';
/** The admin's, shared with Robin as a viewer: Robin sees it but can't share it. */
const SHARED_ALBUM = 'Family dinners';
const owner = { email: `household-${Date.now()}@shrim.test`, password: 'a-long-enough-password' };

interface Seed {
	view: string;
}
let seed: Seed;
let robinAlbumId = '';
const tokens: string[] = [];

async function api<T = unknown>(path: string, init: { token?: string; method?: string; body?: unknown } = {}) {
	const res = await fetch(`${IMMICH}/api${path}`, {
		method: init.method ?? 'GET',
		headers: {
			...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
			...(init.body ? { 'content-type': 'application/json' } : {})
		},
		body: init.body ? JSON.stringify(init.body) : undefined
	});
	const text = await res.text();
	if (!res.ok) throw Object.assign(new Error(`${path} → ${res.status} ${text}`), { status: res.status });
	return (text ? JSON.parse(text) : null) as T;
}

async function immichLogin(who: { email: string; password: string }) {
	const { accessToken } = await api<{ accessToken: string }>('/auth/login', {
		method: 'POST',
		body: { email: who.email, password: who.password }
	});
	tokens.push(accessToken);
	return accessToken;
}

/** Robin, with an album of their own, and an album of the admin's shared with them to look at. */
async function seedHousehold() {
	const admin = await immichLogin(ADMIN);
	try {
		await api('/admin/users', {
			token: admin,
			method: 'POST',
			body: { ...ROBIN, shouldChangePassword: false }
		});
	} catch (e) {
		if ((e as { status?: number }).status !== 400) throw e; // already there
	}
	const robin = await immichLogin(ROBIN);
	const robinId = (await api<{ id: string }>('/users/me', { token: robin })).id;

	const mine = await api<Array<{ id: string; albumName: string }>>('/albums', { token: robin });
	let album = mine.find((a) => a.albumName === ROBIN_ALBUM);
	if (!album) {
		const ids: string[] = [];
		for (const f of ['p3.jpg', 'p5.jpg', 'p7.jpg']) {
			const form = new FormData();
			form.set('assetData', await openAsBlob(join(SAMPLES, f), { type: 'image/jpeg' }), f);
			form.set('fileCreatedAt', '2026-04-12T10:00:00.000Z');
			form.set('fileModifiedAt', '2026-04-12T10:00:00.000Z');
			form.set('filename', f);
			const res = await fetch(`${IMMICH}/api/assets`, {
				method: 'POST',
				headers: { authorization: `Bearer ${robin}` },
				body: form
			});
			ids.push(((await res.json()) as { id: string }).id);
		}
		album = await api<{ id: string; albumName: string }>('/albums', {
			token: robin,
			method: 'POST',
			body: { albumName: ROBIN_ALBUM, assetIds: ids }
		});
	}
	robinAlbumId = album.id;

	const theirs = await api<Array<{ albumName: string }>>('/albums', { token: admin });
	if (!theirs.some((a) => a.albumName === SHARED_ALBUM)) {
		await api('/albums', {
			token: admin,
			method: 'POST',
			body: { albumName: SHARED_ALBUM, albumUsers: [{ userId: robinId, role: 'viewer' }] }
		});
	}
	return robin;
}

let robinToken = '';
const robinLinks = async () =>
	(await api<unknown[]>(`/shared-links?albumId=${robinAlbumId}`, { token: robinToken })).length;

async function open(page: Page, url: string) {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
}

/** Light and dark, desktop and phone. */
async function shots(page: Page, name: string) {
	for (const [suffix, w, h] of [
		['', 1280, 860],
		['-phone', 390, 844]
	] as const) {
		await page.setViewportSize({ width: w, height: h });
		for (const scheme of ['light', 'dark'] as const) {
			await page.emulateMedia({ colorScheme: scheme });
			await page.waitForTimeout(350); // let colour transitions finish
			await page.screenshot({ path: join(SHOTS, `mu-${name}${suffix}-${scheme}.png`), fullPage: true });
		}
	}
	await page.setViewportSize({ width: 1280, height: 860 });
	await page.emulateMedia({ colorScheme: 'light' });
}

async function signIn(page: Page, key: string) {
	await open(page, `${AGENT}/login`);
	await page.getByLabel('Your Immich API key').fill(key);
	await page.getByRole('button', { name: 'Sign in with this key' }).click();
	await page.waitForURL(`${AGENT}/`);
	await page.waitForLoadState('networkidle');
}

const PERMISSIONS = ['user.read', 'album.read', 'sharedLink.create', 'sharedLink.update', 'sharedLink.delete'];
const madeKeys: Array<{ id: string; token: string }> = [];

/** A key in someone's Immich account, deleted again after the run. */
async function makeKey(token: string, name: string, permissions = PERMISSIONS) {
	const k = await api<{ secret: string; apiKey: { id: string } }>('/api-keys', {
		token,
		method: 'POST',
		body: { name, permissions }
	});
	madeKeys.push({ id: k.apiKey.id, token });
	return k;
}

/** Whether Immich signs people in with the dev provider (node dev/sso/up.mjs). */
async function ssoAvailable() {
	try {
		const features = await api<{ oauth: boolean }>('/server/features');
		const cfg = await api<{ oauthButtonText: string }>('/server/config');
		return features.oauth && cfg.oauthButtonText === 'Sign in with Dex';
	} catch {
		return false;
	}
}

let adminKey = '';
let robinKey = '';
let sso = false;

/** Revokes this person's links (and removes dead ones), so every run starts clean. */
async function clearLinks(page: Page) {
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
}

/** From the first-run step or the dialog: pick an album, name the link, make it. */
async function linkFromAlbum(page: Page, album: string, name: string) {
	const create = page.getByRole('button', { name: 'New share link' }).first();
	if (await create.isVisible()) await create.click();
	await page.getByRole('button', { name: new RegExp(album) }).click();
	await page.getByLabel('Name').fill(name);
	await page.getByRole('button', { name: 'Create link' }).click();
	await expect(page.locator('.ready .field')).toBeVisible({ timeout: 20_000 });
	const goToLinks = page.getByRole('button', { name: 'Go to my links' });
	if (await goToLinks.isVisible()) await goToLinks.click();
	else await page.getByRole('button', { name: 'Done' }).click();
	await expect(page.locator('li.share', { hasText: name })).toBeVisible();
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	mkdirSync(SHOTS, { recursive: true });
	const out = execFileSync('node', [join(import.meta.dirname, '..', 'dev', 'seed-immich.mjs'), SAMPLES, IMMICH], {
		encoding: 'utf8'
	});
	seed = JSON.parse(out) as Seed;
	robinToken = await seedHousehold();
	const adminToken = await immichLogin(ADMIN);
	adminKey = (await makeKey(adminToken, 'shrim agent e2e (admin)')).secret;
	robinKey = (await makeKey(robinToken, 'shrim agent e2e (robin)')).secret;
	sso = await ssoAvailable();
});

test.afterAll(async () => {
	for (const k of madeKeys) await api(`/api-keys/${k.id}`, { token: k.token, method: 'DELETE' }).catch(() => {});
	// Keys the agent made at SSO sign-ins, too.
	const theirs = await api<Array<{ id: string; name: string }>>('/api-keys', { token: robinToken }).catch(() => []);
	for (const k of theirs.filter((k) => k.name === 'shrim.pics agent')) {
		await api(`/api-keys/${k.id}`, { token: robinToken, method: 'DELETE' }).catch(() => {});
	}
	for (const token of tokens) await api('/auth/logout', { token, method: 'POST' }).catch(() => {});
});

test('the sign-in page asks for an API key and checks it', async ({ page }) => {
	await open(page, AGENT);
	await expect(page).toHaveURL(`${AGENT}/login`);
	await expect(page.getByRole('heading', { name: 'Sign in with Immich' })).toBeVisible();
	await expect(page.getByLabel(/password/i)).toHaveCount(0); // never an Immich password
	await expect(page.getByRole('link', { name: 'Open API keys in Immich' })).toHaveAttribute(
		'href',
		`${IMMICH}/user-settings?isOpen=api-keys`
	);
	const list = page.getByRole('list', { name: 'Permissions to tick' });
	for (const p of PERMISSIONS) await expect(list.getByText(p, { exact: true })).toBeVisible();
	await expect(page.getByRole('link', { name: 'Sign in with Dex' })).toHaveCount(sso ? 1 : 0);
	await shots(page, sso ? '01-sign-in-sso' : '01-sign-in-key');

	await page.getByLabel('Your Immich API key').fill('not-a-key-at-all');
	await page.getByRole('button', { name: 'Sign in with this key' }).click();
	await expect(page.getByText("Immich didn't accept this key.")).toBeVisible();

	// A key without user.read: the agent says which permission to tick.
	const partial = await makeKey(robinToken, 'shrim agent e2e (partial)', ['album.read', 'sharedLink.create']);
	await page.getByLabel('Your Immich API key').fill(partial.secret);
	await page.getByRole('button', { name: 'Sign in with this key' }).click();
	await expect(page.getByText('This key is missing user.read.')).toBeVisible();
	await shots(page, sso ? '01b-sign-in-sso-missing' : '01b-sign-in-key-missing');
});

test('a regular user who signs in first is told to ask the admin to connect', async ({ page, browser }) => {
	// Start from a disconnected agent (the admin disconnects it if needed).
	const adminCtx = await browser.newContext();
	const admin = await adminCtx.newPage();
	await signIn(admin, adminKey);
	await open(admin, `${AGENT}/settings`);
	if (await admin.getByRole('button', { name: 'Disconnect' }).isVisible()) {
		await admin.getByRole('button', { name: 'Disconnect' }).click();
		await admin.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
		await expect(admin.getByRole('dialog')).toBeHidden();
	}

	await signIn(page, robinKey);
	const askAdmin = page.getByText(
		/Only an Immich admin can connect\s+this agent|Ask your Immich\s+admin to connect it/
	);
	await expect(askAdmin.first()).toBeVisible();
	await expect(page.locator('.code-display')).toHaveCount(0);
	await expect(page.getByRole('link', { name: /Approve on/ })).toHaveCount(0);
	await shots(page, '03-first-run-ask-admin');

	// The admin connects it: sign up on the relay, approve the agent's code.
	const relay = await adminCtx.newPage();
	await open(relay, `${RELAY}/signup`);
	await relay.getByLabel('Email').fill(owner.email);
	await relay.getByLabel('Password', { exact: true }).fill(owner.password);
	await relay.getByRole('button', { name: 'Create account' }).click();
	await expect(relay).toHaveURL(/\/dashboard$/);

	await open(admin, AGENT);
	await expect(admin.locator('.code-display')).toBeVisible({ timeout: 20_000 });
	if (await admin.getByRole('heading', { name: 'Set up sharing' }).isVisible())
		await shots(admin, '04-first-run-admin');
	const [approve] = await Promise.all([
		adminCtx.waitForEvent('page'),
		admin.getByRole('link', { name: /Approve on/ }).click()
	]);
	await approve.waitForLoadState('networkidle');
	await approve.getByRole('button', { name: 'Connect agent' }).click();
	await expect(approve.getByRole('heading', { name: 'Agent connected' })).toBeVisible();
	await expect(admin.getByText(owner.email).first()).toBeVisible({ timeout: 20_000 });

	// No plan yet, so links wouldn't open. Subscribing shows up in the agent within seconds.
	const planWarning = admin.getByText(/plan isn't active/).first();
	await expect(planWarning).toBeVisible();
	await open(relay, `${RELAY}/dashboard`);
	await relay.getByRole('button', { name: /Activate plan/ }).click();
	await expect(relay.getByText('Plan active').first()).toBeVisible();
	await expect(async () => {
		await open(admin, AGENT);
		await expect(admin.getByText(/plan isn't active/)).toHaveCount(0, { timeout: 1000 });
	}).toPass({ timeout: 30_000, intervals: [2000] });
	await adminCtx.close();

	// Robin's page moves on by itself, without showing which shrim.pics account it is.
	await expect(askAdmin).toHaveCount(0, { timeout: 20_000 });
	await expect(page.getByText(owner.email)).toHaveCount(0);
});

test('a regular user sees only their own albums and links, and no connection controls', async ({ page }) => {
	await signIn(page, robinKey);
	await clearLinks(page);
	const before = await robinLinks();
	if (await page.getByRole('heading', { name: 'Set up sharing' }).isVisible()) {
		await expect(page.getByText(`Signed in as ${ROBIN.name}.`)).toBeVisible();
		await shots(page, '05-first-run-pick');
	} else {
		await page.getByRole('button', { name: 'New share link' }).first().click();
	}
	await expect(page.getByRole('button', { name: new RegExp(ROBIN_ALBUM) })).toBeVisible();
	await expect(page.getByRole('button', { name: /Lisbon, August/ })).toHaveCount(0);
	// Shared with Robin as a viewer: listed, but Immich won't let them share it.
	const shared = page.getByRole('button', { name: new RegExp(SHARED_ALBUM) });
	await expect(shared).toBeDisabled();
	await expect(shared).toContainText(`Shared by ${ADMIN.name}`);
	if (await page.getByRole('dialog').isVisible()) await page.keyboard.press('Escape');

	await linkFromAlbum(page, ROBIN_ALBUM, 'Garden for Grandma');
	expect(await robinLinks()).toBe(before + 1); // made as Robin, in Robin's Immich
	await expect(page.locator('li.share .owner')).toHaveCount(0); // only their own: no owner names
	await expect(page.getByRole('radio', { name: 'Everyone' })).toHaveCount(0);

	await open(page, `${AGENT}/settings`);
	await expect(page.getByText(ROBIN.email)).toBeVisible();
	await expect(page.getByText('Immich admin', { exact: true })).toHaveCount(0);
	await expect(page.getByText('Only an Immich admin can change this connection.')).toBeVisible();
	await expect(page.getByRole('button', { name: 'Disconnect' })).toHaveCount(0);
	await expect(page.getByRole('link', { name: 'Connect' })).toHaveCount(0);
	await shots(page, '06-settings-user');
});

test('the admin sees everyone’s links, can filter them, and revoke any', async ({ page }) => {
	await signIn(page, adminKey);
	await clearLinks(page);
	const markSeen = page.getByRole('button', { name: 'Go to my links' });

	// The admin's picker: their albums, not Robin's.
	const create = page.getByRole('button', { name: 'New share link' }).first();
	if (await create.isVisible()) await create.click();
	await expect(page.getByRole('button', { name: /Lisbon, August/ })).toBeVisible();
	await expect(page.getByRole('button', { name: new RegExp(SHARED_ALBUM) })).toBeEnabled();
	await expect(page.getByRole('button', { name: new RegExp(ROBIN_ALBUM) })).toHaveCount(0);

	// Make one by pasting the seeded link (leaves the seeded album's links alone).
	const paste = page.getByText('Paste an Immich link', { exact: true });
	if (await paste.isVisible()) await paste.click();
	else await page.getByRole('button', { name: 'Paste a link' }).click();
	await page.getByLabel('Immich share link').fill(seed.view);
	await page.getByLabel('Name').click();
	await expect(page.getByRole('list', { name: 'What friends can do' })).toBeVisible();
	await page.getByLabel('Name').fill('Lisbon for the neighbours');
	await page.getByRole('button', { name: 'Create link' }).click();
	await expect(page.locator('.ready .field')).toBeVisible({ timeout: 20_000 });
	if (await markSeen.isVisible()) await markSeen.click();
	else await page.getByRole('button', { name: 'Done' }).click();

	const theirs = page.locator('li.share', { hasText: 'Garden for Grandma' });
	const mine = page.locator('li.share', { hasText: 'Lisbon for the neighbours' });
	await expect(theirs).toBeVisible();
	await expect(theirs.locator('.owner')).toContainText(ROBIN.name);
	await expect(mine.locator('.owner')).toContainText('You');
	// Someone else's link: no copying or sharing it, only revoking.
	await expect(theirs.getByRole('button', { name: 'Copy link' })).toHaveCount(0);
	await expect(theirs.getByRole('button', { name: 'Revoke' })).toBeVisible();
	await shots(page, '07-links-admin-everyone');

	await page.getByText('Mine', { exact: true }).click();
	await expect(theirs).toHaveCount(0);
	await expect(mine).toBeVisible();
	await page.getByText('Everyone', { exact: true }).click();
	await expect(theirs).toBeVisible();

	await open(page, `${AGENT}/settings`);
	await expect(page.getByText('Immich admin', { exact: true })).toBeVisible();
	await expect(page.getByRole('button', { name: 'Disconnect' })).toBeVisible();
	await shots(page, '08-settings-admin');

	// Revoke Robin's link: it goes in Immich too, as Robin.
	const before = await robinLinks();
	await open(page, AGENT);
	await theirs.getByRole('button', { name: 'Revoke' }).click();
	await expect(page.getByRole('dialog')).toContainText(`It's ${ROBIN.name}'s link.`);
	await page.getByRole('dialog').getByRole('button', { name: 'Revoke link' }).click();
	await expect(page.getByText('Link revoked')).toBeVisible();
	await expect(theirs).toHaveCount(0);
	await expect.poll(robinLinks).toBe(before - 1);

	await mine.getByRole('button', { name: 'Share', exact: true }).click();
	await page.getByRole('button', { name: 'Revoke link' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Revoke link' }).click();
	await expect(mine).toHaveCount(0);
});

test('signing out ends the session', async ({ page }) => {
	await signIn(page, robinKey);
	await open(page, `${AGENT}/settings`);
	await page.getByRole('button', { name: 'Sign out' }).click();
	await expect(page).toHaveURL(`${AGENT}/login`);
	await open(page, `${AGENT}/settings`);
	await expect(page).toHaveURL(`${AGENT}/login`);
	const res = await page.request.get(`${AGENT}/api/albums`);
	expect(res.status()).toBe(401);
});

test('a new key replaces the old one, and deleting it in Immich signs them out', async ({ page }) => {
	const fresh = await makeKey(robinToken, 'shrim agent e2e (robin, phone)');
	await signIn(page, fresh.secret);
	await expect(page.getByRole('link', { name: ROBIN.name })).toBeVisible();
	// The key they used before is still in Immich: the agent says so, by name.
	await expect(page.getByText('Your older key “shrim agent e2e (robin)” is still in Immich')).toBeVisible();
	await page.getByRole('button', { name: 'New share link' }).first().click();
	await expect(page.getByRole('button', { name: new RegExp(ROBIN_ALBUM) })).toBeVisible();
	await page.keyboard.press('Escape');

	await open(page, `${AGENT}/settings`);
	await expect(page.getByText('Signed in with your API key “shrim agent e2e (robin, phone)”')).toBeVisible();
	await expect(page.getByText(fresh.secret.slice(-4))).toBeVisible();
	await shots(page, '09-settings-user-key');
	await page.getByRole('button', { name: 'Dismiss' }).click();
	await expect(page.getByText('is still in Immich')).toHaveCount(0);

	// Deleted in Immich: signed out here at the next use.
	await api(`/api-keys/${fresh.apiKey.id}`, { token: robinToken, method: 'DELETE' });
	await open(page, AGENT);
	await page.getByRole('button', { name: 'New share link' }).first().click();
	await expect(page).toHaveURL(`${AGENT}/login?expired=1`);
	await expect(page.getByText('Immich no longer accepts the key you signed in with.')).toBeVisible();
});

test('single sign-on through Immich makes a narrow key and replaces it next time', async ({ browser }) => {
	test.skip(!sso, 'Start the dev sign-in provider first: node dev/sso/up.mjs');
	const agentKeys = async () =>
		(await api<Array<{ name: string; permissions: string[] }>>('/api-keys', { token: robinToken })).filter(
			(k) => k.name === 'shrim.pics agent'
		);
	const before = (await agentKeys()).length;
	let afterFirst = 0;

	for (const round of [1, 2]) {
		const ctx = await browser.newContext();
		const page = await ctx.newPage();
		await open(page, `${AGENT}/login`);
		await page.getByRole('link', { name: 'Sign in with Dex' }).click();
		// Dex's own sign-in page.
		await page.locator('input[name=login]').fill(ROBIN.email);
		await page.locator('input[name=password]').fill(ROBIN.password);
		await page.locator('button[type=submit]').click();
		await page.waitForURL(`${AGENT}/`);
		await expect(page.getByRole('link', { name: ROBIN.name })).toBeVisible();

		await open(page, `${AGENT}/settings`);
		await expect(page.getByText('Signed in with single sign-on.')).toBeVisible();
		if (round === 1) await shots(page, '10-settings-user-sso');
		await ctx.close();

		// One key the agent made, with exactly what it needs; the old one is gone.
		const keys = await agentKeys();
		if (round === 1) afterFirst = keys.length;
		expect(keys.length).toBe(round === 1 ? before + 1 : afterFirst);
		expect(keys.at(-1)!.permissions.sort()).toEqual([...PERMISSIONS].sort());
	}
});

test('the admin disconnects the agent again', async ({ page }) => {
	await signIn(page, adminKey);
	await open(page, `${AGENT}/settings`);
	await page.getByRole('button', { name: 'Disconnect' }).click();
	await page.getByRole('dialog').getByRole('button', { name: 'Disconnect' }).click();
	await expect(page.getByText('Disconnected')).toBeVisible();
});

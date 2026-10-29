/**
 * Sharing from Immich itself (SHRIM_AUTO_LINKS): a share link made in Immich gets a shrim.pics
 * link written at the start of its description, deleting it in Immich ends the shrim.pics link,
 * and someone who turns it off in the agent's settings gets no new ones.
 * Starts its own agent (the shared one has it off), connected with a setup token.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';

const RELAY = process.env.E2E_RELAY_URL ?? 'http://localhost:5273';
const IMMICH = process.env.IMMICH_URL ?? 'http://localhost:2283';
const ROOT = join(import.meta.dirname, '..');
const ADMIN = { email: 'admin@shrim.test', password: 'shrim-dev-password' };
const ALBUM = 'Lisbon, August';

let agent: ChildProcess | undefined;
let dir = '';
let token = '';
const cleanup: Array<() => Promise<unknown>> = [];

async function api<T = unknown>(path: string, init: { method?: string; body?: unknown } = {}) {
	const res = await fetch(`${IMMICH}/api${path}`, {
		method: init.method ?? 'GET',
		headers: {
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...(init.body ? { 'content-type': 'application/json' } : {})
		},
		body: init.body ? JSON.stringify(init.body) : undefined
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`${path} → ${res.status} ${text}`);
	return (text ? JSON.parse(text) : null) as T;
}

interface ImmichLink {
	id: string;
	description: string | null;
}

async function immichLink(albumId: string, description: string) {
	const link = await api<ImmichLink>('/shared-links', {
		method: 'POST',
		body: { type: 'ALBUM', albumId, description, allowDownload: true, showMetadata: true }
	});
	cleanup.push(() => api(`/shared-links/${link.id}`, { method: 'DELETE' }).catch(() => {}));
	return link;
}

const freePort = () =>
	new Promise<number>((resolve) => {
		const s = createServer().listen(0, () => {
			const { port } = s.address() as { port: number };
			s.close(() => resolve(port));
		});
	});

test.describe.configure({ mode: 'serial' });

test.afterAll(async () => {
	for (const undo of cleanup.reverse()) await undo();
	if (agent?.pid) process.kill(-agent.pid);
	if (dir) rmSync(dir, { recursive: true, force: true });
});

test('a link shared in Immich gets a shrim.pics link, and follows Immich', async ({ page, browser }) => {
	test.setTimeout(240_000);
	({ accessToken: token } = await api<{ accessToken: string }>('/auth/login', { method: 'POST', body: ADMIN }));
	const albums = await api<Array<{ id: string; albumName: string }>>('/albums');
	const albumId = albums.find((a) => a.albumName === ALBUM)!.id;
	const key = await api<{ secret: string; apiKey: { id: string } }>('/api-keys', {
		method: 'POST',
		body: {
			name: 'shrim agent e2e (automatic links)',
			permissions: ['user.read', 'album.read', 'sharedLink.create', 'sharedLink.update', 'sharedLink.read']
		}
	});
	cleanup.push(() => api(`/api-keys/${key.apiKey.id}`, { method: 'DELETE' }).catch(() => {}));

	// An account with a plan, and an agent connected to it by its setup token.
	await page.goto(`${RELAY}/signup`);
	await page.getByLabel('Email').fill(`auto-${Date.now()}@shrim.test`);
	await page.getByLabel('Password', { exact: true }).fill('a-long-enough-password');
	await page.getByRole('button', { name: 'Create account' }).click();
	await page.getByRole('button', { name: /Activate plan/ }).click();
	const snippet = page.locator('.code-block').first();
	await expect(snippet).toContainText('SHRIM_SETUP_TOKEN: shr_setup_');
	const setupToken = (await snippet.textContent())!.match(/SHRIM_SETUP_TOKEN: (shr_setup_[\w-]+)/)![1];

	dir = mkdtempSync(join(tmpdir(), 'shrim-auto-'));
	const port = await freePort();
	const AGENT = `http://localhost:${port}`;
	agent = spawn('pnpm', ['--filter', '@shrim/agent', 'exec', 'vite', 'dev', '--port', String(port), '--strictPort'], {
		cwd: ROOT,
		env: { ...process.env, DATA_DIR: dir, IMMICH_URL: IMMICH, SHRIM_RELAY_URL: RELAY, SHRIM_SETUP_TOKEN: setupToken },
		stdio: 'ignore',
		detached: true
	});
	await expect
		.poll(
			() =>
				fetch(`${AGENT}/login`).then(
					(r) => r.ok,
					() => false
				),
			{ timeout: 120_000 }
		)
		.toBe(true);
	await expect(page.getByText(/Agent connected on|^Online$/).first()).toBeVisible({ timeout: 60_000 });

	// Made before anyone signed in to the agent: left alone.
	const before = await immichLink(albumId, 'made before');
	const me = await (await browser.newContext()).newPage();
	await me.goto(`${AGENT}/login`);
	await me.getByLabel('Your Immich API key').fill(key.secret);
	await me.getByRole('button', { name: 'Sign in with this key' }).click();
	await me.waitForURL(`${AGENT}/`);

	const lookAgain = async (p: Page) => {
		await p.goto(AGENT);
		await p.waitForLoadState('networkidle');
	};
	const description = async (id: string) =>
		(await api<ImmichLink[]>('/shared-links')).find((l) => l.id === id)?.description ?? null;

	// Shared in Immich, the usual way: within moments its description leads with a shrim.pics link.
	const shared = await immichLink(albumId, 'for the neighbours');
	let written = '';
	await expect(async () => {
		await lookAgain(me);
		written = (await description(shared.id)) ?? '';
		expect(written).toMatch(new RegExp(`^${RELAY}/s/\\S+#\\S+\\nfor the neighbours$`));
	}).toPass({ timeout: 60_000, intervals: [2000] });
	const link = written.split('\n')[0];
	expect(await description(before.id)).toBe('made before');
	await expect(me.locator('li.share', { hasText: 'Shared from Immich' })).toHaveCount(1);

	const friend = await (await browser.newContext()).newPage();
	await friend.goto(link);
	await expect(friend.getByRole('heading', { level: 1, name: ALBUM })).toBeVisible({ timeout: 30_000 });

	// An expiry set in Immich carries over.
	const expires = new Date(Date.now() + 3 * 86_400_000);
	await api(`/shared-links/${shared.id}`, { method: 'PATCH', body: { expiresAt: expires.toISOString() } });
	const row = me.locator('li.share', { hasText: 'Shared from Immich' });
	await expect(async () => {
		await lookAgain(me);
		await expect(row).toContainText(/Expires \d/, { timeout: 1000 });
	}).toPass({ timeout: 60_000, intervals: [2000] });

	// Revoked in the agent: the Immich link stays, with its own description back.
	const second = await immichLink(albumId, 'for the cousins');
	await expect(async () => {
		await lookAgain(me);
		expect(await description(second.id)).toMatch(/\nfor the cousins$/);
	}).toPass({ timeout: 60_000, intervals: [2000] });
	await lookAgain(me);
	const secondRow = me.locator('li.share', { hasText: 'Shared from Immich' }).first();
	await expect(me.locator('li.share', { hasText: 'Shared from Immich' })).toHaveCount(2);
	await secondRow.getByRole('button', { name: 'Edit link' }).click();
	await me.getByRole('dialog').getByRole('button', { name: 'Remove link' }).click();
	await expect(me.getByText('The Immich link stays')).toBeVisible();
	await me.getByRole('dialog').getByRole('button', { name: 'Revoke link' }).click();
	await expect.poll(() => description(second.id), { timeout: 20_000 }).toBe('for the cousins');
	await lookAgain(me);
	expect(await description(second.id)).toBe('for the cousins');

	// Deleted in Immich: the shrim.pics link goes too.
	await api(`/shared-links/${shared.id}`, { method: 'DELETE' });
	await expect(async () => {
		await lookAgain(me);
		await expect(me.locator('li.share', { hasText: 'Shared from Immich' })).toHaveCount(0, { timeout: 1000 });
	}).toPass({ timeout: 60_000, intervals: [2000] });
	const later = await (await browser.newContext()).newPage();
	await later.goto(link);
	await later.waitForLoadState('networkidle');
	await expect(later.getByRole('heading', { level: 1, name: ALBUM })).toHaveCount(0, { timeout: 15_000 });

	// Turned off in settings: new Immich links stay as they are.
	await me.goto(`${AGENT}/settings`);
	await me.waitForLoadState('networkidle');
	await me.getByRole('switch', { name: 'Make links for what I share in Immich' }).click();
	await expect(me.getByText('Turned off')).toBeVisible();
	await me.reload();
	await expect(me.getByText('Off. Links you make in Immich stay as they are.')).toBeVisible();
	const afterOff = await immichLink(albumId, 'after turning it off');
	await lookAgain(me);
	await me.waitForTimeout(3000);
	await lookAgain(me);
	expect(await description(afterOff.id)).toBe('after turning it off');
});

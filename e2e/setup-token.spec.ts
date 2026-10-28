/**
 * The dashboard's compose snippet connects a new agent by itself: no code to type.
 * Starts its own agent on a free port with the snippet's SHRIM_SETUP_TOKEN.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const RELAY = process.env.E2E_RELAY_URL ?? 'http://localhost:5273';
const IMMICH = process.env.IMMICH_URL ?? 'http://localhost:2283';
const ROOT = join(import.meta.dirname, '..');

let agent: ChildProcess | undefined;
let dir = '';

const freePort = () =>
	new Promise<number>((resolve) => {
		const s = createServer().listen(0, () => {
			const { port } = s.address() as { port: number };
			s.close(() => resolve(port));
		});
	});

test.afterAll(() => {
	if (agent?.pid) process.kill(-agent.pid);
	if (dir) rmSync(dir, { recursive: true, force: true });
});

test('a new agent connects with the setup token from the dashboard', async ({ page }) => {
	test.setTimeout(180_000);
	await page.goto(`${RELAY}/signup`);
	await page.getByLabel('Email').fill(`setup-${Date.now()}@shrim.test`);
	await page.getByLabel('Password', { exact: true }).fill('a-long-enough-password');
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page.getByRole('heading', { name: 'Get set up' })).toBeVisible();

	const snippet = page.locator('.code-block').first();
	await expect(snippet).toContainText('SHRIM_SETUP_TOKEN: shr_setup_');
	const setupToken = (await snippet.textContent())!.match(/SHRIM_SETUP_TOKEN: (shr_setup_[\w-]+)/)![1];

	dir = mkdtempSync(join(tmpdir(), 'shrim-setup-'));
	const port = await freePort();
	agent = spawn('pnpm', ['--filter', '@shrim/agent', 'exec', 'vite', 'dev', '--port', String(port), '--strictPort'], {
		cwd: ROOT,
		env: { ...process.env, DATA_DIR: dir, IMMICH_URL: IMMICH, SHRIM_RELAY_URL: RELAY, SHRIM_SETUP_TOKEN: setupToken },
		stdio: 'ignore',
		detached: true
	});
	// vite starts the server (and its init hook) on the first request
	await expect
		.poll(
			() =>
				fetch(`http://localhost:${port}/login`).then(
					(r) => r.ok,
					() => false
				),
			{ timeout: 120_000 }
		)
		.toBe(true);

	await expect(page.getByText(/Agent connected on/)).toBeVisible({ timeout: 60_000 });

	// Single use: the same token can't connect a second agent.
	const again = await fetch(`${RELAY}/agent/v1/pair/setup`, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ setupToken })
	});
	expect(again.status).toBe(200);
	expect(await again.json()).toEqual({ status: 'invalid' });
});

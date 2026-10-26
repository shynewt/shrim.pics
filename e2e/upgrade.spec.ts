/**
 * An agent upgraded from before sign-in existed keeps its pairing and its links.
 * Starts its own agent on a free port with an old-format state.json (the shape agents
 * wrote before sign-in; values are fakes), then the Immich admin signs in with an API key
 * and finds the old link is theirs.
 */
import { spawn, type ChildProcess } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';

const RELAY = process.env.E2E_RELAY_URL ?? 'http://localhost:5273';
const IMMICH = process.env.IMMICH_URL ?? 'http://localhost:2283';
const ROOT = join(import.meta.dirname, '..');
const OLD = JSON.parse(readFileSync(join(import.meta.dirname, 'fixtures', 'agent-state-v0.json'), 'utf8')) as {
	agentToken: string;
	shares: Array<{ id: string; label: string }>;
};

let agent: ChildProcess | undefined;
let url = '';
let dir = '';
let token = '';
let key: { id: string; secret: string } | undefined;

async function api<T>(path: string, init: { method?: string; body?: unknown; token?: string } = {}) {
	const res = await fetch(`${IMMICH}/api${path}`, {
		method: init.method ?? 'GET',
		headers: {
			...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
			...(init.body ? { 'content-type': 'application/json' } : {})
		},
		body: init.body ? JSON.stringify(init.body) : undefined
	});
	if (!res.ok) throw new Error(`${path} → ${res.status}`);
	return (res.status === 204 ? null : await res.json()) as T;
}

const freePort = () =>
	new Promise<number>((resolve) => {
		const s = createServer().listen(0, () => {
			const { port } = s.address() as { port: number };
			s.close(() => resolve(port));
		});
	});

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	test.setTimeout(150_000);
	dir = mkdtempSync(join(tmpdir(), 'shrim-upgrade-'));
	writeFileSync(join(dir, 'state.json'), JSON.stringify({ ...OLD, relayUrl: RELAY }), { mode: 0o600 });
	const port = await freePort();
	url = `http://localhost:${port}`;
	agent = spawn('pnpm', ['--filter', '@shrim/agent', 'exec', 'vite', 'dev', '--port', String(port), '--strictPort'], {
		cwd: ROOT,
		env: { ...process.env, DATA_DIR: dir, IMMICH_URL: IMMICH, SHRIM_RELAY_URL: RELAY },
		stdio: 'ignore',
		detached: true
	});
	for (let i = 0; ; i++) {
		try {
			if ((await fetch(`${url}/login`)).ok) break;
		} catch {
			// starting
		}
		if (i > 240) throw new Error('The agent did not start');
		await new Promise((r) => setTimeout(r, 500));
	}

	({ accessToken: token } = await api<{ accessToken: string }>('/auth/login', {
		method: 'POST',
		body: { email: 'admin@shrim.test', password: 'shrim-dev-password' }
	}));
	const made = await api<{ secret: string; apiKey: { id: string } }>('/api-keys', {
		token,
		method: 'POST',
		body: {
			name: 'shrim agent e2e (upgrade)',
			permissions: ['user.read', 'album.read', 'sharedLink.create', 'sharedLink.update', 'sharedLink.delete']
		}
	});
	key = { id: made.apiKey.id, secret: made.secret };
});

test.afterAll(async () => {
	if (agent?.pid) process.kill(-agent.pid, 'SIGTERM');
	if (key) await api(`/api-keys/${key.id}`, { token, method: 'DELETE' }).catch(() => {});
	if (token) await api('/auth/logout', { token, method: 'POST' }).catch(() => {});
	if (dir) rmSync(dir, { recursive: true, force: true });
});

test('an agent with an old state file keeps its pairing and links, and the admin takes them on', async ({ page }) => {
	await page.goto(url);
	await expect(page).toHaveURL(`${url}/login`);
	await page.getByLabel('Your Immich API key').fill(key!.secret);
	await page.getByRole('button', { name: 'Sign in with this key' }).click();
	await page.waitForURL(`${url}/`);

	// No first-run steps (they were done before), and the old link is the admin's own.
	await expect(page.getByRole('heading', { name: 'Share links' })).toBeVisible();
	const row = page.locator('li.share', { hasText: OLD.shares[0].label });
	await expect(row).toBeVisible();
	await expect(row.getByRole('button', { name: 'Copy link' })).toBeVisible();

	const now = JSON.parse(readFileSync(join(dir, 'state.json'), 'utf8')) as {
		agentToken: string;
		relayUrl: string;
		shares: Array<{ id: string; ownerId?: string }>;
		people: Array<{ userId: string; credential: { kind: string } }>;
		sessions: Array<Record<string, unknown>>;
	};
	const me = await api<{ id: string }>('/users/me', { token });
	expect(now.agentToken).toBe(OLD.agentToken);
	expect(now.relayUrl).toBe(RELAY);
	expect(now.shares.map((s) => s.id)).toEqual(OLD.shares.map((s) => s.id));
	expect(now.shares[0].ownerId).toBe(me.id);
	expect(now.people.map((p) => [p.userId, p.credential.kind])).toEqual([[me.id, 'apiKey']]);
	expect(Object.keys(now.sessions[0]).sort()).toEqual(['createdAt', 'expiresAt', 'id', 'userId']);
});

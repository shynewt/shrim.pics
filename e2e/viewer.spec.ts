/**
 * The viewer's lightbox, against a real Immich: encrypted video streaming
 * (starts fast, seeks without downloading everything, relay sees only
 * ciphertext) and photo zoom (pinch, double tap, wheel, keys, sharper image).
 *
 * Seeds its own album ("shrim viewer e2e") with generated media, so it never
 * touches "Lisbon, August". Needs ffmpeg, locally or through podman/docker.
 *
 *   E2E_RELAY_URL=http://localhost:5573 E2E_AGENT_URL=http://localhost:5574 \
 *     pnpm exec playwright test e2e/viewer.spec.ts
 *
 * E2E_BROWSER=firefox (or webkit) runs it in another engine.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, openAsBlob, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type BrowserContext, type Page } from '@playwright/test';

const RELAY = process.env.E2E_RELAY_URL ?? 'http://localhost:5273';
const AGENT = process.env.E2E_AGENT_URL ?? 'http://localhost:5274';
const IMMICH = process.env.IMMICH_URL ?? 'http://localhost:2283';
const BROWSER = (process.env.E2E_BROWSER ?? 'chromium') as 'chromium' | 'firefox' | 'webkit';
const ADMIN = { email: 'admin@shrim.test', password: 'shrim-dev-password' };
const ALBUM = 'shrim viewer e2e';
const OUT = join(import.meta.dirname, '.out', 'viewer');
const MEDIA = join(OUT, 'media');
const SHOTS = join(OUT, 'screens');

test.use({ browserName: BROWSER });
test.describe.configure({ mode: 'serial' });

/** Generated once and reused: a long video, a short one, one with its index at the end, a big photo. */
const FILES = {
	'long.mp4': [
		...['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=120'],
		...['-f', 'lavfi', '-i', 'sine=frequency=440:duration=120'],
		...['-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '3M', '-maxrate', '3M', '-bufsize', '6M', '-g', '60'],
		...['-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart']
	],
	'short.mp4': [
		...['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=5'],
		...['-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '3M', '-pix_fmt', 'yuv420p', '-movflags', '+faststart']
	],
	// No faststart: the player has to fetch the end of the file before it can start.
	'tail.mp4': [
		...['-f', 'lavfi', '-i', 'testsrc2=size=1280x720:rate=30:duration=60'],
		...['-c:v', 'libx264', '-preset', 'veryfast', '-b:v', '3M', '-pix_fmt', 'yuv420p', '-g', '60']
	],
	'big.jpg': [...['-f', 'lavfi', '-i', 'testsrc2=size=4000x3000:rate=1'], ...['-frames:v', '1', '-q:v', '3']]
} as const;
type FileName = keyof typeof FILES;

function ffmpeg(args: readonly string[]) {
	const tools: [string, string[]][] = [
		['ffmpeg', []],
		['podman', ['run', '--rm', '-v', `${MEDIA}:${MEDIA}`, '-w', MEDIA, 'docker.io/jrottenberg/ffmpeg']],
		['docker', ['run', '--rm', '-v', `${MEDIA}:${MEDIA}`, '-w', MEDIA, 'jrottenberg/ffmpeg']]
	];
	for (const [cmd, pre] of tools) {
		try {
			execFileSync(cmd, [...pre, '-hide_banner', '-loglevel', 'error', '-y', ...args], { stdio: 'pipe' });
			return;
		} catch (e) {
			if ((e as { code?: string }).code !== 'ENOENT') throw e;
		}
	}
	throw new Error('ffmpeg is needed (locally, or through podman or docker)');
}

function ensureMedia() {
	mkdirSync(MEDIA, { recursive: true });
	for (const [name, args] of Object.entries(FILES)) {
		const file = join(MEDIA, name);
		if (!existsSync(file)) ffmpeg([...args, file]);
	}
}

let token = '';
async function immich<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
	const headers = new Headers(init.headers);
	if (token) headers.set('authorization', `Bearer ${token}`);
	if (init.json !== undefined) headers.set('content-type', 'application/json');
	const res = await fetch(`${IMMICH}/api${path}`, {
		...init,
		headers,
		body: init.json !== undefined ? JSON.stringify(init.json) : init.body
	});
	if (!res.ok) throw new Error(`${init.method ?? 'GET'} ${path} → ${res.status} ${await res.text()}`);
	return (res.status === 204 ? null : await res.json()) as T;
}

interface Seeded {
	albumId: string;
	links: { dl: string; nodl: string; up: string };
	sizes: Record<FileName, number>;
}

/** An album of our own, with the generated files, and two Immich links: downloads on and off. */
async function seedImmich(): Promise<Seeded> {
	token = (await immich<{ accessToken: string }>('/auth/login', { method: 'POST', json: ADMIN })).accessToken;
	const albums = await immich<Array<{ id: string; albumName: string }>>('/albums');
	let album = albums.find((a) => a.albumName === ALBUM);
	if (!album) {
		const ids: string[] = [];
		let when = Date.parse('2026-09-01T10:00:00Z');
		for (const name of Object.keys(FILES) as FileName[]) {
			const form = new FormData();
			const type = name.endsWith('.mp4') ? 'video/mp4' : 'image/jpeg';
			form.set('assetData', await openAsBlob(join(MEDIA, name), { type }), name);
			form.set('deviceAssetId', `shrim-viewer-e2e-${name}`);
			form.set('deviceId', 'shrim-viewer-e2e');
			const at = new Date((when += 60_000)).toISOString();
			form.set('fileCreatedAt', at);
			form.set('fileModifiedAt', at);
			form.set('filename', name);
			ids.push((await immich<{ id: string }>('/assets', { method: 'POST', body: form })).id);
		}
		album = await immich<{ id: string; albumName: string }>('/albums', {
			method: 'POST',
			json: { albumName: ALBUM, assetIds: ids }
		});
	}
	// Wait for thumbnails and video durations. (Immich v3 lists album assets through the timeline.)
	const ids = async () => {
		const out: string[] = [];
		for (const { timeBucket } of await immich<Array<{ timeBucket: string }>>(`/timeline/buckets?albumId=${album.id}`)) {
			const b = await immich<{ id: string[] }>(
				`/timeline/bucket?albumId=${album.id}&timeBucket=${encodeURIComponent(timeBucket)}`
			);
			out.push(...b.id);
		}
		return out;
	};
	await expect
		.poll(
			async () => {
				const all = await ids();
				if (all.length < Object.keys(FILES).length) return false;
				const assets = await Promise.all(
					all.map((id) => immich<{ thumbhash: string | null; type: string; duration: string }>(`/assets/${id}`))
				);
				return assets.every((x) => x.thumbhash && (x.type !== 'VIDEO' || !/^0:00:00\.0/.test(x.duration)));
			},
			{ timeout: 90_000 }
		)
		.toBe(true);

	const existing = await immich<Array<{ key: string; description: string }>>(`/shared-links?albumId=${album.id}`);
	const link = async (description: string, allowDownload: boolean, allowUpload = false) => {
		let l = existing.find((x) => x.description === description);
		l ??= await immich<{ key: string; description: string }>('/shared-links', {
			method: 'POST',
			json: { type: 'ALBUM', albumId: album.id, description, allowUpload, allowDownload, showMetadata: true }
		});
		return `${IMMICH}/share/${l.key}`;
	};
	const sizes = Object.fromEntries(
		(Object.keys(FILES) as FileName[]).map((n) => [n, statSync(join(MEDIA, n)).size])
	) as Record<FileName, number>;
	return {
		albumId: album.id,
		links: {
			dl: await link('viewer-dl', true),
			nodl: await link('viewer-nodl', false),
			up: await link('viewer-up', true, true)
		},
		sizes
	};
}

async function open(page: Page, url: string) {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
}

/** An Immich API key for the admin, made once per run: the agent only accepts keys (or SSO). */
let agentKey: { id: string; secret: string } | null = null;
async function adminKey() {
	agentKey ??= await immich<{ secret: string; apiKey: { id: string } }>('/api-keys', {
		method: 'POST',
		json: {
			name: 'shrim agent e2e (viewer)',
			permissions: ['user.read', 'album.read', 'sharedLink.create', 'sharedLink.update', 'sharedLink.delete']
		}
	}).then((k) => ({ id: k.apiKey.id, secret: k.secret }));
	return agentKey!.secret;
}

async function agentPage(context: BrowserContext) {
	const page = await context.newPage();
	await open(page, AGENT);
	if (new URL(page.url()).pathname === '/login') {
		await page.getByLabel('Your Immich API key').fill(await adminKey());
		await page.getByRole('button', { name: 'Sign in with this key' }).click();
		await expect(page).not.toHaveURL(/\/login/);
		await page.waitForLoadState('networkidle');
	}
	return page;
}

/** Connects the agent to a fresh relay account, unless it is connected already. */
async function connect(context: BrowserContext, agent: Page) {
	const code = agent.locator('.code-display');
	const connected = agent.getByText(/^Connected (as|to) /).or(agent.getByRole('button', { name: 'New share link' }));
	await expect(code.or(connected).first()).toBeVisible({ timeout: 20_000 });
	if (!(await code.isVisible())) return;

	const relay = await context.newPage();
	await open(relay, `${RELAY}/signup`);
	await relay.getByLabel('Email').fill(`viewer-${Date.now()}@shrim.test`);
	await relay.getByLabel('Password', { exact: true }).fill('a-long-enough-password');
	await relay.getByRole('button', { name: 'Create account' }).click();
	await expect(relay).toHaveURL(/\/dashboard$/);
	await relay.getByRole('button', { name: /Activate plan/ }).click();
	await expect(relay.getByText('Plan active').first()).toBeVisible();

	const [approve] = await Promise.all([
		context.waitForEvent('page'),
		agent.getByRole('link', { name: /Approve on/ }).click()
	]);
	await approve.waitForLoadState('networkidle');
	await approve.getByRole('button', { name: 'Connect agent' }).click();
	await expect(approve.getByRole('heading', { name: 'Agent connected' })).toBeVisible();
	await approve.close();
	await relay.close();
}

/** Makes a shrim.pics link from an Immich link, the paste way. */
async function shrim(agent: Page, immichLink: string, name: string) {
	await open(agent, AGENT);
	const fresh = agent.getByRole('button', { name: 'New share link' }).first();
	if (await fresh.isVisible()) await fresh.click();
	// Choose "paste" (first run: a card; the dialog: a button), retrying until the field shows:
	// a click that lands just before the page has hydrated can be lost.
	const paste = agent.getByText('Paste an Immich link', { exact: true });
	const orPaste = agent.getByRole('button', { name: 'Paste a link' });
	await expect(async () => {
		if (await paste.isVisible()) await paste.click();
		if (await orPaste.isVisible()) await orPaste.click();
		await expect(agent.getByLabel('Immich share link')).toBeVisible({ timeout: 1000 });
	}).toPass({ timeout: 15_000 });
	await agent.getByLabel('Immich share link').fill(immichLink);
	await agent.getByLabel('Name').click();
	await expect(agent.getByRole('list', { name: 'What friends can do' })).toBeVisible();
	await agent.getByLabel('Name').fill(name);
	await agent.getByRole('button', { name: 'Create link' }).click();
	await expect(agent.locator('.ready .field')).toBeVisible({ timeout: 20_000 });
	return (await agent.locator('.ready .field').getAttribute('title'))!;
}

let seeded: Seeded;
let links: { dl: string; nodl: string; up: string };

test.beforeAll(async ({ browser }: { browser: Browser }) => {
	test.setTimeout(300_000);
	mkdirSync(SHOTS, { recursive: true });
	ensureMedia();
	seeded = await seedImmich();
	const context = await browser.newContext();
	const agent = await agentPage(context);
	await connect(context, agent);
	links = {
		dl: await shrim(agent, seeded.links.dl, 'Viewer e2e'),
		nodl: await shrim(agent, seeded.links.nodl, 'Viewer e2e, no downloads'),
		up: await shrim(agent, seeded.links.up, 'Viewer e2e, uploads')
	};
	// Handy for poking at the same album by hand afterwards. Under e2e/.out, which git ignores.
	writeFileSync(join(OUT, 'links.json'), JSON.stringify(links, null, '\t'));
	await context.close();
});

interface RelayStats {
	requests: number;
	bytes: number;
	notCiphertext: number;
	plaintextMarkers: number;
}

/**
 * Counts every response the relay sends to the viewer, from inside the page
 * (so it works whatever the service worker does with the request), and checks
 * each one is a shrim stream with no recognisable video bytes in it.
 */
function watchRelay(page: Page) {
	return page.addInitScript(() => {
		const stats = { requests: 0, bytes: 0, notCiphertext: 0, plaintextMarkers: 0 };
		(window as unknown as { __relay: typeof stats }).__relay = stats;
		const original = window.fetch.bind(window);
		window.fetch = async (input, init) => {
			const res = await original(input, init);
			const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
			if (!url.includes('/api/v1/s/') || !res.body) return res;
			const [mine, theirs] = res.body.tee();
			void (async () => {
				const reader = mine.getReader();
				let first: Uint8Array | null = null;
				const latin1 = new TextDecoder('latin1');
				for (;;) {
					const { value, done } = await reader.read();
					if (done) break;
					first ??= value.slice(0, 4);
					stats.bytes += value.length;
					// Eight bytes: random ciphertext won't contain them by chance.
					if (latin1.decode(value).includes('ftypisom')) stats.plaintextMarkers++;
				}
				stats.requests++;
				if (!first || latin1.decode(first) !== 'SHR1') stats.notCiphertext++;
			})().catch(() => {});
			return new Response(theirs, { status: res.status, statusText: res.statusText, headers: res.headers });
		};
	});
}

const relayStats = (page: Page) => page.evaluate(() => (window as unknown as { __relay: RelayStats }).__relay);
/** Numbers worth reading: printed, and kept in the report. */
function report(line: string) {
	test.info().annotations.push({ type: 'measure', description: line });
	process.stdout.write(`${line}\n`);
}
const MiB = (n: number) => `${(n / 1024 / 1024).toFixed(1)} MiB`;

async function openItem(page: Page, link: string, label: RegExp) {
	await open(page, link);
	await expect(page.getByRole('heading', { level: 1, name: ALBUM })).toBeVisible();
	await page.getByRole('button', { name: label }).first().click();
	const box = page.getByRole('dialog', { name: 'Photo viewer' });
	await expect(box).toBeVisible();
	return box;
}

/** Opens a video, plays it, and measures how long until the first frame shows. */
async function playVideo(page: Page, link: string, nth: number) {
	await open(page, link);
	await expect(page.getByRole('heading', { level: 1, name: ALBUM })).toBeVisible();
	const tiles = page.getByRole('button', { name: /^Video \d+ of \d+/ });
	await page.evaluate(() => ((window as unknown as { __t0: number }).__t0 = performance.now()));
	await tiles.nth(nth).click();
	const video = page.locator('.lightbox video');
	await expect(video).toHaveAttribute('src', /\/__video\//, { timeout: 15_000 });
	const firstFrame = await video.evaluate(async (v: HTMLVideoElement) => {
		v.muted = true;
		await v.play();
		await new Promise<void>((resolve) => {
			const frame = (v as { requestVideoFrameCallback?: (cb: () => void) => void }).requestVideoFrameCallback;
			if (frame) frame.call(v, () => resolve());
			else v.addEventListener('timeupdate', () => resolve(), { once: true });
		});
		return performance.now() - (window as unknown as { __t0: number }).__t0;
	});
	return { video, firstFrame };
}

test('a long video starts at once and seeks to the end without downloading it all', async ({ page }) => {
	await watchRelay(page);
	// Videos sort newest first: tail.mp4, short.mp4, long.mp4 (big.jpg is the newest item).
	const { video, firstFrame } = await playVideo(page, links.dl, 2);
	const duration = await video.evaluate((v: HTMLVideoElement) => v.duration);
	expect(duration).toBeGreaterThan(110);
	const atStart = await relayStats(page);
	report(
		`[${BROWSER}] long.mp4 (${MiB(seeded.sizes['long.mp4'])}): first frame after ${Math.round(firstFrame)} ms, ${MiB(atStart.bytes)} fetched`
	);
	expect(firstFrame).toBeLessThan(4000);
	await page.screenshot({ path: join(SHOTS, `${BROWSER}-video-playing.png`) });

	// Seek near the end: playback carries on from there.
	const seek = await video.evaluate(async (v: HTMLVideoElement) => {
		const t0 = performance.now();
		v.currentTime = v.duration - 6;
		await new Promise<void>((resolve) => {
			const check = () => (v.currentTime > v.duration - 5.5 && !v.paused ? resolve() : undefined);
			v.addEventListener('timeupdate', check);
		});
		return performance.now() - t0;
	});
	const afterSeek = await relayStats(page);
	report(
		`[${BROWSER}] seek to ${Math.round(duration - 6)} s: playing again after ${Math.round(seek)} ms; ` +
			`${MiB(afterSeek.bytes)} fetched in total (${afterSeek.requests} encrypted requests) of a ${MiB(seeded.sizes['long.mp4'])} file`
	);
	expect(seek).toBeLessThan(5000);
	// WebKit's Linux media stack (GStreamer) buffers further ahead while playing; the point
	// holds everywhere: seeking to the end doesn't fetch the whole file.
	expect(afterSeek.bytes).toBeLessThan(seeded.sizes['long.mp4'] * (BROWSER === 'webkit' ? 0.6 : 0.5));

	// The relay only ever carried shrim streams.
	expect(afterSeek.requests).toBeGreaterThan(2);
	expect(afterSeek.notCiphertext).toBe(0);
	expect(afterSeek.plaintextMarkers).toBe(0);
	// The key is still only in the address bar, untouched.
	expect(page.url()).toBe(links.dl);
	expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
});

test('time to first frame does not grow with the file', async ({ context }) => {
	for (const [nth, name] of [
		[1, 'short.mp4'],
		[0, 'tail.mp4']
	] as const) {
		const page = await context.newPage();
		await watchRelay(page);
		const { firstFrame } = await playVideo(page, links.dl, nth);
		const stats = await relayStats(page);
		report(
			`[${BROWSER}] ${name} (${MiB(seeded.sizes[name])}): first frame after ${Math.round(firstFrame)} ms, ${MiB(stats.bytes)} fetched`
		);
		expect(firstFrame).toBeLessThan(4000);
		expect(stats.notCiphertext).toBe(0);
		// tail.mp4 keeps its index at the end: the player fetched that, not the whole file.
		if (name === 'tail.mp4') expect(stats.bytes).toBeLessThan(seeded.sizes[name] * 0.6);
		await page.close();
	}
});

test('moving on stops the stream, and Download still saves the whole video', async ({ page }) => {
	await watchRelay(page);
	const { video } = await playVideo(page, links.dl, 2);
	await video.evaluate((v: HTMLVideoElement) => v.pause());
	await page.waitForTimeout(500);
	await page.keyboard.press('Escape');
	await expect(page.getByRole('dialog', { name: 'Photo viewer' })).toBeHidden();
	const before = (await relayStats(page)).bytes;
	await page.waitForTimeout(1500);
	// Nothing keeps streaming in the background (a chunk in flight may still land).
	expect((await relayStats(page)).bytes - before).toBeLessThan(5 * 1024 * 1024);

	await page
		.getByRole('button', { name: /^Video \d+ of \d+/ })
		.nth(1)
		.click();
	const box = page.getByRole('dialog', { name: 'Photo viewer' });
	const download = page.waitForEvent('download');
	await box.getByRole('button', { name: 'Download' }).click();
	const file = await (await download).path();
	expect(statSync(file).size).toBe(seeded.sizes['short.mp4']);
});

/** The photo's scale and offset, read back from its transform. */
async function zoomOf(page: Page) {
	return page.locator('.lightbox .media').evaluate((el: HTMLElement) => {
		const t = el.style.transform;
		const s = /scale\(([\d.]+)\)/.exec(t);
		const xy = /translate3d\((-?[\d.]+)px, (-?[\d.]+)px/.exec(t);
		return { scale: s ? Number(s[1]) : 1, x: xy ? Number(xy[1]) : 0, y: xy ? Number(xy[2]) : 0 };
	});
}

/** Waits for zoom animations to finish. */
const settle = (page: Page) => page.waitForTimeout(450);

type Finger = [x: number, y: number];

/** Touch input: real touches through CDP in Chromium, pointer events elsewhere. */
async function touchscreen(page: Page) {
	if (BROWSER === 'chromium') {
		const cdp = await page.context().newCDPSession(page);
		const send = (type: 'touchStart' | 'touchMove' | 'touchEnd', fingers: Finger[]) =>
			cdp.send('Input.dispatchTouchEvent', {
				type,
				touchPoints: fingers.map(([x, y], id) => ({ x, y, id, radiusX: 2, radiusY: 2, force: 1 }))
			});
		return {
			start: (f: Finger[]) => send('touchStart', f),
			move: (f: Finger[]) => send('touchMove', f),
			end: () => send('touchEnd', [])
		};
	}
	let down: Finger[] = [];
	const fire = (type: string, fingers: Finger[]) =>
		page.evaluate(
			({ type, fingers }) => {
				const target =
					document.querySelector('.lightbox .stage img.full') ?? document.querySelector('.lightbox .stage');
				fingers.forEach(([x, y], id) =>
					target!.dispatchEvent(
						new PointerEvent(type, {
							pointerId: 100 + id,
							pointerType: 'touch',
							isPrimary: id === 0,
							clientX: x,
							clientY: y,
							buttons: type === 'pointerup' ? 0 : 1,
							bubbles: true,
							cancelable: true
						})
					)
				);
			},
			{ type, fingers }
		);
	return {
		start: async (f: Finger[]) => {
			down = f;
			await fire('pointerdown', f);
		},
		move: async (f: Finger[]) => {
			down = f;
			await fire('pointermove', f);
		},
		end: async () => {
			await fire('pointerup', down);
			down = [];
		}
	};
}

/** Dragged as far left as it goes, the photo's right edge stops at the frame's (16 px in from the stage). */
function photoReachesRightEdge(page: Page) {
	return page.evaluate(() => {
		const img = document.querySelector('.lightbox img.full')!.getBoundingClientRect();
		const stage = document.querySelector('.lightbox .stage')!.getBoundingClientRect();
		return img.right >= stage.right - 16 - 1 && img.right < stage.right;
	});
}

async function stageCentre(page: Page): Promise<Finger> {
	const r = (await page.locator('.lightbox .media').boundingBox())!;
	return [r.x + r.width / 2, r.y + r.height / 2];
}

test('on a phone: pinch, pan, double tap, and a sharper image when zoomed in', async ({ browser }) => {
	const context = await browser.newContext({
		viewport: { width: 390, height: 844 },
		deviceScaleFactor: 3,
		hasTouch: true,
		...(BROWSER === 'chromium' ? { isMobile: true } : {})
	});
	const page = await context.newPage();
	const box = await openItem(page, links.dl, /^Photo \d+ of \d+/);
	await expect(box.locator('img.full.shown')).toBeVisible();
	const counter = await box.locator('.counter').innerText();
	await page.waitForTimeout(400);
	await page.screenshot({ path: join(SHOTS, `${BROWSER}-phone-1-before.png`) });

	const touch = await touchscreen(page);
	const [cx, cy] = await stageCentre(page);

	// Pinch out around a point left of centre: the photo grows around the fingers.
	await touch.start([
		[cx - 70, cy],
		[cx - 10, cy]
	]);
	for (let i = 1; i <= 8; i++) {
		await touch.move([
			[cx - 70 - 15 * i, cy],
			[cx - 10 + 15 * i, cy]
		]);
	}
	await touch.end();
	const pinched = await zoomOf(page);
	expect(pinched.scale).toBeGreaterThan(2.5);
	expect(pinched.x).toBeGreaterThan(0); // zoomed towards the fingers, left of centre
	await expect(page.getByText(counter)).toBeVisible();

	// Zoomed in past the preview's pixels: the original (downloads are on) fades in on top.
	const sharp = box.locator('img.sharp.shown');
	await expect(sharp).toBeVisible({ timeout: 20_000 });
	expect(await sharp.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(4000);
	await page.waitForTimeout(400);
	await page.screenshot({ path: join(SHOTS, `${BROWSER}-phone-2-pinched-sharp.png`) });

	// One finger pans; it doesn't move to the next photo, and the photo can't leave the screen.
	await touch.start([[cx, cy]]);
	for (let i = 1; i <= 20; i++) await touch.move([[cx - 120 * i, cy]]);
	await touch.end();
	const panned = await zoomOf(page);
	expect(panned.x).toBeLessThan(pinched.x);
	await expect(box.locator('.counter')).toHaveText(counter);
	expect(await photoReachesRightEdge(page)).toBe(true);
	await expect(box.getByRole('button', { name: 'Close' })).toBeVisible(); // the photo stays under the bar

	// Double tap zooms back out, a second double tap zooms in at the tap.
	const doubleTap = async ([x, y]: Finger) => {
		for (let i = 0; i < 2; i++) {
			await touch.start([[x, y]]);
			await touch.end();
			await page.waitForTimeout(60);
		}
		await settle(page);
	};
	await doubleTap([cx, cy]);
	expect((await zoomOf(page)).scale).toBe(1);
	await doubleTap([cx + 60, cy - 80]);
	const tapped = await zoomOf(page);
	expect(tapped.scale).toBeCloseTo(2.5, 1);
	expect(tapped.x).toBeLessThan(0);
	await page.screenshot({ path: join(SHOTS, `${BROWSER}-phone-3-double-tap.png`) });
	await doubleTap([cx, cy]);
	expect((await zoomOf(page)).scale).toBe(1);

	// Not zoomed: a swipe moves on, and the next photo starts unzoomed.
	await touch.start([[cx + 100, cy]]);
	for (let i = 1; i <= 6; i++) await touch.move([[cx + 100 - 40 * i, cy]]);
	await touch.end();
	await expect(box.locator('.counter')).not.toHaveText(counter);
	expect((await zoomOf(page)).scale).toBe(1);
	await context.close();
});

test('on a desktop: double click, ctrl+wheel, drag, keys, and Escape', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 860 });
	const box = await openItem(page, links.dl, /^Photo \d+ of \d+/);
	await expect(box.locator('img.full.shown')).toBeVisible();
	await page.waitForTimeout(400);
	await page.screenshot({ path: join(SHOTS, `${BROWSER}-desktop-1-before.png`) });
	const [cx, cy] = await stageCentre(page);

	await page.mouse.dblclick(cx - 200, cy - 100);
	await settle(page);
	const dbl = await zoomOf(page);
	expect(dbl.scale).toBeCloseTo(2.5, 1);
	expect(dbl.x).toBeGreaterThan(0);
	await expect(box.locator('img.sharp.shown')).toBeVisible({ timeout: 20_000 });
	await page.waitForTimeout(400);
	await page.screenshot({ path: join(SHOTS, `${BROWSER}-desktop-2-double-click-sharp.png`) });

	// Drag far to the left: the photo stops at its edge.
	for (let i = 0; i < 3; i++) {
		await page.mouse.move(1200, cy);
		await page.mouse.down();
		await page.mouse.move(60, cy, { steps: 10 });
		await page.mouse.up();
	}
	expect(await photoReachesRightEdge(page)).toBe(true);
	expect((await zoomOf(page)).x).toBeLessThan(0);

	// Keys: 0 resets, + and - step.
	await page.keyboard.press('0');
	await settle(page);
	expect((await zoomOf(page)).scale).toBe(1);
	await page.keyboard.press('+');
	await settle(page);
	expect((await zoomOf(page)).scale).toBeCloseTo(1.5, 2);
	await page.keyboard.press('-');
	await settle(page);
	expect((await zoomOf(page)).scale).toBe(1);

	// A trackpad pinch arrives as ctrl+wheel; it zooms the photo, not the page.
	await page.mouse.move(cx, cy);
	await page.keyboard.down('Control');
	for (let i = 0; i < 5; i++) await page.mouse.wheel(0, -20);
	await page.keyboard.up('Control');
	await expect.poll(async () => (await zoomOf(page)).scale).toBeGreaterThan(1.5);
	expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
	await page.screenshot({ path: join(SHOTS, `${BROWSER}-desktop-3-wheel.png`) });

	// Escape zooms out first, then closes. Arrow keys still move on, unzoomed.
	await page.keyboard.press('Escape');
	await settle(page);
	expect((await zoomOf(page)).scale).toBe(1);
	await page.keyboard.press('+');
	const counter = await box.locator('.counter').innerText();
	await page.keyboard.press('ArrowRight');
	await expect(box.locator('.counter')).not.toHaveText(counter);
	expect((await zoomOf(page)).scale).toBe(1);
	await page.keyboard.press('ArrowLeft');
	await page.keyboard.press('Escape');
	await expect(box).toBeHidden();
	expect(page.url()).toBe(links.dl);
});

test('zooming pauses the slideshow', async ({ page }) => {
	await open(page, links.dl);
	await page.getByRole('button', { name: 'Slideshow' }).click();
	const box = page.getByRole('dialog', { name: 'Photo viewer' });
	await expect(box.getByRole('button', { name: 'Pause slideshow' })).toBeAttached();
	await page.keyboard.press('+');
	await expect(box.getByRole('button', { name: 'Play slideshow' })).toBeVisible();
});

test('with downloads off, zooming in keeps the preview', async ({ page }) => {
	await page.setViewportSize({ width: 1280, height: 860 });
	const box = await openItem(page, links.nodl, /^Photo \d+ of \d+/);
	await expect(box.locator('img.full.shown')).toBeVisible();
	const [cx, cy] = await stageCentre(page);
	await page.mouse.dblclick(cx, cy);
	await settle(page);
	await page.keyboard.press('+');
	await settle(page);
	expect((await zoomOf(page)).scale).toBeGreaterThan(3);
	await page.waitForTimeout(2000);
	await expect(box.locator('img.sharp')).toHaveCount(0);
	await expect(box.getByRole('button', { name: 'Download' })).toHaveCount(0);
});

test('uploads still work once the service worker controls the page', async ({ page }) => {
	// Play a video first: that registers the worker, and from then on it sees the page's requests.
	const { video } = await playVideo(page, links.up, 1);
	await video.evaluate((v: HTMLVideoElement) => v.pause());
	expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
	await page.keyboard.press('Escape');

	const name = `viewer-upload-${Date.now()}.jpg`;
	const file = join(MEDIA, name);
	// A photo no one has uploaded before (Immich skips duplicates), drawn by the browser:
	// works anywhere, no ffmpeg needed.
	const jpeg = await page.evaluate(async (seed) => {
		const canvas = new OffscreenCanvas(640, 480);
		const g = canvas.getContext('2d')!;
		g.fillStyle = `hsl(${seed % 360} 60% 55%)`;
		g.fillRect(0, 0, 640, 480);
		g.fillStyle = '#fff';
		g.font = '48px sans-serif';
		g.fillText(String(seed), 40, 260);
		const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.9 });
		return Array.from(new Uint8Array(await blob.arrayBuffer()));
	}, Date.now());
	writeFileSync(file, Uint8Array.from(jpeg));
	try {
		await page.getByRole('button', { name: 'Add photos' }).first().click();
		const dialog = page.getByRole('dialog', { name: /Add photos to/ });
		await dialog.locator('input[type=file]').setInputFiles([file]);
		await dialog.getByRole('button', { name: /^Upload/ }).click();
		await expect(dialog.getByRole('heading', { name: '1 photo added' })).toBeVisible({ timeout: 60_000 });
	} finally {
		// Leave the album as it was.
		const found = await immich<{ assets: { items: Array<{ id: string }> } }>('/search/metadata', {
			method: 'POST',
			json: { originalFileName: name }
		});
		const ids = found.assets.items.map((a) => a.id);
		if (ids.length) await immich('/assets', { method: 'DELETE', json: { ids, force: true } });
		rmSync(file, { force: true });
	}
});

test.afterAll(async () => {
	if (agentKey) await immich(`/api-keys/${agentKey.id}`, { method: 'DELETE' }).catch(() => {});
});

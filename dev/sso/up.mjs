// A dev sign-in provider (Dex) for trying "Sign in with SSO", and Immich's OAuth pointed at it.
// Usage: node dev/sso/up.mjs        (undo with: node dev/sso/down.mjs)
//
// The browser and the Immich container must reach the issuer at the same address, so it tries
// this machine's addresses until one also answers from inside the container (rootless podman
// with pasta can't always). Override with SSO_HOST=<address>; CONTAINER=… picks the runtime.
//
// Dev user robin@shrim.test matches the Immich user e2e/multiuser.spec.ts creates (linked by email).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { networkInterfaces, tmpdir } from 'node:os';
import { join } from 'node:path';

const IMMICH = (process.env.IMMICH_URL ?? 'http://localhost:2283').replace(/\/$/, '');
const ADMIN = { email: 'admin@shrim.test', password: 'shrim-dev-password' };
const NAME = 'shrim_dev_dex';
const PORT = 5556;
const CLIENT = { id: 'immich', secret: 'shrim-dev-sso-secret' };
/** Where people may come back to after signing in: Immich itself, and agents on the usual dev ports. */
const REDIRECTS = [
	`${IMMICH}/auth/login`,
	`${IMMICH}/user-settings`,
	'app.immich:///oauth-callback',
	...[5174, 5274, 5674].map((p) => `http://localhost:${p}/login/sso`)
];

function runtime() {
	if (process.env.CONTAINER) return process.env.CONTAINER;
	try {
		execFileSync('podman', ['--version'], { stdio: 'ignore' });
		return 'podman';
	} catch {
		return 'docker';
	}
}

/** This machine's addresses, private LAN ones first. */
function candidates() {
	if (process.env.SSO_HOST) return [process.env.SSO_HOST];
	const all = Object.values(networkInterfaces())
		.flat()
		.filter((a) => a && a.family === 'IPv4' && !a.internal)
		.map((a) => a.address);
	const lan = (a) => /^(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a);
	return [...all.filter(lan), ...all.filter((a) => !lan(a))];
}

function reachableFromImmich(rt, url) {
	try {
		execFileSync(
			rt,
			[
				'exec',
				'shrim_immich_server',
				'node',
				'-e',
				`fetch(${JSON.stringify(url)}).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))`
			],
			{ stdio: 'ignore', timeout: 10_000 }
		);
		return true;
	} catch {
		return false;
	}
}

async function api(path, { token, method = 'GET', body } = {}) {
	const res = await fetch(`${IMMICH}/api${path}`, {
		method,
		headers: {
			...(token ? { authorization: `Bearer ${token}` } : {}),
			...(body ? { 'content-type': 'application/json' } : {})
		},
		body: body ? JSON.stringify(body) : undefined
	});
	const text = await res.text();
	if (!res.ok) throw new Error(`${method} ${path} → ${res.status} ${text}`);
	return text ? JSON.parse(text) : null;
}

const rt = runtime();
const dir = join(tmpdir(), 'shrim-dev-sso');
mkdirSync(dir, { recursive: true });

function start(issuer) {
	const config = `issuer: ${issuer}
storage:
  type: memory
web:
  http: 0.0.0.0:${PORT}
oauth2:
  skipApprovalScreen: true
enablePasswordDB: true
staticClients:
  - id: ${CLIENT.id}
    secret: ${CLIENT.secret}
    name: Immich (dev)
    redirectURIs:
${REDIRECTS.map((r) => `      - '${r}'`).join('\n')}
staticPasswords:
  - email: robin@shrim.test
    # bcrypt of robin-dev-password
    hash: '$2a$10$GpqMOP0R0dzySORCIX.5wemKCAvbKyswn7atQwYR4SJVkcg/61Fqm'
    username: robin
    userID: 8b4e3f0c-5d0a-4c55-9b44-robin0000001
`;
	writeFileSync(join(dir, 'config.yaml'), config);
	execFileSync(rt, ['rm', '-f', NAME], { stdio: 'ignore' });
	execFileSync(
		rt,
		[
			'run',
			'-d',
			'--name',
			NAME,
			'-p',
			`${PORT}:${PORT}`,
			'-v',
			`${join(dir, 'config.yaml')}:/etc/dex/config.yaml:ro,Z`,
			'ghcr.io/dexidp/dex:v2.43.1',
			'dex',
			'serve',
			'/etc/dex/config.yaml'
		],
		{ stdio: 'ignore' }
	);
}

/** Waits for Dex on this machine, then checks Immich can reach it at the same address. */
async function works(issuer) {
	const url = `${issuer}/.well-known/openid-configuration`;
	for (let i = 0; ; i++) {
		try {
			if ((await fetch(url)).ok) break;
		} catch {
			// not up yet
		}
		if (i > 40) return false;
		await new Promise((r) => setTimeout(r, 500));
	}
	return reachableFromImmich(rt, url);
}

let issuer = '';
for (const host of candidates()) {
	const candidate = `http://${host}:${PORT}/dex`;
	start(candidate);
	if (await works(candidate)) {
		issuer = candidate;
		break;
	}
}
if (!issuer) {
	execFileSync(rt, ['rm', '-f', NAME], { stdio: 'ignore' });
	throw new Error('No address of this machine works from both here and the Immich container. Set SSO_HOST.');
}

const { accessToken: token } = await api('/auth/login', { method: 'POST', body: ADMIN });
const current = await api('/system-config', { token });
await api('/system-config', {
	token,
	method: 'PUT',
	body: {
		...current,
		oauth: {
			...current.oauth,
			enabled: true,
			issuerUrl: issuer,
			clientId: CLIENT.id,
			clientSecret: CLIENT.secret,
			scope: 'openid email profile',
			buttonText: 'Sign in with Dex',
			autoLaunch: false,
			autoRegister: false,
			// Dex runs on plain http here; Immich only allows that when told to.
			allowInsecureRequests: true
		},
		passwordLogin: { ...current.passwordLogin, enabled: true }
	}
});
await api('/auth/logout', { token, method: 'POST' });

console.log(`Dex is up at ${issuer}, and Immich (${IMMICH}) signs in with it.
Test user: robin@shrim.test / robin-dev-password
Agents on localhost:5174, :5274 and :5674 may use it (callback /login/sso).
Undo: node dev/sso/down.mjs`);

// Turns Immich's OAuth off again and removes the dev Dex container (see up.mjs).
import { execFileSync } from 'node:child_process';

const IMMICH = (process.env.IMMICH_URL ?? 'http://localhost:2283').replace(/\/$/, '');
const ADMIN = { email: 'admin@shrim.test', password: 'shrim-dev-password' };

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

const { accessToken: token } = await api('/auth/login', { method: 'POST', body: ADMIN });
const current = await api('/system-config', { token });
await api('/system-config', {
	token,
	method: 'PUT',
	body: { ...current, oauth: { ...current.oauth, enabled: false, autoLaunch: false } }
});
await api('/auth/logout', { token, method: 'POST' });

let rt = process.env.CONTAINER;
if (!rt) {
	try {
		execFileSync('podman', ['--version'], { stdio: 'ignore' });
		rt = 'podman';
	} catch {
		rt = 'docker';
	}
}
execFileSync(rt, ['rm', '-f', 'shrim_dev_dex'], { stdio: 'ignore' });
console.log('Immich OAuth is off and the dev Dex is gone.');

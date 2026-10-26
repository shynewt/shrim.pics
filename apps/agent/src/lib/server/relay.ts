/**
 * The agent's only link to the outside world. Every connection is outbound:
 * an SSE stream to receive requests, plain HTTP to answer them.
 */
import type { AgentMe, CreatedShare, RelayRequestEvent } from '@shrim/protocol';
import { save, state } from './state.ts';

export type ConnectionStatus =
	'not_configured' | 'connecting' | 'connected' | 'unauthorized' | 'inactive' | 'unreachable';

export interface Connection {
	status: ConnectionStatus;
	since: number;
	me: AgentMe | null;
}

interface Runtime {
	connection: Connection;
	abort: AbortController | null;
	generation: number;
	onRequest: ((e: RelayRequestEvent) => void) | null;
	/** When `me` (the account, its plan) was last fetched (ms). */
	meAt: number;
	refreshing: Promise<void> | null;
}

const g = globalThis as unknown as { __shrimRelay?: Runtime };
const rt: Runtime = (g.__shrimRelay ??= {
	connection: { status: 'not_configured', since: Date.now(), me: null },
	abort: null,
	generation: 0,
	onRequest: null,
	meAt: 0,
	refreshing: null
});
// Dev reloads keep the runtime: give an older copy the newer fields.
rt.meAt ??= 0;
rt.refreshing ??= null;

export const connection = (): Connection => rt.connection;

function setStatus(status: ConnectionStatus) {
	if (rt.connection.status !== status) rt.connection = { ...rt.connection, status, since: Date.now() };
}

export class RelayError extends Error {
	constructor(
		public status: number,
		public code: string
	) {
		super(`relay ${status} ${code}`);
	}
}

export async function relayFetch(path: string, init: RequestInit & { duplex?: 'half' } = {}): Promise<Response> {
	const headers = new Headers(init.headers);
	headers.set('authorization', `Bearer ${state.agentToken}`);
	headers.set('user-agent', 'shrim-agent/0.1');
	// SvelteKit refuses non-GET requests without a content type as possible CSRF.
	if (init.method && init.method !== 'GET' && !headers.has('content-type')) {
		headers.set('content-type', 'application/octet-stream');
	}
	const res = await fetch(`${state.relayUrl}${path}`, { ...init, headers });
	if (!res.ok && res.status !== 204) {
		const body = (await res.json().catch(() => ({}))) as { error?: string };
		throw new RelayError(res.status, body.error ?? 'error');
	}
	return res;
}

export async function fetchMe(signal?: AbortSignal): Promise<AgentMe> {
	const me = (await (await relayFetch('/agent/v1/me', { signal })).json()) as AgentMe;
	rt.connection = { ...rt.connection, me };
	rt.meAt = Date.now();
	return me;
}

/**
 * Never throws and never touches the event stream; but if requests were refused for an
 * inactive plan and it's active now, reconnects straight away.
 */
export function refreshMe(maxAgeMs: number): Promise<void> {
	if (!state.agentToken || Date.now() - rt.meAt < maxAgeMs) return Promise.resolve();
	rt.refreshing ??= (async () => {
		try {
			const me = await fetchMe(AbortSignal.timeout(5_000));
			if (rt.connection.status === 'inactive' && me.accountActive && rt.onRequest) startRelay(rt.onRequest);
		} catch {
			// The connection loop deals with a relay that's down or a token that's gone.
		} finally {
			rt.refreshing = null;
		}
	})();
	return rt.refreshing;
}

export async function createRelayShare(allowUpload: boolean, expiresAt: string | null): Promise<string> {
	const res = await relayFetch('/agent/v1/shares', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ allowUpload, expiresAt })
	});
	return ((await res.json()) as CreatedShare).id;
}

export async function disableRelayShare(id: string): Promise<void> {
	try {
		await relayFetch(`/agent/v1/shares/${id}`, { method: 'DELETE' });
	} catch (e) {
		if (!(e instanceof RelayError && e.status === 404)) throw e;
	}
}

export interface RemoteShare {
	id: string;
	state: 'live' | 'disabled' | 'expired';
	disabledBy: 'owner' | 'operator' | null;
	views: number;
}

export async function listRelayShares(): Promise<RemoteShare[] | null> {
	try {
		return (await (await relayFetch('/agent/v1/shares')).json()) as RemoteShare[];
	} catch {
		return null;
	}
}

const sleep = (ms: number, signal: AbortSignal) =>
	new Promise<void>((resolve) => {
		const t = setTimeout(resolve, ms);
		signal.addEventListener('abort', () => (clearTimeout(t), resolve()), { once: true });
	});

export function startRelay(onRequest: (e: RelayRequestEvent) => void) {
	rt.onRequest = onRequest;
	rt.abort?.abort();
	const abort = new AbortController();
	rt.abort = abort;
	const generation = ++rt.generation;
	void loop(abort.signal, generation);
}

async function loop(signal: AbortSignal, generation: number) {
	let backoff = 1000;
	while (!signal.aborted && generation === rt.generation) {
		if (!state.agentToken || !state.relayUrl) {
			setStatus('not_configured');
			return;
		}
		if (rt.connection.status !== 'connected') setStatus('connecting');
		try {
			await fetchMe();
			await listen(signal, () => (backoff = 1000));
		} catch (e) {
			if (signal.aborted) return;
			if (e instanceof RelayError && e.status === 401) setStatus('unauthorized');
			else if (e instanceof RelayError && (e.status === 402 || e.status === 403)) setStatus('inactive');
			else setStatus('unreachable');
		}
		const wait = rt.connection.status === 'unauthorized' || rt.connection.status === 'inactive' ? 60_000 : backoff;
		await sleep(wait, signal);
		backoff = Math.min(backoff * 2, 30_000);
	}
}

async function listen(signal: AbortSignal, onOpen: () => void) {
	const watchdog = new AbortController();
	const both = AbortSignal.any([signal, watchdog.signal]);
	const res = await relayFetch('/agent/v1/events', { signal: both, headers: { accept: 'text/event-stream' } });
	if (!res.body) throw new Error('no body');
	setStatus('connected');
	onOpen();

	let lastData = Date.now();
	// Close this connection if it goes quiet, or if the agent now has a different
	// token (connected to another account, or disconnected): no stale connections.
	const token = state.agentToken;
	const timer = setInterval(() => {
		if (Date.now() - lastData > 45_000 || state.agentToken !== token) watchdog.abort();
		// The stream can stay up for days: look at the account (and its plan) now and then.
		else void refreshMe(60_000);
	}, 1_000);

	const decoder = new TextDecoder();
	let buffer = '';
	try {
		for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) {
			lastData = Date.now();
			buffer += decoder.decode(chunk, { stream: true });
			let end: number;
			while ((end = buffer.indexOf('\n\n')) >= 0) {
				const block = buffer.slice(0, end);
				buffer = buffer.slice(end + 2);
				let event = 'message';
				let data = '';
				for (const line of block.split('\n')) {
					if (line.startsWith('event: ')) event = line.slice(7);
					else if (line.startsWith('data: ')) data += line.slice(6);
				}
				// The account changed (a plan started or ended): look again now.
				if (event === 'account') void refreshMe(0);
				else if (event === 'req' && data) {
					try {
						rt.onRequest?.(JSON.parse(data) as RelayRequestEvent);
					} catch (e) {
						console.error('[shrim] bad event', e);
					}
				}
			}
		}
	} finally {
		clearInterval(timer);
	}
	throw new Error('stream ended');
}

export function relayConfigured(): boolean {
	return !!(state.agentToken && state.relayUrl);
}

export interface Pairing {
	userCode: string;
	approveUrl: string;
	expiresAt: number;
	status: 'waiting' | 'expired' | 'denied' | 'error';
}

const gp = globalThis as unknown as {
	__shrimPairing?: { view: Pairing | null; stop: (() => void) | null; running: boolean };
};
const pairingState = (gp.__shrimPairing ??= { view: null, stop: null, running: false });

/** The current code, but only while something is still waiting for its approval. */
export const pairing = (): Pairing | null =>
	pairingState.view && (pairingState.running || pairingState.view.status !== 'waiting') ? pairingState.view : null;

export async function startPairing(relayUrl: string, onRequest: (e: RelayRequestEvent) => void): Promise<Pairing> {
	pairingState.stop?.();
	state.relayUrl = relayUrl.replace(/\/$/, '');
	const res = await fetch(`${state.relayUrl}/agent/v1/pair/start`, {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'user-agent': 'shrim-agent/0.1' }
	});
	if (!res.ok) throw new RelayError(res.status, 'pair_start');
	const body = (await res.json()) as {
		deviceCode: string;
		userCode: string;
		approveUrl: string;
		expiresAt: number;
		interval: number;
	};
	const view: Pairing = {
		userCode: body.userCode,
		approveUrl: body.approveUrl,
		expiresAt: body.expiresAt,
		status: 'waiting'
	};
	pairingState.view = view;

	let stopped = false;
	pairingState.stop = () => (stopped = true);
	pairingState.running = true;
	void (async () => {
		try {
			await poll();
		} finally {
			if (!stopped) pairingState.running = false;
		}
	})();
	return view;

	async function poll() {
		while (!stopped) {
			await new Promise((r) => setTimeout(r, Math.max(2, body.interval) * 1000));
			if (stopped) return;
			try {
				const poll = await fetch(`${state.relayUrl}/agent/v1/pair/poll`, {
					method: 'POST',
					headers: { 'content-type': 'application/json', 'user-agent': 'shrim-agent/0.1' },
					body: JSON.stringify({ deviceCode: body.deviceCode })
				});
				const result = (await poll.json()) as { status: string; token?: string };
				if (result.status === 'approved' && result.token) {
					state.agentToken = result.token;
					save();
					pairingState.view = null;
					startRelay(onRequest);
					return;
				}
				if (result.status === 'expired' || result.status === 'denied') {
					view.status = result.status;
					return;
				}
			} catch {
				// relay hiccup: keep trying until the code expires
			}
			if (Date.now() > body.expiresAt + 30_000) {
				view.status = 'expired';
				return;
			}
		}
	}
}

export function cancelPairing() {
	pairingState.stop?.();
	pairingState.view = null;
}

export async function disconnect() {
	cancelPairing();
	// Tell the relay to drop the token too. If it can't be reached, forget it here anyway:
	// the owner can still disconnect from their dashboard.
	if (state.agentToken) {
		await relayFetch('/agent/v1/me', { method: 'DELETE', signal: AbortSignal.timeout(5_000) }).catch(() => {});
	}
	state.agentToken = '';
	save();
	rt.abort?.abort();
	rt.connection = { status: 'not_configured', since: Date.now(), me: null };
}

export async function updateRelayShare(id: string, patch: { expiresAt?: string | null; allowUpload?: boolean }) {
	await relayFetch(`/agent/v1/shares/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(patch)
	});
}

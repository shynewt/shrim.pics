/**
 * Routes viewer requests to agents. Agents listen on an SSE stream; each
 * request gets an id, the agent fetches the body if it wasn't inlined, and
 * posts the (encrypted) response back, which is piped to the waiting viewer.
 * The relay never looks inside the bytes.
 */
import { randomBytes } from 'node:crypto';
import type { RelayErrorCode, RelayRequestEvent } from '@shrim/protocol';
import { markAgentSeen } from './accounts.ts';
import { config } from './config.ts';

interface AgentConnection {
	id: number;
	accountId: string;
	send(event: string, data: unknown): void;
	close(): void;
	connectedAt: number;
}

type Outcome = { ok: true; stream: ReadableStream<Uint8Array> } | { ok: false; code: RelayErrorCode; status: number };

interface Pending {
	rid: string;
	accountId: string;
	shareId: string;
	body: ReadableStream<Uint8Array> | null;
	settle(outcome: Outcome): void;
	settled: boolean;
}

interface State {
	agents: Map<string, AgentConnection>;
	pending: Map<string, Pending>;
	nextId: number;
}

const g = globalThis as unknown as { __shrimRouter?: State };
const state: State = (g.__shrimRouter ??= { agents: new Map(), pending: new Map(), nextId: 1 });

const encoder = new TextEncoder();

/** A new connection replaces an older one for the same account. */
export function connectAgent(accountId: string): ReadableStream<Uint8Array> {
	let conn: AgentConnection;
	let ping: ReturnType<typeof setInterval>;
	return new ReadableStream<Uint8Array>({
		start(controller) {
			const id = state.nextId++;
			const write = (chunk: string) => {
				try {
					controller.enqueue(encoder.encode(chunk));
				} catch {
					// stream already closed
				}
			};
			conn = {
				id,
				accountId,
				connectedAt: Date.now(),
				send: (event, data) => write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
				close: () => {
					clearInterval(ping);
					try {
						controller.close();
					} catch {
						// already closed
					}
				}
			};
			state.agents.get(accountId)?.close();
			state.agents.set(accountId, conn);
			markAgentSeen(accountId);
			write(': connected\n\n');
			conn.send('hello', { at: Date.now() });
			ping = setInterval(() => write(': ping\n\n'), 15_000);
		},
		cancel() {
			clearInterval(ping);
			if (state.agents.get(accountId)?.id === conn.id) state.agents.delete(accountId);
			markAgentSeen(accountId);
		}
	});
}

/** Tells a connected agent its account changed (plan started, ended, unsuspended), so it re-checks now. */
export function notifyAccountChanged(accountId: string) {
	state.agents.get(accountId)?.send('account', { at: Date.now() });
}

export function disconnectAgent(accountId: string) {
	state.agents.get(accountId)?.close();
	state.agents.delete(accountId);
}

export function routerStats(): { agentsOnline: number; requestsInFlight: number } {
	return { agentsOnline: state.agents.size, requestsInFlight: state.pending.size };
}

export function agentOnline(accountId: string): boolean {
	return state.agents.has(accountId);
}

export function agentConnectedAt(accountId: string): number | null {
	return state.agents.get(accountId)?.connectedAt ?? null;
}

function pendingFor(accountId: string): number {
	let n = 0;
	for (const p of state.pending.values()) if (p.accountId === accountId) n++;
	return n;
}

export function forward(
	accountId: string,
	shareId: string,
	request: { inline: Uint8Array | null; body: ReadableStream<Uint8Array> | null },
	signal: AbortSignal
): Promise<Outcome> {
	const agent = state.agents.get(accountId);
	if (!agent) return Promise.resolve({ ok: false, code: 'offline', status: 503 });
	if (pendingFor(accountId) >= config.maxPendingPerAgent) {
		return Promise.resolve({ ok: false, code: 'slow_down', status: 429 });
	}

	return new Promise<Outcome>((resolve) => {
		const rid = randomBytes(18).toString('base64url');
		const timer = setTimeout(
			() => pending.settle({ ok: false, code: 'timeout', status: 504 }),
			config.requestTimeout * 1000
		);
		const onAbort = () => pending.settle({ ok: false, code: 'timeout', status: 499 });
		const pending: Pending = {
			rid,
			accountId,
			shareId,
			body: request.body,
			settled: false,
			settle(outcome) {
				if (this.settled) {
					if (outcome.ok) outcome.stream.cancel().catch(() => {});
					return;
				}
				this.settled = true;
				clearTimeout(timer);
				signal.removeEventListener('abort', onAbort);
				state.pending.delete(rid);
				resolve(outcome);
			}
		};
		signal.addEventListener('abort', onAbort, { once: true });
		state.pending.set(rid, pending);

		const event: RelayRequestEvent = { rid, share: shareId };
		if (request.inline) event.inline = Buffer.from(request.inline).toString('base64url');
		agent.send('req', event);
	});
}

/** The agent wants the rest of a request body. Can only be taken once. */
export function takeBody(accountId: string, rid: string): ReadableStream<Uint8Array> | null {
	const p = state.pending.get(rid);
	if (!p || p.accountId !== accountId || !p.body) return null;
	const body = p.body;
	p.body = null;
	return body;
}

/** The agent answers a request. Returns false if nobody is waiting any more. */
export function answer(accountId: string, rid: string, outcome: Outcome): { shareId: string } | null {
	const p = state.pending.get(rid);
	if (!p || p.accountId !== accountId) return null;
	p.settle(outcome);
	return { shareId: p.shareId };
}

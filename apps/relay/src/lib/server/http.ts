import type { RelayErrorCode } from '@shrim/protocol';

export function relayError(status: number, code: RelayErrorCode): Response {
	return Response.json({ error: code }, { status, headers: { 'cache-control': 'no-store' } });
}

/**
 * Refuses a request body over `max` bytes before anything reads it, or null to go on.
 * The server itself sets no limit (scripts/serve.mjs) so the streaming routes can take
 * large bodies; every other route is capped with this. SvelteKit cuts off a body that
 * runs past its Content-Length, so a body without one is refused: browsers and
 * Stripe always send it.
 */
export function refuseLargeBody(request: Request, max: number): Response | null {
	if (!request.body) return null;
	const length = Number(request.headers.get('content-length') ?? NaN);
	if (!Number.isInteger(length)) return new Response('Length required', { status: 411 });
	if (length > max) return new Response('Payload too large', { status: 413 });
	return null;
}

/**
 * Reads up to `inlineLimit` bytes. If the body ended within that, returns it
 * whole; otherwise returns a stream of everything (prefix included). Either
 * way the total is capped at `max` bytes.
 */
export async function splitBody(
	body: ReadableStream<Uint8Array> | null,
	inlineLimit: number,
	max: number
): Promise<{ inline: Uint8Array | null; rest: ReadableStream<Uint8Array> | null; tooLarge: boolean }> {
	if (!body) return { inline: new Uint8Array(0), rest: null, tooLarge: false };
	const reader = body.getReader();
	const head: Uint8Array[] = [];
	let size = 0;
	for (;;) {
		const { value, done } = await reader.read();
		if (done) {
			return { inline: Buffer.concat(head), rest: null, tooLarge: false };
		}
		head.push(value);
		size += value.length;
		if (size > max) {
			reader.cancel().catch(() => {});
			return { inline: null, rest: null, tooLarge: true };
		}
		if (size > inlineLimit) break;
	}
	let total = size;
	const rest = new ReadableStream<Uint8Array>({
		start(controller) {
			for (const c of head) controller.enqueue(c);
		},
		async pull(controller) {
			const { value, done } = await reader.read();
			if (done) return controller.close();
			total += value.length;
			if (total > max) {
				controller.error(new Error('too_large'));
				reader.cancel().catch(() => {});
				return;
			}
			controller.enqueue(value);
		},
		cancel(reason) {
			return reader.cancel(reason);
		}
	});
	return { inline: null, rest, tooLarge: false };
}

/** Passes a stream through and reports how many bytes went by, however it ends. */
export function countBytes(
	source: ReadableStream<Uint8Array>,
	onDone: (bytes: number) => void
): ReadableStream<Uint8Array> {
	const reader = source.getReader();
	let bytes = 0;
	let reported = false;
	const report = () => {
		if (!reported) {
			reported = true;
			onDone(bytes);
		}
	};
	return new ReadableStream<Uint8Array>({
		async pull(controller) {
			try {
				const { value, done } = await reader.read();
				if (done) {
					report();
					return controller.close();
				}
				bytes += value.length;
				controller.enqueue(value);
			} catch (e) {
				report();
				controller.error(e);
			}
		},
		cancel(reason) {
			report();
			return reader.cancel(reason);
		}
	});
}

/** A text field from a submitted form. Files and missing fields give the fallback. */
export function formText(form: FormData, name: string, fallback = ''): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : fallback;
}

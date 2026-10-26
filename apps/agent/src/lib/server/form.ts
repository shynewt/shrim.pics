/** Files and missing fields give the fallback. */
export function formText(form: FormData, name: string, fallback = ''): string {
	const value = form.get(name);
	return typeof value === 'string' ? value : fallback;
}

/**
 * The server itself sets no limit (scripts/serve.mjs). SvelteKit cuts off a body that runs
 * past its Content-Length, so a body without one is refused: browsers always send it.
 */
export function refuseLargeBody(request: Request, max: number): Response | null {
	if (!request.body) return null;
	const length = Number(request.headers.get('content-length') ?? NaN);
	if (!Number.isInteger(length)) return new Response('Length required', { status: 411 });
	if (length > max) return new Response('Payload too large', { status: 413 });
	return null;
}

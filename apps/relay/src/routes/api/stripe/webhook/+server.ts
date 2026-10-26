import { handleEvent, stripeEnabled, verifyWebhook } from '#lib/server/billing.ts';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	if (!stripeEnabled()) return new Response('Billing is off', { status: 404 });
	const payload = await request.text();
	let event;
	try {
		event = verifyWebhook(payload, request.headers.get('stripe-signature'));
	} catch {
		return new Response('Bad signature', { status: 400 });
	}
	try {
		await handleEvent(event);
	} catch (e) {
		console.error('[billing] webhook failed', event.type, e);
		// Stripe retries on errors, which is what we want.
		return new Response('Try again', { status: 500 });
	}
	return new Response(null, { status: 204 });
};

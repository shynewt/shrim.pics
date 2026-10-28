import { connection, pairing, refreshMe, setupTokenRejected } from '#lib/server/relay.ts';
import type { RequestHandler } from './$types';

/** Polled by the page while it waits for the connection. Only admins see the pairing code. */
export const GET: RequestHandler = async ({ locals }) => {
	await refreshMe(15_000);
	const c = connection();
	const admin = locals.user.isAdmin;
	return Response.json({
		status: c.status,
		email: admin ? (c.me?.email ?? null) : null,
		accountActive: c.me?.accountActive ?? null,
		pairing: admin ? pairing() : null,
		setupRejected: admin && setupTokenRejected()
	});
};

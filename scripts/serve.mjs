// Production entry for both apps: `node scripts/serve.mjs <build dir>`.
//
// adapter-node assumes https unless a proxy says otherwise, which breaks form
// posts (CSRF origin check) for the agent on a plain-http LAN. So unless
// PROTOCOL_HEADER is configured (you're behind a proxy), we tell SvelteKit
// the protocol the request really arrived on.
import { createServer } from 'node:http';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const dir = resolve(process.argv[2] ?? 'build');
const injected = !process.env.PROTOCOL_HEADER;
if (injected) process.env.PROTOCOL_HEADER = 'x-shrim-proto';
process.env.BODY_SIZE_LIMIT ??= 'Infinity'; // the apps enforce their own limits

const { handler } = await import(pathToFileURL(`${dir}/handler.js`).href);

const server = createServer((req, res) => {
	if (injected) req.headers['x-shrim-proto'] = 'encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http';
	handler(req, res);
});

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? '0.0.0.0';
server.listen(port, host, () => console.log(`Listening on http://${host}:${port}`));

function shutdown() {
	server.close(() => process.exit(0));
	setTimeout(() => {
		server.closeAllConnections();
		process.exit(0);
	}, 10_000).unref();
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

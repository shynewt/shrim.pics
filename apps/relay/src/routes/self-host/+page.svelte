<script lang="ts">
	import { CodeBlock } from '@shrim/ui';
	import Prose from '#lib/components/Prose.svelte';

	const relay = `docker run -d --name shrim-relay -p 127.0.0.1:3000:3000 \\
  -v shrim-relay:/data \\
  -e SHRIM_PUBLIC_ORIGIN=https://share.example.com \\
  -e SHRIM_BILLING=off \\
  -e SHRIM_SIGNUPS=closed \\
  -e SHRIM_ADMIN_EMAILS=you@example.com \\
  ghcr.io/shynewt/shrim-relay:latest`;

	const agent = `services:
  # …your Immich services…
  shrim-agent:
    image: ghcr.io/shynewt/shrim-agent:latest
    environment:
      IMMICH_URL: http://immich-server:2283
      SHRIM_RELAY_URL: https://share.example.com
    ports:
      - 127.0.0.1:2284:3000
    volumes:
      - ./shrim:/data
    restart: always`;
</script>

<Prose title="Self-host">
	<p>
		Everything that runs shrim.pics is open source. Run your own relay on a small server with a domain, and your agent
		next to Immich. It's free, and nobody but you is involved.
	</p>

	<h2>1. Run the relay</h2>
	<p>
		The relay needs a public HTTPS address. Start it behind your reverse proxy (Caddy, Traefik or nginx). Turn off
		response buffering for it, because photos and the agent connection are streamed.
	</p>
	<CodeBlock code={relay} />
	<p>
		<code>SHRIM_SIGNUPS=closed</code> lets only the first account sign up, which will be yours.
		<code>SHRIM_BILLING=off</code>
		keeps every account active.
	</p>

	<h2>2. Run the agent next to Immich</h2>
	<p>Add this to the <code>docker-compose.yml</code> that runs Immich, then run <code>docker compose up -d</code>.</p>
	<CodeBlock code={agent} />

	<h2>3. Connect the agent with a code</h2>
	<p>
		Open <code>http://localhost:2284</code> in a browser on that machine and sign in as an Immich admin, with an Immich
		API key or your single sign-on. The port is published on localhost only, so the agent isn't open to your whole
		network. From another device, use an SSH tunnel (<code>ssh -L 2284:localhost:2284 &lt;that machine&gt;</code>) or
		your reverse proxy. The agent shows a short code: approve it on your relay, signed in with your account. That's all.
	</p>
	<p>
		Everyone in your home can then sign in to the agent with their own Immich account and share their own albums. If you
		already have your own sign-in in front of it (a VPN, Authelia…), <code>SHRIM_AUTH=none</code> turns the agent's sign-in
		off: anyone who can reach the page can then make public links.
	</p>
</Prose>

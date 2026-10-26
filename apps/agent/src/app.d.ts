import type { AgentUser } from '#lib/server/auth.ts';

declare global {
	namespace App {
		interface Locals {
			/** Who is signed in. Set on every page except /login (see hooks.server.ts). */
			user: AgentUser;
			signedIn: boolean;
		}
	}
}

export {};

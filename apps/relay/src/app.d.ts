import type { Account } from '#lib/server/accounts.ts';

declare global {
	namespace App {
		interface Locals {
			account: Account | null;
		}
		interface PageState {
			/** Index of the photo open in the viewer's lightbox. */
			lightbox?: number;
			/** The lightbox was opened to play a slideshow. */
			slideshow?: boolean;
		}
	}
}

export {};

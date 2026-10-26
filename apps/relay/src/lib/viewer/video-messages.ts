/** What the viewer page and the service worker say to each other. Shared by both, so it imports nothing. */

/** The worker asks the page for bytes start..end of one video. */
export interface RangeAsk {
	type: 'shrim.range';
	share: string;
	asset: string;
	start: number;
	end: number;
}

/** The page's answer: at most one chunk's worth of bytes, starting at `start`. */
export type RangeAnswer =
	| { ok: true; total: number; type: string; start: number; bytes: ArrayBuffer }
	| { ok: false; status: number; total?: number };

/** The worker claims a page that isn't controlled yet (first visit, or after a hard reload). */
export interface ClaimAsk {
	type: 'shrim.claim';
}

export const VIDEO_PATH =
	/^\/s\/([A-Za-z0-9]{10})\/__video\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/i;
export const videoStreamUrl = (share: string, asset: string) => `/s/${share}/__video/${asset}`;
export const isStreamUrl = (url: string) => url.startsWith('/s/');

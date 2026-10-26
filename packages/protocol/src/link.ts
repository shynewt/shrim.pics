import { fromBase64Url, toBase64Url } from './bytes.ts';
import { SHARE_KEY_SIZE } from './stream.ts';

export function shareLink(origin: string, id: string, key: Uint8Array): string {
	return `${origin.replace(/\/$/, '')}/s/${id}#${toBase64Url(key)}`;
}

/** Reads the share key from a URL fragment. Returns null if it is missing or malformed. */
export function keyFromFragment(hash: string): Uint8Array<ArrayBuffer> | null {
	const raw = hash.replace(/^#/, '').trim();
	if (!raw) return null;
	try {
		const key = fromBase64Url(raw);
		return key.length === SHARE_KEY_SIZE ? key : null;
	} catch {
		return null;
	}
}

export type ImmichLinkRef = { key: string } | { slug: string };

/**
 * Pulls the key or slug out of an Immich shared link. Accepts
 * `https://host/share/<key>`, `https://host/s/<slug>` or a bare key.
 * The host is ignored on purpose: the agent always talks to its own IMMICH_URL.
 */
export function parseImmichLink(input: string): ImmichLinkRef | null {
	const value = input.trim();
	if (!value) return null;
	if (/^[A-Za-z0-9_-]{20,}$/.test(value)) return { key: value };
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return null;
	}
	const parts = url.pathname.split('/').filter(Boolean);
	const i = parts.findIndex((p) => p === 'share' || p === 's');
	const token = i >= 0 ? parts[i + 1] : undefined;
	if (!token || !/^[A-Za-z0-9_.~-]+$/.test(token)) return null;
	return parts[i] === 'share' ? { key: decodeURIComponent(token) } : { slug: decodeURIComponent(token) };
}

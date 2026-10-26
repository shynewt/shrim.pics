import { config } from './config.ts';
import type { ImmichServerInfo } from './immich.ts';
import { state } from './state.ts';

/** Immich's address as a browser sees it. IMMICH_URL only if a browser could open it (not a container name). */
export function immichPublicUrl(info: ImmichServerInfo | null): string | null {
	if (config.immichPublicUrl) return config.immichPublicUrl;
	if (info?.externalDomain) return info.externalDomain;
	if (state.immichPublicUrl) return state.immichPublicUrl;
	try {
		const { hostname } = new URL(config.immichUrl);
		if (hostname === 'localhost' || hostname.includes('.') || hostname.includes(':')) return config.immichUrl;
	} catch {
		// not a URL: nothing to offer
	}
	return null;
}

export const apiKeysPage = (base: string | null) => (base ? `${base}/user-settings?isOpen=api-keys` : null);

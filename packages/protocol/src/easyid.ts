/**
 * Two emoji derived from a share id ("the 🦊🍋 one"): a label, not a secret.
 * 64 × 64 = 4096 pairs; the relay rerolls a share id whose pair is already live on the account.
 */

// Distinct at a glance, single code points (no variation selectors), no flags or people.
export const EASY_ID_EMOJI = [
	'🦐',
	'🐙',
	'🐠',
	'🐳',
	'🦀',
	'🐢',
	'🦊',
	'🐼',
	'🐨',
	'🦁',
	'🐯',
	'🐸',
	'🐵',
	'🦉',
	'🦄',
	'🐝',
	'🐞',
	'🦋',
	'🐌',
	'🦔',
	'🐧',
	'🦩',
	'🦜',
	'🐬',
	'🦭',
	'🐘',
	'🦒',
	'🦓',
	'🐪',
	'🦥',
	'🦦',
	'🐓',
	'🍎',
	'🍋',
	'🍉',
	'🍇',
	'🍓',
	'🥑',
	'🥕',
	'🌽',
	'🍩',
	'🍪',
	'🧁',
	'🍕',
	'🥨',
	'🍒',
	'🥝',
	'🍍',
	'🌵',
	'🌻',
	'🌷',
	'🍄',
	'🌈',
	'⭐',
	'🌙',
	'🔥',
	'🎈',
	'🎨',
	'🎸',
	'🎲',
	'🧩',
	'🚲',
	'🚀',
	'⛵'
] as const;

/** FNV-1a, 32-bit: tiny, deterministic, and spreads short ids well. */
function fnv1a(s: string): number {
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) {
		h ^= s.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h;
}

export function easyId(shareId: string): string {
	const h = fnv1a(shareId);
	return EASY_ID_EMOJI[h & 63] + EASY_ID_EMOJI[(h >>> 6) & 63];
}

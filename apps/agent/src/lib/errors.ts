export function createError(code: unknown, relayHost: string): string {
	switch (code) {
		case 'empty':
			return 'Paste an Immich share link.';
		case 'format':
			return "This doesn't look like an Immich share link. It should contain /share/ or /s/.";
		case 'notFound':
			return "Immich doesn't know this link or album. It may have been deleted, or have expired in Immich.";
		case 'password':
			return 'This link has a password in Immich. Make a link without one and paste that instead.';
		case 'immichDown':
			return "Can't reach Immich right now. Try again in a moment.";
		case 'relayDown':
			return `Can't reach ${relayHost} right now, so the link wasn't made. Try again in a moment.`;
		case 'plan':
			return `Your plan isn't active, so the link wasn't made. Subscribe on ${relayHost} first.`;
		case 'noKey':
			return 'Add an Immich API key first, or paste a link instead.';
		default:
			return "That didn't work. Try again in a moment.";
	}
}

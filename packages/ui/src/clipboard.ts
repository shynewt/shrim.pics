/**
 * Copies text. navigator.clipboard needs a secure context, which the agent's
 * LAN page (plain http) is not, so fall back to a hidden textarea.
 */
export async function copyText(text: string): Promise<boolean> {
	if (window.isSecureContext && navigator.clipboard) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// fall through
		}
	}
	const ta = document.createElement('textarea');
	ta.value = text;
	ta.setAttribute('readonly', '');
	ta.style.position = 'fixed';
	ta.style.opacity = '0';
	document.body.append(ta);
	ta.select();
	let ok: boolean;
	try {
		ok = document.execCommand('copy');
	} catch {
		ok = false;
	}
	ta.remove();
	return ok;
}

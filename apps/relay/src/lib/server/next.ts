/** Where to go after signing in. Only paths on this site, never another host. */
export function safeNext(value: string | null | undefined, fallback = '/dashboard'): string {
	if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return fallback;
	return value;
}

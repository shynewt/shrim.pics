const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "12 Nov 2026". Accepts a timestamp or an ISO string (local wall-clock strings are taken as-is). */
export function formatDate(value: number | string | Date): string {
	const d = value instanceof Date ? value : new Date(value);
	if (Number.isNaN(d.getTime())) return '';
	return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** "just now", "5 minutes ago", "3 hours ago", "yesterday", then the date. */
export function formatRelative(value: number | string | Date, now = Date.now()): string {
	const t = new Date(value).getTime();
	const s = Math.round((now - t) / 1000);
	if (s < 60) return 'just now';
	const m = Math.round(s / 60);
	if (m < 60) return m === 1 ? '1 minute ago' : `${m} minutes ago`;
	const h = Math.round(m / 60);
	if (h < 24) return h === 1 ? '1 hour ago' : `${h} hours ago`;
	if (h < 48) return 'yesterday';
	return formatDate(t);
}

export function formatSize(bytes: number): string {
	if (bytes < 1000) return `${bytes} B`;
	const units = ['kB', 'MB', 'GB', 'TB'];
	let v = bytes / 1000;
	let i = 0;
	while (v >= 1000 && i < units.length - 1) {
		v /= 1000;
		i++;
	}
	return `${v >= 100 ? Math.round(v) : v.toFixed(1).replace(/\.0$/, '')} ${units[i]}`;
}

export function plural(n: number, one: string, many: string): string {
	return `${n} ${n === 1 ? one : many}`;
}

export function formatDuration(ms: number): string {
	const total = Math.round(ms / 1000);
	const h = Math.floor(total / 3600);
	const m = Math.floor((total % 3600) / 60);
	const s = String(total % 60).padStart(2, '0');
	return h ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}

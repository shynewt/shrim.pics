/**
 * Date groups for the viewer grid: by day, or by month when an album covers
 * more than 30 days. Keeps the album's own order; never re-sorts.
 */
import type { ManifestAsset } from '@shrim/protocol';

export interface Group {
	key: string;
	label: string;
	items: Array<{ index: number; asset: ManifestAsset }>;
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const LONG_MONTHS = [
	'January',
	'February',
	'March',
	'April',
	'May',
	'June',
	'July',
	'August',
	'September',
	'October',
	'November',
	'December'
];

/** takenAt is local wall-clock time without a zone: read it as such. */
function parts(takenAt: string) {
	const m = takenAt.match(/^(\d{4})-(\d\d)-(\d\d)/);
	if (!m) return null;
	const [y, mo, d] = [Number(m[1]), Number(m[2]) - 1, Number(m[3])];
	return { y, mo, d, dow: new Date(Date.UTC(y, mo, d)).getUTCDay() };
}

export function groupByDate(assets: ManifestAsset[]): Group[] {
	const days = new Set<string>();
	const years = new Set<number>();
	for (const a of assets) {
		const p = a.takenAt ? parts(a.takenAt) : null;
		if (p) {
			days.add(`${p.y}-${p.mo}-${p.d}`);
			years.add(p.y);
		}
	}
	const byMonth = days.size > 30;
	const multiYear = years.size > 1;

	const groups: Group[] = [];
	const undated: Group = { key: 'undated', label: 'No date', items: [] };
	let lastDate = '';
	assets.forEach((asset, index) => {
		const p = asset.takenAt ? parts(asset.takenAt) : null;
		if (!p) return void undated.items.push({ index, asset });
		const key = byMonth ? `${p.y}-${p.mo}` : `${p.y}-${p.mo}-${p.d}`;
		const last = groups.at(-1);
		if (last && key === lastDate) return void last.items.push({ index, asset });
		lastDate = key;
		const label = byMonth
			? `${LONG_MONTHS[p.mo]} ${p.y}`
			: `${DAYS[p.dow]} ${p.d} ${MONTHS[p.mo]}${multiYear ? ` ${p.y}` : ''}`;
		groups.push({ key: `${key}#${groups.length}`, label, items: [{ index, asset }] });
	});
	if (undated.items.length) groups.push(undated);
	return groups;
}

/** "12–15 Aug 2026", "12 Aug 2026", "Aug 2025 – Mar 2026". */
export function albumRange(assets: ManifestAsset[]): string {
	const dates = assets
		.map((a) => (a.takenAt ? parts(a.takenAt) : null))
		.filter((p): p is NonNullable<ReturnType<typeof parts>> => !!p)
		.map((p) => p.y * 10000 + p.mo * 100 + p.d)
		.sort((a, b) => a - b);
	if (!dates.length) return '';
	const split = (n: number) => ({ y: Math.floor(n / 10000), mo: Math.floor(n / 100) % 100, d: n % 100 });
	const a = split(dates[0]);
	const b = split(dates.at(-1)!);
	if (dates[0] === dates.at(-1)) return `${a.d} ${MONTHS[a.mo]} ${a.y}`;
	if (a.y === b.y && a.mo === b.mo) return `${a.d}–${b.d} ${MONTHS[a.mo]} ${a.y}`;
	if (a.y === b.y) return `${a.d} ${MONTHS[a.mo]} – ${b.d} ${MONTHS[b.mo]} ${a.y}`;
	return `${MONTHS[a.mo]} ${a.y} – ${MONTHS[b.mo]} ${b.y}`;
}

/** "Sat 12 Aug 2026, 14:32" for the lightbox. */
export function longDate(takenAt: string | undefined): string {
	if (!takenAt) return '';
	const p = parts(takenAt);
	if (!p) return '';
	const time = takenAt.match(/T(\d\d:\d\d)/)?.[1];
	return `${DAYS[p.dow]} ${p.d} ${MONTHS[p.mo]} ${p.y}${time ? `, ${time}` : ''}`;
}

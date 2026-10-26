export interface ReadyLink {
	id: string;
	link: string;
	label: string;
	allowUpload: boolean;
	allowDownload: boolean | null;
	showMetadata: boolean | null;
	expiresAt: string | null;
}

export interface Album {
	id: string;
	name: string;
	count: number;
	startDate: string | null;
	endDate: string | null;
	/** Shared with you by someone else: who. */
	sharedBy: string | null;
	/** Immich lets owners and editors share an album, not viewers. */
	canShare: boolean;
}

/** "12–15 Aug 2026", "3 Mar 2026", or "Aug 2025 – Mar 2026". */
export function dateRange(start: string | null, end: string | null): string {
	if (!start) return '';
	const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
	const a = new Date(start);
	const b = new Date(end ?? start);
	const day = (d: Date) => `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
	if (a.toDateString() === b.toDateString()) return day(a);
	if (a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()) {
		return `${a.getDate()}–${b.getDate()} ${months[a.getMonth()]} ${a.getFullYear()}`;
	}
	return `${months[a.getMonth()]} ${a.getFullYear()} – ${months[b.getMonth()]} ${b.getFullYear()}`;
}

import type { IconName } from '@shrim/ui';

export interface MetaItem {
	text: string;
	icon: IconName;
}

export function whatFriendsCanDo(l: Pick<ReadyLink, 'allowUpload' | 'allowDownload' | 'showMetadata'>): MetaItem[] {
	const out: MetaItem[] = [];
	if (l.allowUpload) out.push({ text: 'Friends can add photos', icon: 'upload' });
	if (l.allowDownload === true) out.push({ text: 'Downloads on', icon: 'download' });
	else if (l.allowDownload === false && l.allowUpload) out.push({ text: 'Downloads off', icon: 'download' });
	if (l.showMetadata === false) out.push({ text: 'Photo details hidden', icon: 'eye-off' });
	return out;
}

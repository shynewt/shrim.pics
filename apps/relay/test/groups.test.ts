import type { ManifestAsset } from '@shrim/protocol';
import { describe, expect, it } from 'vitest';
import { albumRange, groupByDate, longDate } from '../src/lib/viewer/groups.ts';

const a = (takenAt?: string): ManifestAsset => ({ id: Math.random().toString(), ratio: 1, video: false, takenAt });

describe('date groups', () => {
	it('groups consecutive photos by day, keeping the album order', () => {
		const g = groupByDate([a('2026-08-12T10:00:00'), a('2026-08-12T18:00:00'), a('2026-08-13T09:00:00'), a()]);
		expect(g.map((x) => [x.label, x.items.length])).toEqual([
			['Wed 12 Aug', 2],
			['Thu 13 Aug', 1],
			['No date', 1]
		]);
		expect(g[1].items[0].index).toBe(2);
	});

	it('adds the year when an album spans years, and switches to months past 30 days', () => {
		expect(groupByDate([a('2025-12-31T10:00:00'), a('2026-01-01T10:00:00')]).map((x) => x.label)).toEqual([
			'Wed 31 Dec 2025',
			'Thu 1 Jan 2026'
		]);
		const many = Array.from({ length: 40 }, (_, i) =>
			a(`2026-0${1 + Math.floor(i / 20)}-${String((i % 20) + 1).padStart(2, '0')}T12:00:00`)
		);
		expect(groupByDate(many).map((x) => x.label)).toEqual(['January 2026', 'February 2026']);
	});

	it('describes date ranges', () => {
		expect(albumRange([a('2026-08-15T10:00:00'), a('2026-08-12T10:00:00')])).toBe('12–15 Aug 2026');
		expect(albumRange([a('2026-08-12T10:00:00')])).toBe('12 Aug 2026');
		expect(albumRange([a('2025-08-12T10:00:00'), a('2026-03-01T10:00:00')])).toBe('Aug 2025 – Mar 2026');
		expect(albumRange([a()])).toBe('');
		expect(longDate('2026-08-12T14:32:00')).toBe('Wed 12 Aug 2026, 14:32');
	});
});

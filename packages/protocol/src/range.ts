/**
 * Byte ranges for streamed video. The viewer asks the agent for one slice of
 * the playback file at a time (`video.range`), each in its own encrypted
 * stream, so a `<video>` can start at once and seek anywhere.
 */

/** The most an agent sends for one `video.range` request. Bigger asks are cut short. */
export const VIDEO_RANGE_MAX = 4 * 1024 * 1024;
/** What the viewer asks for at a time. Small enough to start fast, big enough to keep overhead low. */
export const VIDEO_CHUNK = 1024 * 1024;

/** A `Range: bytes=…` request: from `start` to `end` inclusive (open ended without `end`), or the last `suffix` bytes. */
export type ByteRange = { start: number; end?: number } | { suffix: number };

const INT = /^\d{1,15}$/;

/**
 * Reads a single-range `Range` header. Returns `undefined` when there is no
 * header, `null` when it is malformed or asks for several ranges (callers then
 * answer with the whole file, which is always allowed).
 */
export function parseRangeHeader(header: string | null | undefined): ByteRange | null | undefined {
	if (header == null) return undefined;
	const m = header.trim().match(/^bytes\s*=\s*([^,]*)$/i);
	if (!m) return null;
	const [a, b] = m[1].split('-').map((s) => s.trim());
	if (b === undefined) return null;
	if (a === '') return INT.test(b) && Number(b) > 0 ? { suffix: Number(b) } : null;
	if (!INT.test(a)) return null;
	const start = Number(a);
	if (b === '') return { start };
	if (!INT.test(b) || Number(b) < start) return null;
	return { start, end: Number(b) };
}

/** Resolves a range against the file size. `null` means it can't be satisfied (416). */
export function resolveRange(range: ByteRange, total: number): { start: number; end: number } | null {
	if ('suffix' in range) {
		if (total === 0) return null;
		return { start: Math.max(0, total - range.suffix), end: total - 1 };
	}
	if (range.start >= total) return null;
	return { start: range.start, end: Math.min(range.end ?? total - 1, total - 1) };
}

/** Reads `Content-Range: bytes 0-99/1234`. Returns null for anything else, such as the form a 416 carries. */
export function parseContentRange(
	header: string | null | undefined
): { start: number; end: number; total: number } | null {
	const m = header?.trim().match(/^bytes\s+(\d{1,15})-(\d{1,15})\/(\d{1,15})$/i);
	if (!m) return null;
	const [start, end, total] = [Number(m[1]), Number(m[2]), Number(m[3])];
	if (end < start || end >= total) return null;
	return { start, end, total };
}

/** Which fixed-size chunks cover bytes start..end (inclusive). */
export function chunksFor(start: number, end: number, size = VIDEO_CHUNK): { first: number; last: number } {
	return { first: Math.floor(start / size), last: Math.floor(end / size) };
}

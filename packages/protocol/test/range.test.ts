import { describe, expect, it } from 'vitest';
import {
	VIDEO_CHUNK,
	chunksFor,
	collect,
	decryptStream,
	encryptStream,
	encryptToBytes,
	generateShareKey,
	importShareKey,
	parseContentRange,
	parseRangeHeader,
	randomBytes,
	resolveRange,
	type RequestHead,
	type ResponseHead
} from '../src/index.ts';

describe('Range headers', () => {
	it('reads the forms browsers send', () => {
		expect(parseRangeHeader('bytes=0-')).toEqual({ start: 0 });
		expect(parseRangeHeader('bytes=0-1')).toEqual({ start: 0, end: 1 }); // Safari's probe
		expect(parseRangeHeader('bytes=1048576-2097151')).toEqual({ start: 1048576, end: 2097151 });
		expect(parseRangeHeader('bytes=-500')).toEqual({ suffix: 500 });
		expect(parseRangeHeader(' Bytes = 10 - 20 ')).toEqual({ start: 10, end: 20 });
	});

	it('tells a missing header from a bad one', () => {
		expect(parseRangeHeader(null)).toBeUndefined();
		expect(parseRangeHeader(undefined)).toBeUndefined();
		for (const bad of ['', 'bytes=', 'bytes=-', 'bytes=5-4', 'bytes=a-b', 'items=0-1', 'bytes=0-1,4-5', 'bytes=-0'])
			expect(parseRangeHeader(bad), bad).toBeNull();
	});

	it('resolves ranges against the file size', () => {
		expect(resolveRange({ start: 0 }, 1000)).toEqual({ start: 0, end: 999 });
		expect(resolveRange({ start: 10, end: 5000 }, 1000)).toEqual({ start: 10, end: 999 });
		expect(resolveRange({ suffix: 100 }, 1000)).toEqual({ start: 900, end: 999 });
		expect(resolveRange({ suffix: 5000 }, 1000)).toEqual({ start: 0, end: 999 });
		expect(resolveRange({ start: 1000 }, 1000)).toBeNull();
		expect(resolveRange({ suffix: 1 }, 0)).toBeNull();
	});

	it('reads Content-Range', () => {
		expect(parseContentRange('bytes 0-1/1574905')).toEqual({ start: 0, end: 1, total: 1574905 });
		expect(parseContentRange('bytes */1574905')).toBeNull();
		expect(parseContentRange('bytes 5-4/10')).toBeNull();
		expect(parseContentRange('bytes 0-10/10')).toBeNull();
		expect(parseContentRange(null)).toBeNull();
	});

	it('maps byte spans to chunks', () => {
		expect(chunksFor(0, 1)).toEqual({ first: 0, last: 0 });
		expect(chunksFor(VIDEO_CHUNK - 1, VIDEO_CHUNK)).toEqual({ first: 0, last: 1 });
		expect(chunksFor(5 * VIDEO_CHUNK, 7 * VIDEO_CHUNK - 1)).toEqual({ first: 5, last: 6 });
	});
});

describe('video.range through encrypted streams', () => {
	it('carries a slice and its position, bound to the request', async () => {
		const k = await importShareKey(generateShareKey());
		const shareId = 'Xk3f9QaPz2';
		const ask: RequestHead = {
			op: 'video.range',
			asset: crypto.randomUUID(),
			start: VIDEO_CHUNK,
			end: 2 * VIDEO_CHUNK - 1
		};
		const req = await encryptToBytes(k, { kind: 'req', shareId }, ask);
		const got = await decryptStream<RequestHead>(k, { kind: 'req', shareId }, new Blob([req.bytes]).stream());
		expect(got.head).toEqual(ask);

		const slice = randomBytes(VIDEO_CHUNK);
		const head: ResponseHead = {
			status: 206,
			type: 'video/mp4',
			start: VIDEO_CHUNK,
			end: 2 * VIDEO_CHUNK - 1,
			total: 5 * VIDEO_CHUNK + 17,
			size: VIDEO_CHUNK
		};
		const res = await encryptStream(k, { kind: 'res', shareId, bind: got.salt }, head, slice);
		const out = await decryptStream<ResponseHead>(k, { kind: 'res', shareId, bind: req.salt }, res.stream);
		expect(out.head).toEqual(head);
		expect(await collect(out.body)).toEqual(slice);
	});

	it('cannot be replayed as the answer to another range request', async () => {
		const k = await importShareKey(generateShareKey());
		const shareId = 'Xk3f9QaPz2';
		const asset = crypto.randomUUID();
		const first = await encryptToBytes(k, { kind: 'req', shareId }, { op: 'video.range', asset, start: 0, end: 9 });
		const second = await encryptToBytes(k, { kind: 'req', shareId }, { op: 'video.range', asset, start: 10, end: 19 });
		const answer = await encryptToBytes(
			k,
			{ kind: 'res', shareId, bind: first.salt },
			{ status: 206 },
			randomBytes(10)
		);
		await expect(
			decryptStream(k, { kind: 'res', shareId, bind: second.salt }, new Blob([answer.bytes]).stream())
		).rejects.toThrow();
	});
});

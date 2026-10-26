import { describe, expect, it } from 'vitest';
import {
	RECORD_SIZE,
	StreamError,
	collect,
	concat,
	decryptStream,
	encryptStream,
	encryptToBytes,
	generateShareKey,
	importShareKey,
	keyFromFragment,
	parseImmichLink,
	randomBytes,
	shareLink,
	type StreamContext
} from '../src/index.ts';

const req: StreamContext = { kind: 'req', shareId: 'Xk3f9QaPz2' };

function streamOf(bytes: Uint8Array, chunk = 1000): ReadableStream<Uint8Array> {
	let i = 0;
	return new ReadableStream({
		pull(c) {
			if (i >= bytes.length) return c.close();
			c.enqueue(bytes.slice(i, i + chunk));
			i += chunk;
		}
	});
}

async function key() {
	return importShareKey(generateShareKey());
}

async function expectStreamError(p: Promise<unknown>, code: string) {
	const err = await p.then(
		() => null,
		(e: unknown) => e
	);
	expect(err).toBeInstanceOf(StreamError);
	expect((err as StreamError).code).toBe(code);
}

describe('encrypted streams', () => {
	it('round-trips a head without a body', async () => {
		const k = await key();
		const { bytes } = await encryptToBytes(k, req, { op: 'manifest' });
		const out = await decryptStream(k, req, streamOf(bytes, 7));
		expect(out.head).toEqual({ op: 'manifest' });
		expect((await collect(out.body)).length).toBe(0);
	});

	it('round-trips a multi-record body from an unevenly chunked stream', async () => {
		const k = await key();
		const body = randomBytes(RECORD_SIZE * 3 + 12345);
		const { stream } = await encryptStream(k, req, { op: 'x' }, streamOf(body, 33333));
		const cipher = await collect(stream);
		const out = await decryptStream(k, req, streamOf(cipher, 4096));
		expect(await collect(out.body)).toEqual(body);
	});

	it('round-trips a body that is an exact multiple of the record size', async () => {
		const k = await key();
		const body = randomBytes(RECORD_SIZE * 2);
		const { bytes } = await encryptToBytes(k, req, {}, body);
		const out = await decryptStream(k, req, streamOf(bytes, 65536));
		expect(await collect(out.body)).toEqual(body);
	});

	it('rejects a tampered record', async () => {
		const k = await key();
		const { bytes } = await encryptToBytes(k, req, {}, randomBytes(RECORD_SIZE + 10));
		bytes[bytes.length - 5] ^= 1;
		const out = await decryptStream(k, req, streamOf(bytes));
		await expectStreamError(collect(out.body), 'decrypt');
	});

	it('rejects a truncated stream (final record dropped)', async () => {
		const k = await key();
		const { bytes } = await encryptToBytes(k, req, {}, randomBytes(RECORD_SIZE + 10));
		const cut = bytes.slice(0, bytes.length - (4 + 10 + 16));
		const out = await decryptStream(k, req, streamOf(cut));
		await expectStreamError(collect(out.body), 'truncated');
	});

	it('rejects data appended after the final record', async () => {
		const k = await key();
		const { bytes } = await encryptToBytes(k, req, {}, randomBytes(100));
		const out = await decryptStream(k, req, streamOf(concat([bytes, bytes.slice(24, 60)])));
		await expectStreamError(collect(out.body), 'format');
	});

	it('rejects the wrong key', async () => {
		const { bytes } = await encryptToBytes(await key(), req, {});
		await expectStreamError(decryptStream(await key(), req, streamOf(bytes)), 'decrypt');
	});

	it('binds a stream to its share id', async () => {
		const k = await key();
		const { bytes } = await encryptToBytes(k, req, {});
		await expectStreamError(decryptStream(k, { ...req, shareId: 'other00000' }, streamOf(bytes)), 'decrypt');
	});

	it('binds a response to the request it answers', async () => {
		const k = await key();
		const a = randomBytes(16);
		const b = randomBytes(16);
		const { bytes } = await encryptToBytes(k, { kind: 'res', shareId: req.shareId, bind: a }, { status: 200 });
		const ok = await decryptStream(k, { kind: 'res', shareId: req.shareId, bind: a }, streamOf(bytes));
		expect(ok.head).toEqual({ status: 200 });
		await expectStreamError(
			decryptStream(k, { kind: 'res', shareId: req.shareId, bind: b }, streamOf(bytes)),
			'decrypt'
		);
	});

	it('rejects a request stream presented as a response', async () => {
		const k = await key();
		const { bytes } = await encryptToBytes(k, req, {});
		await expectStreamError(
			decryptStream(k, { kind: 'res', shareId: req.shareId, bind: randomBytes(16) }, streamOf(bytes)),
			'format'
		);
	});

	it('enforces a body size limit', async () => {
		const k = await key();
		const { bytes } = await encryptToBytes(k, req, {}, randomBytes(RECORD_SIZE * 2));
		const out = await decryptStream(k, req, streamOf(bytes), { maxBody: RECORD_SIZE });
		await expectStreamError(collect(out.body), 'too_large');
	});

	it('rejects garbage', async () => {
		await expectStreamError(decryptStream(await key(), req, streamOf(randomBytes(100))), 'format');
		await expectStreamError(decryptStream(await key(), req, streamOf(new Uint8Array(0))), 'truncated');
	});
});

describe('links', () => {
	it('puts the key in the fragment and reads it back', () => {
		const k = generateShareKey();
		const link = shareLink('https://shrim.pics/', 'Xk3f9QaPz2', k);
		expect(link).toMatch(/^https:\/\/shrim\.pics\/s\/Xk3f9QaPz2#[A-Za-z0-9_-]{43}$/);
		expect(keyFromFragment(new URL(link).hash)).toEqual(k);
	});

	it('rejects bad fragments', () => {
		expect(keyFromFragment('')).toBeNull();
		expect(keyFromFragment('#')).toBeNull();
		expect(keyFromFragment('#abc')).toBeNull();
		expect(keyFromFragment('#' + '!'.repeat(43))).toBeNull();
	});

	it('parses Immich links and ignores the host', () => {
		const key = 'mn6DA8Ta4p6Vate8hyKZVmitlhOQ9x1Um8opQ0UCAWNvA-Sy-NR_2iBICUelpqAIE1U';
		expect(parseImmichLink(`https://photos.example.com/share/${key}`)).toEqual({ key });
		expect(parseImmichLink(`http://192.168.1.10:2283/share/${key}?x=1`)).toEqual({ key });
		expect(parseImmichLink(`  ${key}  `)).toEqual({ key });
		expect(parseImmichLink('https://photos.example.com/s/lisbon-2026')).toEqual({ slug: 'lisbon-2026' });
		expect(parseImmichLink('https://photos.example.com/albums/123')).toBeNull();
		expect(parseImmichLink('not a link')).toBeNull();
	});
});

describe('easy id', async () => {
	const { EASY_ID_EMOJI, easyId } = await import('../src/index.ts');

	it('uses 64 distinct emoji, each a single code point', () => {
		expect(new Set(EASY_ID_EMOJI).size).toBe(64);
		for (const e of EASY_ID_EMOJI) expect([...e].length).toBe(1);
	});

	it('is stable and spreads ids across the pairs', () => {
		expect(easyId('Xk3f9QaPz2')).toBe(easyId('Xk3f9QaPz2'));
		expect([...easyId('Xk3f9QaPz2')].length).toBe(2);
		const pairs = new Set(Array.from({ length: 2000 }, (_, i) => easyId(`id${i}x${i * 7}`)));
		// 2000 random ids over 4096 pairs: expect ~1600 distinct if the hash spreads well.
		expect(pairs.size).toBeGreaterThan(1450);
	});
});

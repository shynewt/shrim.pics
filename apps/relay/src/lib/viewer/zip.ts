/**
 * A tiny streaming zip writer (no compression: photos already are). Uses
 * data descriptors, so each file can be written as it arrives. Plain zip,
 * not zip64: stops at 4 GB.
 */

const CRC_TABLE = (() => {
	const t = new Uint32Array(256);
	for (let n = 0; n < 256; n++) {
		let c = n;
		for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
		t[n] = c >>> 0;
	}
	return t;
})();

export function crc32(data: Uint8Array, crc = 0): number {
	let c = ~crc >>> 0;
	for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8);
	return ~c >>> 0;
}

export const ZIP_LIMIT = 0xffffffff;

export class ZipTooLarge extends Error {}

function dosTime(d: Date) {
	const time = (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2);
	const date = ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate();
	return { time, date };
}

interface Entry {
	name: Uint8Array;
	crc: number;
	size: number;
	offset: number;
	time: number;
	date: number;
}

/** Feed it files one at a time; it hands out the bytes to write, in order. */
export class ZipWriter {
	#entries: Entry[] = [];
	#offset = 0;
	#names = new Set<string>();
	#write: (chunk: Uint8Array) => Promise<void>;

	constructor(write: (chunk: Uint8Array) => Promise<void>) {
		this.#write = write;
	}

	get size() {
		return this.#offset;
	}

	/** Makes names unique: "IMG_1.jpg", "IMG_1 (2).jpg"… */
	#unique(name: string): string {
		const clean = name.replace(/[\\/:*?"<>|\p{Cc}]/gu, '_').slice(0, 200) || 'file';
		let candidate = clean;
		for (let i = 2; this.#names.has(candidate.toLowerCase()); i++) {
			const dot = clean.lastIndexOf('.');
			candidate = dot > 0 ? `${clean.slice(0, dot)} (${i})${clean.slice(dot)}` : `${clean} (${i})`;
		}
		this.#names.add(candidate.toLowerCase());
		return candidate;
	}

	async #out(bytes: Uint8Array) {
		if (this.#offset + bytes.length > ZIP_LIMIT) throw new ZipTooLarge();
		await this.#write(bytes);
		this.#offset += bytes.length;
	}

	async add(name: string, data: Uint8Array, modified = new Date()) {
		const nameBytes = new TextEncoder().encode(this.#unique(name));
		const { time, date } = dosTime(modified);
		const offset = this.#offset;
		const header = new DataView(new ArrayBuffer(30));
		header.setUint32(0, 0x04034b50, true);
		header.setUint16(4, 20, true); // version needed
		header.setUint16(6, 0x0808, true); // data descriptor + UTF-8 names
		header.setUint16(8, 0, true); // stored
		header.setUint16(10, time, true);
		header.setUint16(12, date, true);
		header.setUint16(26, nameBytes.length, true);
		await this.#out(new Uint8Array(header.buffer));
		await this.#out(nameBytes);
		await this.#out(data);
		const crc = crc32(data);
		const desc = new DataView(new ArrayBuffer(16));
		desc.setUint32(0, 0x08074b50, true);
		desc.setUint32(4, crc, true);
		desc.setUint32(8, data.length, true);
		desc.setUint32(12, data.length, true);
		await this.#out(new Uint8Array(desc.buffer));
		this.#entries.push({ name: nameBytes, crc, size: data.length, offset, time, date });
	}

	async finish() {
		const start = this.#offset;
		for (const e of this.#entries) {
			const h = new DataView(new ArrayBuffer(46));
			h.setUint32(0, 0x02014b50, true);
			h.setUint16(4, 20, true);
			h.setUint16(6, 20, true);
			h.setUint16(8, 0x0808, true);
			h.setUint16(10, 0, true);
			h.setUint16(12, e.time, true);
			h.setUint16(14, e.date, true);
			h.setUint32(16, e.crc, true);
			h.setUint32(20, e.size, true);
			h.setUint32(24, e.size, true);
			h.setUint16(28, e.name.length, true);
			h.setUint32(42, e.offset, true);
			await this.#out(new Uint8Array(h.buffer));
			await this.#out(e.name);
		}
		const end = new DataView(new ArrayBuffer(22));
		end.setUint32(0, 0x06054b50, true);
		end.setUint16(8, this.#entries.length, true);
		end.setUint16(10, this.#entries.length, true);
		end.setUint32(12, this.#offset - start, true);
		end.setUint32(16, start, true);
		await this.#out(new Uint8Array(end.buffer));
	}
}

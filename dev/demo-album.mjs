// Builds the relay's example album ("Spring in Seville") into apps/relay/demo, sized like Immich's
// thumbnails and previews. The relay answers /s/<demo id> with these, encrypted, like an agent would.
//
// Usage: node dev/demo-album.mjs <dir with plaza-de-espana.jpg, plaza-tower.jpg, …>
// The sources are the Unsplash photos listed in apps/relay/demo/CREDITS.txt.
// Needs ImageMagick 7: `magick` if it's installed, otherwise it runs in podman (or docker).
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';

const src = process.argv[2] && resolve(process.argv[2]);
if (!src) {
	console.error('Usage: node dev/demo-album.mjs <dir-with-photos>');
	process.exit(1);
}
const out = resolve(import.meta.dirname, '../apps/relay/demo');
const require = createRequire(join(import.meta.dirname, '../apps/relay/package.json'));
const { rgbaToThumbHash } = await import(require.resolve('thumbhash'));

// Made-up EXIF, written the way the agent formats Immich's, so the info panel looks like a real album's.
const XT5 = { camera: 'FUJIFILM X-T5', lens: 'XF16-55mmF2.8 R LM WR' };
const IPHONE = { camera: 'Apple iPhone 15 Pro', lens: 'iPhone 15 Pro back triple camera 6.765mm f/1.78' };
const phone = (/** @type {string} */ shutter, /** @type {number} */ iso) =>
	`f/1.78 · ${shutter} s · 6.765 mm · ISO ${iso}`;

/** Three days, newest first in the album like Immich shows it. */
/** @type {Record<string, [name: string, gear: { camera: string, lens: string }, exposure: string][]>} */
const DAYS = {
	18: [
		['plaza-de-espana', XT5, 'f/8 · 1/400 s · 16 mm · ISO 125'],
		['plaza-tower', XT5, 'f/8 · 1/500 s · 35 mm · ISO 125'],
		['plaza-arches', XT5, 'f/5.6 · 1/250 s · 23 mm · ISO 160'],
		['plaza-tiles', IPHONE, phone('1/120', 64)],
		['plaza-canal', XT5, 'f/7.1 · 1/320 s · 18 mm · ISO 125'],
		['gallery', XT5, 'f/4 · 1/125 s · 16 mm · ISO 400'],
		['flamenco', XT5, 'f/2.8 · 1/160 s · 55 mm · ISO 3200'],
		['tapas', IPHONE, phone('1/60', 400)]
	],
	17: [
		['cathedral-arch', XT5, 'f/8 · 1/250 s · 21 mm · ISO 160'],
		['cathedral-tram', XT5, 'f/5.6 · 1/640 s · 48 mm · ISO 125'],
		['sierpes', IPHONE, phone('1/250', 50)],
		['santa-cruz', XT5, 'f/4 · 1/125 s · 27 mm · ISO 250'],
		['orange-trees', XT5, 'f/2.8 · 1/1000 s · 55 mm · ISO 125'],
		['jamon', IPHONE, phone('1/100', 160)],
		['jamon-plate', IPHONE, phone('1/60', 250)],
		['dinner', IPHONE, phone('1/30', 1000)]
	],
	16: [
		['triana', XT5, 'f/8 · 1/320 s · 23 mm · ISO 125'],
		['market', IPHONE, phone('1/60', 320)],
		['olives', IPHONE, phone('1/120', 100)],
		['peacock', XT5, 'f/4 · 1/500 s · 55 mm · ISO 200'],
		['salmorejo', IPHONE, phone('1/100', 125)]
	]
};

/** @param {string[]} args */
function magick(args) {
	const dirs = [src, out];
	/** @type {[string, string[]][]} */
	const tools = [
		['magick', []],
		...['podman', 'docker'].map(
			(cmd) =>
				/** @type {[string, string[]]} */ ([
					cmd,
					['run', '--rm', ...dirs.flatMap((d) => ['-v', `${d}:${d}:z`]), 'docker.io/dpokidov/imagemagick:latest']
				])
		)
	];
	for (const [cmd, pre] of tools) {
		try {
			return execFileSync(cmd, [...pre, ...args], { maxBuffer: 64 * 1024 * 1024 });
		} catch (e) {
			if (/** @type {NodeJS.ErrnoException} */ (e).code !== 'ENOENT') throw e;
		}
	}
	throw new Error('ImageMagick not found: install it, or podman or docker.');
}

/** A stable UUID per photo, shaped like Immich's asset ids. @param {string} name */
function uuid(name) {
	const h = createHash('sha256').update(`shrim demo ${name}`).digest('hex');
	const variant = ((parseInt(h[16], 16) & 3) | 8).toString(16);
	return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-${variant}${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

rmSync(out + '/thumbs', { recursive: true, force: true });
rmSync(out + '/previews', { recursive: true, force: true });
mkdirSync(out + '/thumbs', { recursive: true });
mkdirSync(out + '/previews', { recursive: true });

const assets = [];
for (const [day, photos] of Object.entries(DAYS).sort(([a], [b]) => Number(b) - Number(a))) {
	for (const [i, [name, gear, exposure]] of photos.entries()) {
		const file = join(src, `${name}.jpg`);
		const preview = join(out, 'previews', `${name}.webp`);
		const webp = ['-strip', '-define', 'webp:method=6'];
		magick([file, '-auto-orient', '-resize', '1440x1440>', ...webp, '-quality', '70', preview]);
		magick([
			file,
			'-auto-orient',
			'-resize',
			'250x250^',
			...webp,
			'-quality',
			'72',
			join(out, 'thumbs', `${name}.webp`)
		]);
		const [width, height] = magick(['identify', '-format', '%w %h', preview]).toString().split(' ').map(Number);
		// Thumbhashes are made from at most 100 × 100 pixels.
		const small = magick([
			preview,
			'-resize',
			'100x100',
			'-format',
			'%w %h\n',
			'-write',
			'info:-',
			'-depth',
			'8',
			'RGBA:-'
		]);
		const nl = small.indexOf(10);
		const [w, h] = small.subarray(0, nl).toString().split(' ').map(Number);
		const hash = rgbaToThumbHash(w, h, small.subarray(nl + 1));
		assets.push({
			id: uuid(name),
			name,
			takenAt: `2026-04-${day}T${pad(18 - i)}:${pad(50 - i * 4)}:00`,
			width,
			height,
			thumbhash: Buffer.from(hash).toString('base64'),
			...gear,
			exposure
		});
		console.log(name, width, height);
	}
}

const album = {
	title: 'Spring in Seville',
	description: 'Orange trees, tiled plazas, tapas and a lot of walking.',
	place: 'Seville, Spain',
	assets
};
writeFileSync(join(out, 'album.json'), JSON.stringify(album, null, '\t') + '\n');
console.log(`${assets.length} photos written to ${out}`);

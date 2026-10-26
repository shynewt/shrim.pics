// Builds the relay's example album ("Spring in Seville") into apps/relay/demo, sized like Immich's
// thumbnails and previews. The relay answers /s/<demo id> with these, encrypted, like an agent would.
//
// Usage: node dev/demo-album.mjs <dir with plaza-de-espana.jpg, giralda.jpg, …>
// The sources are the public domain photos listed in apps/relay/demo/CREDITS.txt.
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

/** Real camera details from each photo's page on Wikimedia Commons, where it had any. */
const sony = 'SONY DSLR-A550';
/** @type {Record<string, [name: string, camera?: string | null, exposure?: string | null][]>} */
const DAYS = {
	18: [
		['plaza-de-espana'],
		['giralda', sony, 'f/8 · 1/125 s · 28 mm · ISO 200'],
		['tapas', null, 'f/1.85 · 1/522 s · 6.81 mm · ISO 43'],
		['las-setas'],
		['alcazar-fountain', 'SONY DSC-RX100M3', 'f/5.6 · 1/400 s · 8.8 mm · ISO 125'],
		['triana', sony, 'f/11 · 1/125 s · 18 mm · ISO 200'],
		['tiled-steps', sony, 'f/13 · 1/40 s · 45 mm · ISO 200'],
		['flamenco']
	],
	17: [
		['plaza-bridge', 'NIKON CORPORATION NIKON D70', 'f/8 · 1/80 s · 31 mm'],
		['santa-cruz', 'Apple iPhone SE (2nd generation)', 'f/1.8 · 1/121 s · 3.99 mm · ISO 25'],
		['orange-trees', sony, 'f/11 · 1/100 s · 30 mm · ISO 200'],
		['cafe-street', 'NIKON CORPORATION NIKON D5500', 'f/3.5 · 1/100 s · 35 mm · ISO 160'],
		['tapas-board']
	],
	16: [
		['plaza-tower'],
		['cathedral', sony, 'f/8 · 1/160 s · 35 mm · ISO 200'],
		['puerta-del-leon', sony, 'f/8 · 1/125 s · 30 mm · ISO 200'],
		['patio-doncellas', 'NIKON CORPORATION NIKON D5100', 'f/8 · 1/250 s · 18 mm · ISO 200'],
		['guadalquivir', 'SONY DSC-RX100M3', 'f/5.6 · 1/400 s · 25.7 mm · ISO 125']
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
	for (const [i, [name, camera, exposure]] of photos.entries()) {
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
			...(camera ? { camera } : {}),
			...(exposure ? { exposure } : {})
		});
		console.log(name, width, height);
	}
}

const album = {
	title: 'Spring in Seville',
	description: 'Orange blossom, tiled courtyards, tapas and a lot of walking.',
	place: 'Seville, Spain',
	assets
};
writeFileSync(join(out, 'album.json'), JSON.stringify(album, null, '\t') + '\n');
console.log(`${assets.length} photos written to ${out}`);

import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	// Workspace packages ship TypeScript source; let Vite compile them on the server too.
	ssr: { noExternal: ['@shrim/protocol', '@shrim/ui'] },
	// One Svelte runtime for the app and the shared components, or their events go nowhere.
	resolve: { dedupe: ['svelte'] },
	plugins: [
		// Utilities from our own tokens only: packages/ui/src/app.css.
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) => (filename.split(/[/\\]/).includes('node_modules') ? undefined : true)
			},
			adapter: adapter(),
			// The admin UI runs on the LAN and only talks to itself.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'blob:', 'data:'],
					'media-src': ['self'],
					'connect-src': ['self'],
					'font-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['none'],
					'form-action': ['self'],
					'frame-ancestors': ['none']
				}
			}
		})
	]
});

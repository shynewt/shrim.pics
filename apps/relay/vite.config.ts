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
			// The service worker only streams viewer videos. The viewer registers it (scope /s/) when a
			// video opens, so the rest of the site never installs it.
			serviceWorker: { register: false },
			// The viewer decrypts in the browser, so the code it runs must be exactly ours:
			// no third-party scripts, no external requests of any kind.
			csp: {
				mode: 'auto',
				directives: {
					'default-src': ['self'],
					'script-src': ['self'],
					'style-src': ['self', 'unsafe-inline'],
					'img-src': ['self', 'blob:', 'data:'],
					'media-src': ['self', 'blob:'],
					'connect-src': ['self'],
					'font-src': ['self'],
					'object-src': ['none'],
					'base-uri': ['none'],
					// Subscribe and Manage billing post here, then go on to Stripe's own pages.
					'form-action': ['self', 'https://checkout.stripe.com', 'https://billing.stripe.com'],
					'frame-ancestors': ['none']
				}
			}
		})
	]
});

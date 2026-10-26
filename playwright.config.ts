import { join } from 'node:path';
import { defineConfig, devices } from '@playwright/test';

/**
 * Starts its own relay (:5273) and agent (:5274) with throwaway data, so a run never touches
 * your dev servers. Set E2E_RELAY_URL / E2E_AGENT_URL to test something already running instead.
 */
const external = !!process.env.E2E_RELAY_URL;
const data = join(import.meta.dirname, 'e2e', '.out', 'data');

export default defineConfig({
	testDir: 'e2e',
	timeout: 90_000,
	expect: { timeout: 15_000 },
	fullyParallel: false,
	workers: 1,
	reporter: [['list']],
	outputDir: 'e2e/.out/results',
	use: {
		trace: 'retain-on-failure',
		screenshot: 'only-on-failure'
	},
	projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 860 } } }],
	webServer: external
		? undefined
		: [
				{
					command: `rm -rf '${join(data, 'relay')}' && pnpm --filter @shrim/relay exec vite dev --port 5273 --strictPort`,
					url: 'http://localhost:5273',
					reuseExistingServer: false,
					timeout: 120_000,
					env: {
						SHRIM_BILLING: 'dev',
						SHRIM_DATA_DIR: join(data, 'relay'),
						SHRIM_ADMIN_EMAILS: 'admin@shrim.test',
						// Emails go to Mailpit (dev/mail), if it's running; e2e/accounts.spec.ts reads them there.
						SMTP_HOST: 'localhost',
						SMTP_PORT: '1025',
						MAIL_FROM: 'shrim.pics <hello@shrim.test>'
					}
				},
				{
					command: `rm -rf '${join(data, 'agent')}' && pnpm --filter @shrim/agent exec vite dev --port 5274 --strictPort`,
					url: 'http://localhost:5274',
					reuseExistingServer: false,
					timeout: 120_000,
					env: {
						IMMICH_URL: process.env.IMMICH_URL ?? 'http://localhost:2283',
						SHRIM_RELAY_URL: 'http://localhost:5273',
						DATA_DIR: join(data, 'agent')
					}
				}
			]
});

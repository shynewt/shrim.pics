import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const env = process.env;

export type BillingMode = 'off' | 'dev' | 'stripe';

function billing(): BillingMode {
	const v = env.SHRIM_BILLING ?? 'off';
	if (v === 'off' || v === 'dev' || v === 'stripe') return v;
	throw new Error(`SHRIM_BILLING must be off, dev or stripe (got "${v}")`);
}

function onOff(name: string, fallback: 'on' | 'off'): boolean {
	const v = env[name] || fallback;
	if (v === 'on' || v === 'off') return v === 'on';
	throw new Error(`${name} must be on or off (got "${v}")`);
}

/**
 * A secret from `<name>_FILE` (a file, e.g. a mounted Docker secret) or `<name>`. Setting both
 * is an error, as is a file we can't read. One trailing newline is dropped. Empty counts as unset.
 */
export function secret(
	name: string,
	vars: NodeJS.ProcessEnv = env,
	read: (path: string) => string = (path) => readFileSync(path, 'utf8')
): string {
	const path = vars[`${name}_FILE`];
	if (!path) return vars[name] ?? '';
	if (vars[name]) throw new Error(`Set either ${name} or ${name}_FILE, not both`);
	try {
		return read(path).replace(/\r?\n$/, '');
	} catch (e) {
		// Name the file and why, never what is in it.
		const why = (e as NodeJS.ErrnoException).code ?? 'unreadable';
		throw new Error(`${name}_FILE (${path}) could not be read: ${why}`, { cause: e });
	}
}

export const config = {
	dataDir: resolve(env.SHRIM_DATA_DIR ?? '.data'),
	/** Public origin used to build share links, e.g. https://shrim.pics. Falls back to the request origin. */
	publicOrigin: env.SHRIM_PUBLIC_ORIGIN?.replace(/\/$/, '') || null,
	billing: billing(),
	price: env.SHRIM_PRICE ?? '',
	signups: (env.SHRIM_SIGNUPS ?? 'open') as 'open' | 'closed',
	/** The example album at a fixed link, answered by the relay itself (see lib/server/demo). */
	demo: onOff('SHRIM_DEMO', 'on'),
	adminEmails: (env.SHRIM_ADMIN_EMAILS ?? '')
		.split(',')
		.map((s) => s.trim().toLowerCase())
		.filter(Boolean),
	/** Seconds an agent has to start answering a request. */
	requestTimeout: Number(env.SHRIM_REQUEST_TIMEOUT ?? 20),
	maxPendingPerAgent: Number(env.SHRIM_MAX_PENDING ?? 48),
	stripe: {
		secretKey: secret('STRIPE_SECRET_KEY'),
		webhookSecret: secret('STRIPE_WEBHOOK_SECRET'),
		/** The yearly recurring price, e.g. price_123. */
		priceId: env.STRIPE_PRICE_ID ?? '',
		/** Let Stripe Tax work out VAT. Needs Stripe Tax set up in the dashboard. */
		automaticTax: env.STRIPE_AUTOMATIC_TAX === 'true',
		/** Ask buyers to accept the terms in Checkout. Needs a terms URL in Stripe's public details. */
		requireTerms: env.STRIPE_REQUIRE_TERMS === 'true',
		/** Only for tests against stripe-mock, e.g. http://localhost:12111 */
		apiBase: env.STRIPE_API_BASE ?? ''
	},
	backupDir: env.SHRIM_BACKUP_DIR ?? '',
	/** Outgoing email (password resets). Off when SMTP_HOST is empty. */
	mail: {
		host: env.SMTP_HOST ?? '',
		port: Number(env.SMTP_PORT || 587),
		user: env.SMTP_USER ?? '',
		password: secret('SMTP_PASSWORD'),
		/** true: TLS from the start (usually port 465). Otherwise STARTTLS, required unless the host is local. */
		secure: env.SMTP_SECURE === 'true',
		/** e.g. "Photos <photos@example.com>". Defaults to SMTP_USER. */
		from: env.MAIL_FROM || env.SMTP_USER || ''
	},
	/** Who runs this relay. Shown in the terms, privacy policy and legal notice. */
	operator: {
		name: env.SHRIM_OPERATOR_NAME ?? '',
		address: env.SHRIM_OPERATOR_ADDRESS ?? '',
		email: env.SHRIM_OPERATOR_EMAIL ?? '',
		/** Company number, VAT number… one line. Optional for individuals. */
		registration: env.SHRIM_OPERATOR_REGISTRATION ?? '',
		/** The country whose law governs the terms, e.g. "France". */
		country: env.SHRIM_OPERATOR_COUNTRY ?? '',
		/** Required in France ("directeur de la publication"). */
		publicationDirector: env.SHRIM_PUBLICATION_DIRECTOR ?? '',
		/** Consumer mediator, "Name, https://…". Required in some countries (e.g. France). */
		mediator: env.SHRIM_CONSUMER_MEDIATOR ?? '',
		/** Who sends our emails, for the privacy policy, e.g. "Example Mail Ltd, Dublin, Ireland". */
		mailProvider: env.SHRIM_MAIL_PROVIDER ?? '',
		hosting: env.SHRIM_HOSTING ?? '',
		/** Where the server runs, for the landing page, e.g. "France" or "the EU". */
		region: env.SHRIM_HOSTING_REGION ?? '',
		/** The data protection authority you answer to, e.g. "CNIL (cnil.fr)". */
		authority: env.SHRIM_DATA_AUTHORITY ?? '',
		termsDate: env.SHRIM_TERMS_DATE ?? ''
	},
	secureCookies: env.SHRIM_SECURE_COOKIES
		? env.SHRIM_SECURE_COOKIES === 'true'
		: !!env.SHRIM_PUBLIC_ORIGIN?.startsWith('https:')
};

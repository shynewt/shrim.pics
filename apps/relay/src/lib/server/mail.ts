/**
 * No tracking, no images, nothing loaded from elsewhere.
 * Without SMTP_HOST nothing is sent: printed to the console in development, unavailable in production.
 */
import { createTransport, type Transporter } from 'nodemailer';
import { dev } from '$app/env';
import { config } from './config.ts';

export interface Email {
	to: string;
	subject: string;
	text: string;
	html: string;
}

export const mailAvailable = () => !!config.mail.host || dev;

const LOCAL = /^(localhost|127\.\d+\.\d+\.\d+|::1|host\.containers\.internal|host\.docker\.internal|mailpit)$/;

let transport: Transporter | undefined;
function smtp(): Transporter {
	const { host, port, user, password, secure } = config.mail;
	return (transport ??= createTransport({
		host,
		port,
		secure,
		// Never send passwords or reset links in the clear, except to a test server on this machine.
		requireTLS: !secure && !LOCAL.test(host),
		auth: user ? { user, pass: password } : undefined,
		connectionTimeout: 15_000,
		greetingTimeout: 15_000,
		socketTimeout: 30_000
	}));
}

export async function sendMail(email: Email): Promise<void> {
	if (!config.mail.host) {
		if (dev) console.warn(`\n[mail] To: ${email.to}\n[mail] Subject: ${email.subject}\n\n${email.text}\n`);
		else console.warn(`[mail] SMTP_HOST isn't set, not sending "${email.subject}"`);
		return;
	}
	await smtp().sendMail({ from: config.mail.from, ...email });
}

/** Sends in the background, so the answer takes the same time whether or not an email goes out. */
export function sendLater(email: Email) {
	sendMail(email).catch((e: unknown) => console.error('[mail] sending failed:', e instanceof Error ? e.message : e));
}

const escape = (s: string) =>
	s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function html(paragraphs: string[]): string {
	const body = paragraphs
		.map((p) =>
			/^https?:\/\/\S+$/.test(p)
				? `<p><a href="${escape(p)}">${escape(p)}</a></p>`
				: `<p>${escape(p).replaceAll('\n', '<br>')}</p>`
		)
		.join('\n');
	return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="font-family: system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif; font-size: 16px; line-height: 1.5; max-width: 560px;">
${body}
</body></html>`;
}

function email(to: string, subject: string, paragraphs: string[]): Email {
	return { to, subject, text: paragraphs.join('\n\n') + '\n', html: html(paragraphs) };
}

const site = (origin: string) => new URL(origin).host;

export function resetEmail(to: string, origin: string, token: string): Email {
	const name = site(origin);
	return email(to, `Reset your ${name} password`, [
		'Hi,',
		`Someone asked to reset the password of your ${name} account. If that was you, open this link to choose a new one:`,
		`${origin}/reset?token=${encodeURIComponent(token)}`,
		'The link works once, in the next hour.',
		"If it wasn't you, ignore this email. Your password stays as it is.",
		name
	]);
}

export function passwordChangedEmail(to: string, origin: string): Email {
	const name = site(origin);
	const help = config.operator.email ? ` and write to ${config.operator.email}` : '';
	return email(to, `Your ${name} password was changed`, [
		'Hi,',
		`The password of your ${name} account was just changed, and every device that was signed in was signed out.`,
		"If that was you, there's nothing else to do.",
		`If it wasn't, choose a new password right away${help}:`,
		`${origin}/forgot`,
		name
	]);
}

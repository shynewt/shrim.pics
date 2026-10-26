/**
 * Emails the relay sent, read from Mailpit (dev/mail), and the operator's sign-in,
 * which needs one: a listed address confirms itself before it sees /admin.
 */
import { expect, type Browser, type Page } from '@playwright/test';

export const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
export const OPERATOR = { email: 'admin@shrim.test', password: 'operator-password' };

interface MailSummary {
	ID: string;
	Subject: string;
}
export interface Mail extends MailSummary {
	From: { Name: string; Address: string };
	Text: string;
	HTML: string;
}

export const mailpitUp = () =>
	fetch(`${MAILPIT}/api/v1/info`).then(
		(r) => r.ok,
		() => false
	);

export async function mails(to: string): Promise<MailSummary[]> {
	const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
	return ((await res.json()) as { messages: MailSummary[] }).messages;
}

/** How many emails to `to` have a matching subject so far. */
export const count = async (to: string, subject: RegExp) =>
	(await mails(to)).filter((m) => subject.test(m.Subject)).length;

/** Waits until there are more than `seen` matching emails to `to`, and returns the newest in full. */
export async function waitForMail(to: string, subject: RegExp, seen = 0): Promise<Mail> {
	for (let i = 0; i < 75; i++) {
		const found = (await mails(to)).filter((m) => subject.test(m.Subject)); // newest first
		if (found.length > seen) return (await (await fetch(`${MAILPIT}/api/v1/message/${found[0].ID}`)).json()) as Mail;
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`No new email to ${to} matching ${subject}`);
}

const CONFIRM = /^Confirm you run /;

/** A new page signed in as the operator, making the account on a fresh relay and confirming its address. */
export async function operatorPage(browser: Browser, relay: string): Promise<Page> {
	const page = await (await browser.newContext()).newPage();
	await page.goto(`${relay}/login`);
	await page.getByLabel('Email').fill(OPERATOR.email);
	await page.getByLabel('Password', { exact: true }).fill(OPERATOR.password);
	await page.getByRole('button', { name: 'Sign in' }).click();
	const mismatch = page.getByText("That email and password don't match");
	await Promise.race([page.waitForURL(/\/dashboard$/), mismatch.waitFor()]);
	if (await mismatch.isVisible()) {
		await page.goto(`${relay}/signup`);
		await page.getByLabel('Email').fill(OPERATOR.email);
		await page.getByLabel('Password', { exact: true }).fill(OPERATOR.password);
		await page.getByRole('button', { name: 'Create account' }).click();
		await expect(page).toHaveURL(/\/dashboard$/);
	}

	await page.goto(`${relay}/admin`);
	if (new URL(page.url()).pathname === '/admin/confirm') {
		// Ask for a fresh link: one sent at sign-up may belong to an older run.
		const seen = await count(OPERATOR.email, CONFIRM);
		await page.getByRole('button', { name: 'Send a new link' }).click();
		await expect(page.getByText("We've sent a new link")).toBeVisible();
		const link = (await waitForMail(OPERATOR.email, CONFIRM, seen)).Text.match(
			/https?:\/\/\S+\/admin\/confirm\?token=[\w-]+/
		);
		expect(link).not.toBeNull();
		await page.goto(link![0]);
		await page.getByRole('button', { name: 'Confirm' }).click();
		await expect(page).toHaveURL(/\/admin$/);
	}
	await page.waitForLoadState('networkidle');
	return page;
}

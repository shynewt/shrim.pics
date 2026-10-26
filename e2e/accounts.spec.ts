/**
 * Accounts, without Immich or an agent: forgot password → email → reset,
 * and the operator's account lookup (search, suspend, unsuspend).
 *
 * Needs Mailpit (dev/mail) on MAILPIT_URL, and a relay sending to it
 * (SMTP_HOST=localhost SMTP_PORT=1025). Skipped when Mailpit isn't running.
 * A run asks /forgot twice; the relay allows 5 per address, then one every
 * 2 minutes, so restart a long-running relay if you rerun it many times.
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Browser, type Page } from '@playwright/test';

const RELAY = process.env.E2E_RELAY_URL ?? 'http://localhost:5273';
const MAILPIT = process.env.MAILPIT_URL ?? 'http://localhost:8025';
const SHOTS = join(import.meta.dirname, '.out', 'screens');

const run = Date.now();
const owner = { email: `forgetful-${run}@shrim.test`, password: 'the-first-password', next: 'the-second-password' };
const operator = { email: 'admin@shrim.test', password: 'operator-password' };
let resetLink = '';
/** A fresh link sent by the operator, for the screenshots. */
let operatorLink = '';
const RESET = /^Reset your .+ password$/;

interface MailSummary {
	ID: string;
	Subject: string;
}
interface Mail extends MailSummary {
	From: { Name: string; Address: string };
	Text: string;
	HTML: string;
}

async function mails(to: string): Promise<MailSummary[]> {
	const res = await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`to:"${to}"`)}`);
	return ((await res.json()) as { messages: MailSummary[] }).messages;
}

/** How many emails to `to` have a matching subject so far. */
const count = async (to: string, subject: RegExp) => (await mails(to)).filter((m) => subject.test(m.Subject)).length;

/** Waits until there are more than `seen` matching emails to `to`, and returns the newest in full. */
async function waitForMail(to: string, subject: RegExp, seen = 0): Promise<Mail> {
	for (let i = 0; i < 75; i++) {
		const found = (await mails(to)).filter((m) => subject.test(m.Subject)); // newest first
		if (found.length > seen) return (await (await fetch(`${MAILPIT}/api/v1/message/${found[0].ID}`)).json()) as Mail;
		await new Promise((r) => setTimeout(r, 200));
	}
	throw new Error(`No new email to ${to} matching ${subject}`);
}

const linkIn = (mail: Mail) => mail.Text.match(/https?:\/\/\S+\/reset\?token=[\w-]+/)?.[0] ?? '';

async function open(page: Page, url: string) {
	await page.goto(url);
	await page.waitForLoadState('networkidle');
}

async function signIn(page: Page, email: string, password: string) {
	await open(page, `${RELAY}/login`);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Sign in' }).click();
}

async function signUp(page: Page, email: string, password: string) {
	await open(page, `${RELAY}/signup`);
	await page.getByLabel('Email').fill(email);
	await page.getByLabel('Password', { exact: true }).fill(password);
	await page.getByRole('button', { name: 'Create account' }).click();
	await expect(page).toHaveURL(/\/dashboard$/);
}

/** Signs in as the operator, making the account on a fresh relay. */
async function operatorPage(browser: Browser): Promise<Page> {
	const page = await (await browser.newContext()).newPage();
	await signIn(page, operator.email, operator.password);
	const mismatch = page.getByText("That email and password don't match");
	await Promise.race([page.waitForURL(/\/dashboard$/), mismatch.waitFor()]);
	if (await mismatch.isVisible()) await signUp(page, operator.email, operator.password);
	return page;
}

test.describe.configure({ mode: 'serial' });

test.beforeAll(async () => {
	mkdirSync(SHOTS, { recursive: true });
	const up = await fetch(`${MAILPIT}/api/v1/info`).then(
		(r) => r.ok,
		() => false
	);
	test.skip(!up, `Mailpit isn't running on ${MAILPIT} (cd dev/mail && docker compose up -d)`);
});

test('someone who forgot their password gets a link by email and chooses a new one', async ({ page, browser }) => {
	// Signed in on one device…
	await signUp(page, owner.email, owner.password);

	// …and forgot the password on another.
	const other = await (await browser.newContext()).newPage();
	await open(other, `${RELAY}/login`);
	await other.getByRole('link', { name: 'Forgot password?' }).click();
	await expect(other.getByRole('heading', { name: 'Forgot your password?' })).toBeVisible();
	await other.getByLabel('Email').fill(owner.email.toUpperCase());
	await other.getByRole('button', { name: 'Send reset link' }).click();
	await expect(other.getByRole('heading', { name: 'Check your email' })).toBeVisible();
	await expect(other.getByText(`If there's an account for ${owner.email.toUpperCase()}`)).toBeVisible();

	const mail = await waitForMail(owner.email, RESET);
	expect(mail.From.Address).toBe('hello@shrim.test');
	expect(mail.HTML).not.toMatch(/<img|src=/);
	resetLink = linkIn(mail);
	expect(resetLink).toContain('/reset?token=');

	await open(other, resetLink);
	await expect(other.getByRole('heading', { name: 'Choose a new password' })).toBeVisible();
	await expect(other.getByText(owner.email)).toBeVisible();
	await other.getByLabel('New password').fill('too-short');
	await other.getByRole('button', { name: 'Save new password' }).click();
	await expect(other.getByText('Use at least 10 characters.').last()).toBeVisible();
	await other.getByLabel('New password').fill(owner.next);
	await other.getByRole('button', { name: 'Save new password' }).click();
	await expect(other).toHaveURL(/\/dashboard$/);
	await expect(other.getByText('Password changed')).toBeVisible();

	// Every other session is signed out.
	await open(page, `${RELAY}/dashboard`);
	await expect(page).toHaveURL(/\/login/);

	// The old password is gone, the new one works.
	await signIn(page, owner.email, owner.password);
	await expect(page.getByText("That email and password don't match")).toBeVisible();
	await signIn(page, owner.email, owner.next);
	await expect(page).toHaveURL(/\/dashboard$/);

	// And they hear about it.
	const notice = await waitForMail(owner.email, /password was changed$/);
	expect(notice.Text).toContain('/forgot');
	await other.context().close();
});

test('a used or made-up reset link says so and offers a new one', async ({ page }) => {
	for (const link of [resetLink, `${RELAY}/reset?token=not-a-real-token`, `${RELAY}/reset`]) {
		await open(page, link);
		await expect(page.getByRole('heading', { name: 'This link has expired' })).toBeVisible();
	}
	await page.getByRole('link', { name: 'Get a new link' }).click();
	await expect(page).toHaveURL(/\/forgot$/);
});

test('asking for an address without an account looks the same, and sends nothing', async ({ page }) => {
	const nobody = `nobody-${run}@shrim.test`;
	await open(page, `${RELAY}/forgot`);
	await page.getByLabel('Email').fill(nobody);
	await page.getByRole('button', { name: 'Send reset link' }).click();
	await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();
	await page.waitForTimeout(1500);
	expect(await mails(nobody)).toEqual([]);
});

test('the operator finds an account, suspends it and lifts the suspension', async ({ page, browser }) => {
	// Not for anyone else.
	await signIn(page, owner.email, owner.next);
	await expect(page).toHaveURL(/\/dashboard$/);
	expect((await page.goto(`${RELAY}/admin/accounts`))?.status()).toBe(404);

	const admin = await operatorPage(browser);
	await open(admin, `${RELAY}/admin`);
	await admin.getByRole('searchbox').fill(`forgetful-${run}`);
	await admin.getByRole('button', { name: 'Search' }).click();
	await expect(admin).toHaveURL(new RegExp(`/admin/accounts\\?q=forgetful-${run}`));
	await expect(admin.getByRole('heading', { name: '1 match' })).toBeVisible();
	await admin.getByRole('link', { name: owner.email }).click();
	await expect(admin.getByRole('heading', { name: owner.email })).toBeVisible();
	await expect(admin.getByText('No share links', { exact: true })).toBeVisible();

	await admin.getByRole('button', { name: 'Suspend…' }).click();
	const dialog = admin.getByRole('dialog', { name: 'Suspend this account?' });
	await expect(dialog.getByRole('button', { name: 'Cancel' })).toBeFocused();
	await dialog.getByRole('button', { name: 'Suspend account' }).click();
	await expect(admin.getByText('Account suspended').first()).toBeVisible();
	await expect(dialog).toBeHidden();
	await expect(admin.getByText('Suspended', { exact: true }).first()).toBeVisible();

	// Shows in the list too.
	await admin.getByRole('link', { name: 'Accounts' }).click();
	await expect(admin.locator('li', { hasText: owner.email }).getByText('Suspended')).toBeVisible();
	await admin.getByRole('link', { name: owner.email }).click();

	await admin.getByRole('button', { name: 'Unsuspend' }).click();
	await expect(admin.getByText('Account unsuspended').first()).toBeVisible();
	await expect(admin.getByRole('button', { name: 'Suspend…' })).toBeVisible();

	// The operator can send a reset email too.
	const before = await count(owner.email, RESET);
	await admin.getByRole('button', { name: 'Send reset email' }).click();
	await expect(admin.getByText(`Reset email sent to ${owner.email}`).first()).toBeVisible();
	operatorLink = linkIn(await waitForMail(owner.email, RESET, before));
	expect(operatorLink).not.toBe(resetLink);
	await admin.context().close();
});

test('screens: forgot, reset and the accounts pages, light and dark, desktop and phone', async ({ browser }) => {
	// /forgot is rate-limited per address, so this reuses the operator's link instead of asking again.
	const link = operatorLink;
	expect(link).toContain('/reset?token=');
	const guest = await (await browser.newContext()).newPage();
	const admin = await operatorPage(browser);
	await open(admin, `${RELAY}/admin/accounts?q=${encodeURIComponent(owner.email)}`);
	const detail = await admin.getByRole('link', { name: owner.email }).getAttribute('href');

	const sizes = [
		{ name: 'desktop', width: 1280, height: 860 },
		{ name: 'phone', width: 390, height: 844 }
	];
	for (const scheme of ['light', 'dark'] as const) {
		for (const size of sizes) {
			for (const p of [admin, guest]) {
				await p.setViewportSize(size);
				await p.emulateMedia({ colorScheme: scheme });
			}
			const shot = (p: Page, name: string) =>
				p.screenshot({ path: join(SHOTS, `accounts-${name}-${scheme}-${size.name}.png`), fullPage: true });
			await open(guest, `${RELAY}/forgot`);
			await shot(guest, 'forgot');
			await open(guest, link);
			await shot(guest, 'reset');
			await open(guest, `${RELAY}/reset?token=expired`);
			await shot(guest, 'reset-expired');
			await open(admin, `${RELAY}/admin/accounts`);
			await shot(admin, 'list');
			await open(admin, `${RELAY}${detail}`);
			await shot(admin, 'detail');
		}
	}
	await guest.context().close();
	await admin.context().close();
});

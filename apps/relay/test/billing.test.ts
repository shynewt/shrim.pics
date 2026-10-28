/**
 * Billing against stripe-mock (docker run -p 12111:12111 stripe/stripe-mock)
 * plus hand-built subscriptions for the state changes we care about.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { isRedirect } from '@sveltejs/kit';
import Stripe from 'stripe';
import { beforeAll, describe, expect, it } from 'vitest';

process.env.SHRIM_DATA_DIR = mkdtempSync(join(tmpdir(), 'shrim-billing-'));
process.env.SHRIM_BILLING = 'stripe';
process.env.STRIPE_SECRET_KEY = 'sk_test_123';
process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret';
process.env.STRIPE_PRICE_ID = 'price_123';
process.env.STRIPE_API_BASE = process.env.STRIPE_MOCK_URL ?? 'http://localhost:12111';

const accounts = await import('../src/lib/server/accounts.ts');
const billing = await import('../src/lib/server/billing.ts');
const { db } = await import('../src/lib/server/db.ts');

const DAY = 86_400_000;
const signer = new Stripe('sk_test_123');

function subscription(
	over: Partial<Stripe.Subscription> & { periodEnd: number; accountId?: string }
): Stripe.Subscription {
	const { periodEnd, accountId, ...rest } = over;
	return {
		id: 'sub_1',
		object: 'subscription',
		customer: 'cus_1',
		status: 'active',
		cancel_at_period_end: false,
		ended_at: null,
		metadata: accountId ? { account_id: accountId } : {},
		items: { object: 'list', data: [{ current_period_end: Math.floor(periodEnd / 1000) }], has_more: false, url: '' },
		...rest
	} as unknown as Stripe.Subscription;
}

let account: Awaited<ReturnType<typeof accounts.createAccount>>;
const view = () => billing.planView(accounts.toAccount(accounts.accountById(account.id)!));

beforeAll(async () => {
	account = await accounts.createAccount('billing@shrim.test', 'a-long-enough-password');
});

describe('plan state follows the subscription', () => {
	it('starts with no plan', () => {
		expect(view().status).toBe('none');
		expect(accounts.toAccount(accounts.accountById(account.id)!).active).toBe(false);
	});

	it('activates on an active subscription, found by metadata the first time', () => {
		const end = Date.now() + 365 * DAY;
		billing.applySubscription(subscription({ periodEnd: end, accountId: account.id }));
		const row = accounts.accountById(account.id)!;
		expect(row.stripe_customer_id).toBe('cus_1');
		expect(accounts.toAccount(row).active).toBe(true);
		expect(view()).toMatchObject({ status: 'active', manageable: true });
		// shows the real period end, not the grace
		expect(Math.abs(view().activeUntil! - end)).toBeLessThan(1000);
	});

	it('shows "ending" when cancelled at period end, and stays active', () => {
		billing.applySubscription(subscription({ periodEnd: Date.now() + 100 * DAY, cancel_at_period_end: true }));
		expect(view().status).toBe('ending');
		expect(accounts.toAccount(accounts.accountById(account.id)!).active).toBe(true);
	});

	it('keeps links working during a failed renewal (past_due), then stops when cancelled', () => {
		billing.applySubscription(subscription({ periodEnd: Date.now() + DAY, status: 'past_due' }));
		expect(view().status).toBe('past_due');
		expect(accounts.toAccount(accounts.accountById(account.id)!).active).toBe(true);

		billing.applySubscription(
			subscription({ periodEnd: Date.now() - DAY, status: 'canceled', ended_at: Math.floor(Date.now() / 1000) - 10 })
		);
		expect(view().status).toBe('ended');
		expect(accounts.toAccount(accounts.accountById(account.id)!).active).toBe(false);
	});
});

describe('webhooks', () => {
	it('accepts a correctly signed event and rejects a forged one', () => {
		const payload = JSON.stringify({ id: 'evt_1', object: 'event', type: 'ping', data: { object: {} } });
		const header = signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_test_secret' });
		expect(billing.verifyWebhook(payload, header).id).toBe('evt_1');
		const forged = signer.webhooks.generateTestHeaderString({ payload, secret: 'whsec_wrong' });
		expect(() => billing.verifyWebhook(payload, forged)).toThrow();
		expect(() => billing.verifyWebhook(payload, null)).toThrow();
	});

	it('handles each event once', async () => {
		const event = { id: 'evt_once', type: 'ping', data: { object: {} } } as unknown as Stripe.Event;
		await billing.handleEvent(event);
		await billing.handleEvent(event);
		const n = db.prepare("SELECT COUNT(*) AS n FROM stripe_events WHERE id = 'evt_once'").get() as { n: number };
		expect(n.n).toBe(1);
	});
});

describe('checkout and portal (stripe-mock)', () => {
	it('makes a Checkout link for someone without a plan', async () => {
		const fresh = await accounts.createAccount('new@shrim.test', 'a-long-enough-password');
		const url = await billing.checkoutUrl(accounts.toAccount(fresh), 'https://shrim.pics');
		expect(url).toMatch(/^https:\/\//);
	});

	it('sends a subscribed account to the billing portal instead of buying twice', async () => {
		billing.applySubscription(subscription({ periodEnd: Date.now() + 300 * DAY }));
		const url = await billing.portalUrl(accounts.toAccount(accounts.accountById(account.id)!), 'https://shrim.pics');
		expect(url).toMatch(/^https:\/\//);
	});

	it('lets the dashboard redirect to Checkout and the billing portal', async () => {
		const { actions } = await import('../src/routes/dashboard/+page.server.ts');
		const target = async (action: 'checkout' | 'portal', id: string) => {
			const event = {
				locals: { account: accounts.toAccount(accounts.accountById(id)!) },
				url: new URL('https://shrim.pics/dashboard')
			};
			try {
				await actions[action](event as never);
			} catch (e) {
				if (isRedirect(e)) return e.location;
				throw e;
			}
			throw new Error(`${action} did not redirect`);
		};
		const fresh = await accounts.createAccount('redirect@shrim.test', 'a-long-enough-password');
		expect(await target('checkout', fresh.id)).toMatch(/^https:\/\//);

		const subscribed = await accounts.createAccount('redirect-paid@shrim.test', 'a-long-enough-password');
		billing.applySubscription(
			subscription({
				id: 'sub_redirect',
				customer: 'cus_redirect',
				accountId: subscribed.id,
				periodEnd: Date.now() + 300 * DAY
			})
		);
		expect(await target('portal', subscribed.id)).toMatch(/^https:\/\//);
	});
});

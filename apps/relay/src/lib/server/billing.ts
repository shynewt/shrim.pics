/**
 * Stripe is the source of truth. An account is active while `active_until`
 * is in the future; we set it to the end of the paid period plus a short
 * grace, so a renewal that takes a moment never switches links off.
 */
import Stripe from 'stripe';
import { accountById, type Account } from './accounts.ts';
import { config } from './config.ts';
import { db, type AccountRow } from './db.ts';
import { notifyAccountChanged } from './router.ts';

const GRACE_MS = 3 * 86_400_000;
/** While Stripe retries a failed renewal, links keep working this long. */
const RETRY_GRACE_MS = 14 * 86_400_000;
/** The promise at Checkout: a full refund within 14 days of paying. */
const REFUND_MS = 14 * 86_400_000;

let client: Stripe | null = null;

export function stripeEnabled() {
	return config.billing === 'stripe';
}

function stripe(): Stripe {
	if (client) return client;
	const { secretKey, apiBase } = config.stripe;
	if (!secretKey) throw new Error('STRIPE_SECRET_KEY is not set');
	const options: Stripe.StripeConfig = { maxNetworkRetries: 2, timeout: 20_000, appInfo: { name: 'shrim.pics' } };
	if (apiBase) {
		const u = new URL(apiBase);
		Object.assign(options, { host: u.hostname, port: Number(u.port), protocol: u.protocol.replace(':', '') });
	}
	client = new Stripe(secretKey, options);
	return client;
}

/** Fails fast at startup if billing is on but not configured. */
export function checkBillingConfig() {
	if (!stripeEnabled()) return;
	const required = {
		STRIPE_SECRET_KEY: config.stripe.secretKey,
		STRIPE_WEBHOOK_SECRET: config.stripe.webhookSecret,
		STRIPE_PRICE_ID: config.stripe.priceId,
		// Shown on the landing page, the dashboard and in the terms.
		SHRIM_PRICE: config.price
	};
	const missing = Object.keys(required).filter((k) => !required[k as keyof typeof required]);
	if (missing.length) throw new Error(`SHRIM_BILLING=stripe needs ${missing.join(', ')}`);
}

function row(accountId: string): AccountRow {
	const r = accountById(accountId);
	if (!r) throw new Error('No such account');
	return r;
}

/** A plan that is paid up, or in its renewal grace. */
const LIVE = new Set(['active', 'trialing', 'past_due']);

export interface PlanView {
	status: 'none' | 'active' | 'ending' | 'past_due' | 'ended';
	activeUntil: number | null;
	manageable: boolean;
	/** Until when the owner can cancel and get their money back from the dashboard. */
	refundUntil: number | null;
}

export function planView(account: Account): PlanView {
	const r = row(account.id);
	const until = r.active_until;
	const live = until !== null && until > Date.now();
	let status: PlanView['status'] = 'none';
	if (r.plan_status === 'past_due' && live) status = 'past_due';
	else if (live && r.plan_cancel_at_period_end) status = 'ending';
	else if (live) status = 'active';
	else if (until !== null) status = 'ended';
	// Show the real period end, not the grace we add on top.
	const grace = r.plan_status === 'past_due' ? RETRY_GRACE_MS : GRACE_MS;
	const shown = until !== null && r.stripe_subscription_id ? until - grace : until;
	const refundEnd = r.plan_period_start === null ? null : r.plan_period_start + REFUND_MS;
	const refundable =
		(status === 'active' || status === 'ending') && r.refunded_at === null && !!refundEnd && refundEnd > Date.now();
	return { status, activeUntil: shown, manageable: !!r.stripe_customer_id, refundUntil: refundable ? refundEnd : null };
}

export async function checkoutUrl(account: Account, origin: string): Promise<string> {
	const r = row(account.id);
	// Already subscribed: send them to manage it instead of buying twice.
	if (r.stripe_subscription_id && LIVE.has(r.plan_status ?? '')) return portalUrl(account, origin);

	const { priceId, automaticTax, requireTerms } = config.stripe;
	const session = await stripe().checkout.sessions.create({
		mode: 'subscription',
		line_items: [{ price: priceId, quantity: 1 }],
		client_reference_id: account.id,
		metadata: { account_id: account.id },
		subscription_data: { metadata: { account_id: account.id } },
		...(r.stripe_customer_id
			? { customer: r.stripe_customer_id, ...(automaticTax ? { customer_update: { address: 'auto' as const } } : {}) }
			: { customer_email: account.email }),
		success_url: `${origin}/dashboard?checkout={CHECKOUT_SESSION_ID}`,
		cancel_url: `${origin}/dashboard?checkout=cancelled`,
		allow_promotion_codes: true,
		automatic_tax: { enabled: automaticTax },
		billing_address_collection: automaticTax ? 'required' : 'auto',
		...(requireTerms ? { consent_collection: { terms_of_service: 'required' as const } } : {}),
		custom_text: {
			submit: { message: 'Cancel any time. Changed your mind? Get a full refund from your dashboard within 14 days.' }
		}
	});
	if (!session.url) throw new Error('Stripe returned no checkout URL');
	// One open Checkout per account: paying in two tabs would make two subscriptions.
	if (r.checkout_session_id)
		await stripe()
			.checkout.sessions.expire(r.checkout_session_id)
			.catch(() => {});
	db.prepare('UPDATE accounts SET checkout_session_id = ? WHERE id = ?').run(session.id, account.id);
	return session.url;
}

export async function portalUrl(account: Account, origin: string): Promise<string> {
	const customer = row(account.id).stripe_customer_id;
	if (!customer) throw new Error('No billing account yet');
	const session = await stripe().billingPortal.sessions.create({ customer, return_url: `${origin}/dashboard` });
	return session.url;
}

function periodEnd(sub: Stripe.Subscription): number | null {
	const ends = sub.items.data.map((i) => i.current_period_end).filter((n): n is number => typeof n === 'number');
	return ends.length ? Math.max(...ends) * 1000 : null;
}

function periodStart(sub: Stripe.Subscription): number | null {
	const starts = sub.items.data.map((i) => i.current_period_start).filter((n): n is number => typeof n === 'number');
	return starts.length ? Math.min(...starts) * 1000 : null;
}

function accountFor(sub: Stripe.Subscription): AccountRow | undefined {
	const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
	const byCustomer = db.prepare('SELECT * FROM accounts WHERE stripe_customer_id = ?').get(customer) as
		AccountRow | undefined;
	if (byCustomer) return byCustomer;
	const id = sub.metadata?.account_id;
	return id ? accountById(id) : undefined;
}

export function applySubscription(sub: Stripe.Subscription) {
	const account = accountFor(sub);
	if (!account) {
		console.warn(`[billing] no account for subscription ${sub.id}`);
		return;
	}
	// Stripe doesn't promise order: a late event for a replaced subscription mustn't end the new one.
	const replaced = account.stripe_subscription_id !== null && account.stripe_subscription_id !== sub.id;
	if (replaced && !LIVE.has(sub.status) && LIVE.has(account.plan_status ?? '')) return;
	if (replaced && LIVE.has(sub.status) && LIVE.has(account.plan_status ?? ''))
		console.warn(
			`[billing] account ${account.id} has two live subscriptions: ${account.stripe_subscription_id}, ${sub.id}`
		);
	const customer = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;
	// newer API versions (and the portal) cancel by setting cancel_at, not cancel_at_period_end
	const ending = sub.cancel_at_period_end || sub.cancel_at !== null;
	const period = periodEnd(sub);
	const end = sub.cancel_at && period ? Math.min(period, sub.cancel_at * 1000) : period;
	let activeUntil: number | null;
	if (sub.status === 'past_due' && end) activeUntil = end + RETRY_GRACE_MS;
	else if (LIVE.has(sub.status) && end) activeUntil = end + GRACE_MS;
	else if (sub.status === 'canceled') activeUntil = (sub.ended_at ?? Math.floor(Date.now() / 1000)) * 1000;
	else activeUntil = Math.min(account.active_until ?? 0, Date.now()) || null;

	db.prepare(
		`UPDATE accounts SET stripe_customer_id = ?, stripe_subscription_id = ?, plan_status = ?,
		 plan_cancel_at_period_end = ?, plan_period_start = ?, active_until = ? WHERE id = ?`
	).run(customer, sub.id, sub.status, ending ? 1 : 0, periodStart(sub), activeUntil, account.id);
	notifyAccountChanged(account.id);
}

/** After Checkout returns, sync straight away instead of waiting for the webhook. */
export async function syncCheckout(sessionId: string, accountId: string): Promise<boolean> {
	if (!/^cs_[A-Za-z0-9_]+$/.test(sessionId)) return false;
	const session = await stripe().checkout.sessions.retrieve(sessionId, { expand: ['subscription'] });
	if (session.client_reference_id !== accountId) return false;
	const sub = session.subscription;
	if (!sub || typeof sub === 'string') return false;
	if (session.customer) {
		const customer = typeof session.customer === 'string' ? session.customer : session.customer.id;
		db.prepare('UPDATE accounts SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL').run(
			customer,
			accountId
		);
	}
	applySubscription(sub);
	return LIVE.has(sub.status);
}

export function verifyWebhook(payload: string, signature: string | null): Stripe.Event {
	if (!signature) throw new Error('Missing Stripe-Signature');
	return stripe().webhooks.constructEvent(payload, signature, config.stripe.webhookSecret);
}

/** Safe to call twice for the same event. */
export async function handleEvent(event: Stripe.Event) {
	if (db.prepare('SELECT 1 FROM stripe_events WHERE id = ?').get(event.id)) return;

	switch (event.type) {
		case 'checkout.session.completed': {
			const session = event.data.object;
			const accountId = session.client_reference_id;
			const customer = typeof session.customer === 'string' ? session.customer : session.customer?.id;
			if (accountId && customer) {
				db.prepare('UPDATE accounts SET stripe_customer_id = ? WHERE id = ? AND stripe_customer_id IS NULL').run(
					customer,
					accountId
				);
			}
			const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;
			if (subId) applySubscription(await stripe().subscriptions.retrieve(subId));
			break;
		}
		case 'customer.subscription.created':
		case 'customer.subscription.updated':
		case 'customer.subscription.deleted':
		case 'customer.subscription.paused':
		case 'customer.subscription.resumed':
			// Fetch the latest state: events can arrive out of order.
			applySubscription(await stripe().subscriptions.retrieve(event.data.object.id));
			break;
		case 'charge.refunded':
			await endRefundedPlan(event.data.object);
			break;
		case 'invoice.paid':
		case 'invoice.payment_failed': {
			const parent = event.data.object.parent;
			const subId = parent?.subscription_details?.subscription;
			const id = typeof subId === 'string' ? subId : subId?.id;
			if (id) applySubscription(await stripe().subscriptions.retrieve(id));
			break;
		}
		default:
			// We don't subscribe to others, and don't need them.
			break;
	}
	// Only remember it once it worked, so Stripe's retries get another go.
	db.prepare('INSERT OR IGNORE INTO stripe_events (id, received_at) VALUES (?, ?)').run(event.id, Date.now());
}

/** The latest invoice's payment, if it was paid recently enough to refund. Expects `latest_invoice.payments` expanded. */
export function refundablePayment(sub: Stripe.Subscription, now = Date.now()) {
	const invoice = sub.latest_invoice;
	if (!LIVE.has(sub.status) || !invoice || typeof invoice === 'string') return null;
	if (invoice.status !== 'paid' || invoice.amount_paid <= 0) return null;
	const paidAt = invoice.status_transitions.paid_at;
	if (!paidAt || paidAt * 1000 + REFUND_MS < now) return null;
	const pi = invoice.payments?.data.find((p) => p.status === 'paid')?.payment.payment_intent;
	if (!pi) return null;
	return { invoiceId: invoice.id, paymentIntent: typeof pi === 'string' ? pi : pi.id };
}

/** Refunds the latest payment in full and ends the plan now. Once per account. */
export async function refundAndCancel(accountId: string): Promise<'refunded' | 'not_eligible'> {
	const r = row(accountId);
	if (!r.stripe_subscription_id || r.refunded_at !== null) return 'not_eligible';
	const sub = await stripe().subscriptions.retrieve(r.stripe_subscription_id, { expand: ['latest_invoice.payments'] });
	const payment = refundablePayment(sub);
	if (!payment) return 'not_eligible';

	// Claimed before calling Stripe, so a double submit can't refund twice.
	const claim = db.prepare('UPDATE accounts SET refunded_at = ? WHERE id = ? AND refunded_at IS NULL');
	if (claim.run(Date.now(), accountId).changes === 0) return 'not_eligible';
	try {
		await stripe().refunds.create(
			{ payment_intent: payment.paymentIntent, metadata: { account_id: accountId } },
			{ idempotencyKey: `refund-${payment.invoiceId}` }
		);
	} catch (e) {
		db.prepare('UPDATE accounts SET refunded_at = NULL WHERE id = ?').run(accountId);
		throw e;
	}
	await cancelNow(sub.id);
	return 'refunded';
}

/** Ends a subscription now. The refund webhook and the dashboard can race to it; losing is fine. */
async function cancelNow(subscriptionId: string) {
	try {
		applySubscription(await stripe().subscriptions.cancel(subscriptionId));
	} catch (e) {
		const sub = await stripe().subscriptions.retrieve(subscriptionId);
		if (LIVE.has(sub.status)) throw e;
		applySubscription(sub);
	}
}

/** A full refund of the latest payment ends the plan, wherever it was made (here, or in Stripe's dashboard). */
async function endRefundedPlan(charge: Stripe.Charge) {
	// partial refunds are goodwill, the plan carries on
	if (!charge.refunded) return;
	const paymentIntent = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
	if (!paymentIntent) return;
	const payments = await stripe().invoicePayments.list({
		payment: { type: 'payment_intent', payment_intent: paymentIntent },
		status: 'paid'
	});
	for (const payment of payments.data) {
		const invoiceId = typeof payment.invoice === 'string' ? payment.invoice : payment.invoice.id;
		if (!invoiceId) continue;
		const invoice = await stripe().invoices.retrieve(invoiceId);
		const subId = invoice.parent?.subscription_details?.subscription;
		const id = typeof subId === 'string' ? subId : subId?.id;
		if (!id) continue;
		const sub = await stripe().subscriptions.retrieve(id);
		const latest = typeof sub.latest_invoice === 'string' ? sub.latest_invoice : sub.latest_invoice?.id;
		// refunding an earlier year doesn't take away the one they're in
		if (latest !== invoiceId || !LIVE.has(sub.status)) continue;
		const account = accountFor(sub);
		if (account)
			db.prepare('UPDATE accounts SET refunded_at = ? WHERE id = ? AND refunded_at IS NULL').run(
				Date.now(),
				account.id
			);
		await cancelNow(sub.id);
	}
}

export async function cancelForDeletion(accountId: string) {
	const r = accountById(accountId);
	if (!r?.stripe_subscription_id || !stripeEnabled()) return;
	if (!LIVE.has(r.plan_status ?? '')) return;
	await stripe().subscriptions.cancel(r.stripe_subscription_id);
}

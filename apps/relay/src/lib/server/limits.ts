/** Small in-memory token buckets. Good enough for one relay process. */

interface Bucket {
	tokens: number;
	at: number;
}

export class RateLimiter {
	#buckets = new Map<string, Bucket>();

	constructor(
		private capacity: number,
		private perSecond: number
	) {}

	take(key: string, cost = 1): boolean {
		const now = Date.now();
		const b = this.#buckets.get(key) ?? { tokens: this.capacity, at: now };
		b.tokens = Math.min(this.capacity, b.tokens + ((now - b.at) / 1000) * this.perSecond);
		b.at = now;
		this.#buckets.set(key, b);
		if (this.#buckets.size > 50_000) this.#sweep(now);
		if (b.tokens < cost) return false;
		b.tokens -= cost;
		return true;
	}

	#sweep(now: number) {
		for (const [k, b] of this.#buckets) {
			if (now - b.at > 10 * 60_000) this.#buckets.delete(k);
		}
	}
}

const fresh = {
	/** Viewer requests per IP: thumbnails come in bursts. */
	viewer: new RateLimiter(400, 60),
	/** Sign-in, sign-up and reports per IP. */
	auth: new RateLimiter(10, 0.2),
	reports: new RateLimiter(5, 0.01),
	/** "Forgot password" per IP: 5, then one every 2 minutes. */
	forgot: new RateLimiter(5, 1 / 120),
	/** Reset emails per address: 3, then one every 15 minutes. */
	resetMail: new RateLimiter(3, 1 / 900)
};
// Kept across dev reloads; limiters added since the last reload join in.
const g = globalThis as unknown as { __shrimLimits?: Partial<typeof fresh> };
export const limits: typeof fresh = (g.__shrimLimits = { ...fresh, ...g.__shrimLimits });

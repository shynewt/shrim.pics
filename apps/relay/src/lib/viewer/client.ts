/**
 * Talks to the owner's agent through the relay. Every request is encrypted
 * here and every response decrypted here, with the key from the link.
 */
import {
	collect,
	decryptStream,
	encryptToBytes,
	fromUtf8,
	type AssetInfo,
	type RelayErrorCode,
	type RequestHead,
	type ResponseHead
} from '@shrim/protocol';

export class RelayFailure extends Error {
	constructor(
		public code: RelayErrorCode | 'network',
		public status: number
	) {
		super(code);
	}
}

export class AgentFailure extends Error {
	constructor(public head: ResponseHead) {
		super(head.error ?? `status ${head.status}`);
	}
}

/** Runs at most `limit` tasks at once. Urgent tasks jump the queue. */
export class Queue {
	#active = 0;
	#waiting: Array<() => void> = [];
	constructor(private limit: number) {}

	async run<T>(task: () => Promise<T>, urgent = false): Promise<T> {
		if (this.#active >= this.limit) {
			await new Promise<void>((resolve) => (urgent ? this.#waiting.unshift(resolve) : this.#waiting.push(resolve)));
		}
		this.#active++;
		try {
			return await task();
		} finally {
			this.#active--;
			this.#waiting.shift()?.();
		}
	}
}

export class ShareClient {
	readonly queue = new Queue(6);
	#info = new Map<string, Promise<AssetInfo>>();

	constructor(
		readonly id: string,
		private key: CryptoKey
	) {}

	async #seal(head: RequestHead, body?: Uint8Array<ArrayBuffer>) {
		return encryptToBytes(this.key, { kind: 'req', shareId: this.id }, head, body);
	}

	async #open(salt: Uint8Array<ArrayBuffer>, body: ReadableStream<Uint8Array>) {
		return decryptStream<ResponseHead>(this.key, { kind: 'res', shareId: this.id, bind: salt }, body);
	}

	async send(head: RequestHead, body?: Uint8Array<ArrayBuffer>, signal?: AbortSignal) {
		const { salt, bytes } = await this.#seal(head, body);
		let res: Response;
		try {
			res = await fetch(`/api/v1/s/${this.id}`, {
				method: 'POST',
				body: bytes,
				headers: { 'content-type': 'application/octet-stream' },
				signal
			});
		} catch (e) {
			if (signal?.aborted) throw e;
			throw new RelayFailure('network', 0);
		}
		if (!res.ok || !res.body) {
			const j = (await res.json().catch(() => ({}))) as { error?: RelayErrorCode };
			throw new RelayFailure(j.error ?? 'bad_request', res.status);
		}
		return this.#open(salt, res.body);
	}

	async json<T>(head: RequestHead, body?: Uint8Array<ArrayBuffer>, signal?: AbortSignal): Promise<T> {
		const r = await this.send(head, body, signal);
		if (r.head.status !== 200) {
			await r.body.cancel().catch(() => {});
			throw new AgentFailure(r.head);
		}
		return JSON.parse(fromUtf8(await collect(r.body))) as T;
	}

	/** Photo details, fetched once per asset. */
	info(asset: string): Promise<AssetInfo> {
		let p = this.#info.get(asset);
		if (!p) {
			p = this.json<AssetInfo>({ op: 'info', asset });
			p.catch(() => this.#info.delete(asset));
			this.#info.set(asset, p);
		}
		return p;
	}

	/** Fetches a file and returns it as a Blob, reporting progress (0–1) when the size is known. */
	async blob(
		head: RequestHead,
		{ onProgress, signal }: { onProgress?: (p: number) => void; signal?: AbortSignal } = {}
	): Promise<{ blob: Blob; head: ResponseHead }> {
		const r = await this.send(head, undefined, signal);
		if (r.head.status !== 200) {
			await r.body.cancel().catch(() => {});
			throw new AgentFailure(r.head);
		}
		const parts: Uint8Array<ArrayBuffer>[] = [];
		let got = 0;
		const reader = r.body.getReader();
		for (;;) {
			const { value, done } = await reader.read();
			if (done) break;
			parts.push(value);
			got += value.length;
			if (r.head.size) onProgress?.(Math.min(1, got / r.head.size));
		}
		return { blob: new Blob(parts, { type: r.head.type ?? 'application/octet-stream' }), head: r.head };
	}

	/** Encrypts a request ahead of time, so the next upload part is ready while this one sends. */
	prepare(head: RequestHead, body: Uint8Array<ArrayBuffer>) {
		return this.#seal(head, body);
	}

	/** Sends one prepared request with XHR, for upload progress. */
	async sendWithProgress<T>(
		prepared: { salt: Uint8Array<ArrayBuffer>; bytes: Uint8Array<ArrayBuffer> },
		onProgress: (p: number) => void,
		signal?: AbortSignal
	): Promise<T> {
		const { salt, bytes } = prepared;
		const res = await new Promise<{ status: number; body: ArrayBuffer }>((resolve, reject) => {
			if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
			const xhr = new XMLHttpRequest();
			xhr.open('POST', `/api/v1/s/${this.id}`);
			xhr.responseType = 'arraybuffer';
			xhr.setRequestHeader('content-type', 'application/octet-stream');
			xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
			xhr.onload = () => resolve({ status: xhr.status, body: xhr.response as ArrayBuffer });
			xhr.onerror = () => reject(new RelayFailure('network', 0));
			xhr.onabort = () => reject(new DOMException('Aborted', 'AbortError'));
			signal?.addEventListener('abort', () => xhr.abort(), { once: true });
			xhr.send(bytes);
		});
		if (res.status !== 200) {
			let code: RelayErrorCode = 'bad_request';
			try {
				code = (JSON.parse(new TextDecoder().decode(res.body)) as { error: RelayErrorCode }).error ?? code;
			} catch {
				// not JSON
			}
			throw new RelayFailure(code, res.status);
		}
		const stream = new Blob([res.body]).stream();
		const r = await this.#open(salt, stream);
		if (r.head.status !== 200) throw new AgentFailure(r.head);
		return JSON.parse(fromUtf8(await collect(r.body))) as T;
	}
}

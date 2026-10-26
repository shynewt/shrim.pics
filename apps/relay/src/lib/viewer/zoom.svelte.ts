/**
 * Coordinates are CSS pixels relative to the centre of the photo's frame.
 * The photo is drawn with `translate(x, y) scale(s)` around that centre.
 */

export const MAX_ZOOM = 5;
/** Where a double tap or double click goes. */
export const TAP_ZOOM = 2.5;
/** Keyboard + / - step. */
export const KEY_STEP = 1.5;

export interface Point {
	x: number;
	y: number;
}
export interface Size {
	w: number;
	h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/** Keeps a pointer's moves coming to the stage even when it leaves it. Best effort. */
function capture(el: HTMLElement, pointerId: number) {
	try {
		el.setPointerCapture(pointerId);
	} catch {
		// The pointer is already gone.
	}
}

export class Zoom {
	scale = $state(1);
	x = $state(0);
	y = $state(0);
	/** The last change was a jump (double tap, keys), so it animates. Gestures follow the fingers directly. */
	animated = $state(false);

	readonly zoomed = $derived(this.scale > 1.001);
	readonly transform = $derived(
		this.zoomed ? `translate3d(${this.x}px, ${this.y}px, 0) scale(${this.scale})` : undefined
	);

	/** The frame the photo sits in, and the photo's size in it at scale 1. */
	#measure: () => { frame: Size; content: Size };

	constructor(measure: () => { frame: Size; content: Size }) {
		this.#measure = measure;
	}

	/** Sets a transform, kept so the photo always covers the frame where it can (no dragging it off screen). */
	set(scale: number, x: number, y: number, animated = false) {
		const s = clamp(scale, 1, MAX_ZOOM);
		const { frame, content } = this.#measure();
		const bx = Math.max(0, (content.w * s - frame.w) / 2);
		const by = Math.max(0, (content.h * s - frame.h) / 2);
		const [ns, nx, ny] = s <= 1.001 ? [1, 0, 0] : [s, clamp(x, -bx, bx), clamp(y, -by, by)];
		// Only a real change animates: otherwise no transition would end to clear the flag.
		this.animated = animated && (ns !== this.scale || nx !== this.x || ny !== this.y);
		this.scale = ns;
		this.x = nx;
		this.y = ny;
	}

	/** Zooms to `scale`, keeping the point of the photo under `at` where it is. */
	zoomTo(scale: number, at: Point = { x: 0, y: 0 }, animated = false) {
		const s = clamp(scale, 1, MAX_ZOOM);
		const k = s / this.scale;
		this.set(s, at.x - (at.x - this.x) * k, at.y - (at.y - this.y) * k, animated);
	}

	/** Double tap or double click: in to TAP_ZOOM at that point, or back out. */
	toggle(at: Point) {
		if (this.zoomed) this.set(1, 0, 0, true);
		else this.zoomTo(TAP_ZOOM, at, true);
	}

	reset(animated = false) {
		this.set(1, 0, 0, animated);
	}
}

export interface GestureHost {
	/** The current photo's zoom, or null when the item can't zoom (videos). */
	zoom(): Zoom | null;
	/** The frame's centre, in client coordinates. */
	centre(): Point;
	/** Swipe feedback: how far the photo follows the finger sideways. */
	drag(dx: number): void;
	swipe(direction: 1 | -1): void;
	close(): void;
	/** A single tap (after waiting to see that it isn't a double tap). */
	tap(): void;
	/** Any zoom change by the user. */
	zooming(): void;
	/** A zoom gesture ended (fingers up, wheel stopped, animation done). */
	settled(): void;
}

const TAP_SLOP = 10;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_SLOP = 40;

type Mode = 'idle' | 'swipe' | 'pan' | 'pinch';

/** Turns pointer events on the stage into swipes, taps and zoom changes. */
export class Gestures {
	/** True while fingers or the mouse are moving the photo (the stage hints the compositor). */
	active = $state(false);

	#host: GestureHost;
	// Bookkeeping only; nothing renders from it.
	// eslint-disable-next-line svelte/prefer-svelte-reactivity
	#pointers = new Map<number, Point>();
	#mode: Mode = 'idle';
	#start: Point = { x: 0, y: 0 };
	#startAt = 0;
	#origin: Point = { x: 0, y: 0 };
	#pinch: { d: number; mid: Point; scale: number; x: number; y: number } | null = null;
	/** A pinch happened during this touch: lifting the fingers isn't a tap. */
	#pinched = false;
	#lastTap: { at: Point; t: number } | null = null;
	#tapTimer: ReturnType<typeof setTimeout> | undefined;
	#wheelTimer: ReturnType<typeof setTimeout> | undefined;
	#lastType = 'mouse';

	constructor(host: GestureHost) {
		this.#host = host;
	}

	#rel(p: Point): Point {
		const c = this.#host.centre();
		return { x: p.x - c.x, y: p.y - c.y };
	}

	#setMode(mode: Mode) {
		this.#mode = mode;
		this.active = mode === 'pan' || mode === 'pinch';
	}

	down(e: PointerEvent) {
		this.#lastType = e.pointerType;
		const target = e.target as Element | null;
		// Buttons and the video's own controls keep their clicks.
		if (target?.closest('button, a')) return;
		const stage = e.currentTarget as HTMLElement;
		const zoom = this.#host.zoom();
		const at = { x: e.clientX, y: e.clientY };

		if (e.pointerType === 'mouse') {
			if (e.button !== 0 || !zoom?.zoomed) return;
			e.preventDefault(); // no image drag, no text selection
			capture(stage, e.pointerId);
			this.#pointers.set(e.pointerId, at);
			this.#beginPan(at, zoom);
			return;
		}

		this.#pointers.set(e.pointerId, at);
		if (zoom && !target?.closest('video')) capture(stage, e.pointerId);
		if (this.#pointers.size === 1) {
			this.#pinched = false;
			this.#start = at;
			this.#startAt = performance.now();
			if (zoom?.zoomed) this.#beginPan(at, zoom);
			else this.#setMode('swipe');
		} else if (this.#pointers.size === 2 && zoom) {
			this.#beginPinch(zoom);
		}
	}

	#beginPan(at: Point, zoom: Zoom) {
		this.#start = at;
		this.#origin = { x: zoom.x, y: zoom.y };
		this.#setMode('pan');
	}

	#beginPinch(zoom: Zoom) {
		const [a, b] = [...this.#pointers.values()];
		clearTimeout(this.#tapTimer);
		this.#lastTap = null;
		this.#pinched = true;
		this.#host.drag(0);
		this.#pinch = { d: Math.max(1, dist(a, b)), mid: this.#rel(mid(a, b)), scale: zoom.scale, x: zoom.x, y: zoom.y };
		this.#setMode('pinch');
		this.#host.zooming();
	}

	move(e: PointerEvent) {
		if (!this.#pointers.has(e.pointerId)) return;
		const at = { x: e.clientX, y: e.clientY };
		this.#pointers.set(e.pointerId, at);
		const zoom = this.#host.zoom();

		if (this.#mode === 'pinch' && this.#pinch && zoom && this.#pointers.size >= 2) {
			const [a, b] = [...this.#pointers.values()];
			const p = this.#pinch;
			const s = clamp((p.scale * dist(a, b)) / p.d, 1, MAX_ZOOM);
			const m = this.#rel(mid(a, b));
			// The photo point that was under the fingers stays under them, as they move apart and around.
			zoom.set(s, m.x - ((p.mid.x - p.x) * s) / p.scale, m.y - ((p.mid.y - p.y) * s) / p.scale);
		} else if (this.#mode === 'pan' && zoom) {
			zoom.set(zoom.scale, this.#origin.x + at.x - this.#start.x, this.#origin.y + at.y - this.#start.y);
		} else if (this.#mode === 'swipe') {
			const dx = at.x - this.#start.x;
			if (Math.abs(dx) > Math.abs(at.y - this.#start.y)) this.#host.drag(dx);
		}
	}

	up(e: PointerEvent) {
		const at = this.#pointers.get(e.pointerId);
		if (!at) return;
		this.#pointers.delete(e.pointerId);
		const zoom = this.#host.zoom();

		if (this.#mode === 'pinch') {
			if (this.#pointers.size === 1 && zoom?.zoomed) {
				// One finger stays down: carry on panning with it.
				this.#beginPan([...this.#pointers.values()][0], zoom);
			} else if (this.#pointers.size === 0) {
				this.#end();
			} else if (this.#pointers.size === 1) {
				this.#setMode('idle');
			}
			return;
		}
		if (this.#pointers.size > 0) return;

		const dx = at.x - this.#start.x;
		const dy = at.y - this.#start.y;
		const still = Math.abs(dx) < TAP_SLOP && Math.abs(dy) < TAP_SLOP && !this.#pinched;
		const mode = this.#mode;
		this.#end();
		if (e.pointerType === 'mouse') return;
		if (still && performance.now() - this.#startAt < 500) return this.#tap(at);
		if (mode !== 'swipe') return;
		if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy)) this.#host.swipe(dx < 0 ? 1 : -1);
		else if (dy > 90 && Math.abs(dy) > Math.abs(dx)) this.#host.close();
	}

	/** The browser took the pointer over: put everything back. */
	cancel(e: PointerEvent) {
		this.#pointers.delete(e.pointerId);
		if (this.#pointers.size === 0) this.#end();
	}

	#end() {
		const was = this.#mode;
		this.#setMode('idle');
		this.#pinch = null;
		this.#host.drag(0);
		if (was === 'pinch' || was === 'pan') this.#host.settled();
	}

	#tap(at: Point) {
		const zoom = this.#host.zoom();
		const now = performance.now();
		const last = this.#lastTap;
		if (zoom && last && now - last.t < DOUBLE_TAP_MS && dist(last.at, at) < DOUBLE_TAP_SLOP) {
			clearTimeout(this.#tapTimer);
			this.#lastTap = null;
			zoom.toggle(this.#rel(at));
			this.#host.zooming();
			return;
		}
		this.#lastTap = { at, t: now };
		clearTimeout(this.#tapTimer);
		// Without zoom there is no double tap to wait for.
		if (!zoom) return this.#host.tap();
		this.#tapTimer = setTimeout(() => {
			this.#lastTap = null;
			this.#host.tap();
		}, DOUBLE_TAP_MS);
	}

	dblclick(e: MouseEvent) {
		// Touch double taps are handled in up(); some browsers also send dblclick for them.
		if (this.#lastType !== 'mouse') return;
		if ((e.target as Element | null)?.closest('button, a, video')) return;
		const zoom = this.#host.zoom();
		if (!zoom) return;
		zoom.toggle(this.#rel({ x: e.clientX, y: e.clientY }));
		this.#host.zooming();
	}

	/** Mouse wheel zooms; so does a trackpad pinch, which browsers send as ctrl+wheel. */
	wheel(e: WheelEvent) {
		const zoom = this.#host.zoom();
		if (!zoom || (e.target as Element | null)?.closest('video')) return;
		e.preventDefault(); // ctrl+wheel would zoom the whole page
		const px = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1);
		const factor = Math.exp(-px * (e.ctrlKey ? 0.01 : 0.002));
		zoom.zoomTo(zoom.scale * factor, this.#rel({ x: e.clientX, y: e.clientY }));
		this.#host.zooming();
		clearTimeout(this.#wheelTimer);
		this.#wheelTimer = setTimeout(() => this.#host.settled(), 200);
	}

	dispose() {
		clearTimeout(this.#tapTimer);
		clearTimeout(this.#wheelTimer);
	}
}

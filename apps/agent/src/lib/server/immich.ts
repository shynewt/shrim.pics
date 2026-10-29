/**
 * Viewer traffic uses only a shared-link key (or slug), so Immich itself decides what
 * each share can see and do. Making links uses the person's own sign-in or API key.
 */
import { openAsBlob } from 'node:fs';
import type { AgentErrorCode, AssetInfo, ImmichLinkRef, Manifest, ManifestAsset, ThumbSize } from '@shrim/protocol';
import { config } from './config.ts';
import type { Credential } from './state.ts';

export class ImmichError extends Error {
	constructor(
		public code: AgentErrorCode,
		public status: number
	) {
		super(code);
	}
}

export interface SharedLink {
	id: string;
	type: 'ALBUM' | 'INDIVIDUAL';
	description: string | null;
	allowUpload: boolean;
	allowDownload: boolean;
	showMetadata: boolean;
	expiresAt: string | null;
	password: string | null;
	album?: { id: string; albumName: string; description: string; assetCount: number; order?: 'asc' | 'desc' };
	assets: Array<{
		id: string;
		type: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'OTHER';
		width: number | null;
		height: number | null;
		duration: string | null;
		localDateTime?: string;
		thumbhash: string | null;
	}>;
}

function query(ref: ImmichLinkRef): string {
	return 'key' in ref ? `key=${encodeURIComponent(ref.key)}` : `slug=${encodeURIComponent(ref.slug)}`;
}

async function call(ref: ImmichLinkRef, path: string, init?: RequestInit): Promise<Response> {
	const sep = path.includes('?') ? '&' : '?';
	let res: Response;
	try {
		res = await fetch(`${config.immichUrl}/api${path}${sep}${query(ref)}`, { redirect: 'manual', ...init });
	} catch {
		throw new ImmichError('immich_unreachable', 502);
	}
	if (res.ok) return res;
	if (res.status === 401) {
		const body = (await res.json().catch(() => ({}))) as { message?: string };
		// Password-protected links can't be used by the agent.
		if (/password/i.test(body.message ?? '')) throw new ImmichError('not_allowed', 403);
		throw new ImmichError('link_gone', 410);
	}
	res.body?.cancel().catch(() => {});
	if (res.status === 403) throw new ImmichError('not_allowed', 403);
	if (res.status === 404 || res.status === 400) throw new ImmichError('not_found', 404);
	if (res.status === 413) throw new ImmichError('too_large', 413);
	if (res.status >= 300 && res.status < 400) throw new ImmichError('not_found', 404);
	throw new ImmichError('immich_unreachable', 502);
}

async function json<T>(ref: ImmichLinkRef, path: string): Promise<T> {
	return (await (await call(ref, path)).json()) as T;
}

export function sharedLink(ref: ImmichLinkRef): Promise<SharedLink> {
	return json<SharedLink>(ref, '/shared-links/me');
}

export async function ping(): Promise<boolean> {
	try {
		const res = await fetch(`${config.immichUrl}/api/server/ping`, { signal: AbortSignal.timeout(3000) });
		return res.ok;
	} catch {
		return false;
	}
}

interface TimeBucket {
	id: string[];
	ratio: number[];
	isImage: boolean[];
	duration: (number | string | null)[];
	fileCreatedAt: string[];
	localOffsetHours: number[];
	thumbhash: (string | null)[];
	isTrashed: boolean[];
}

/** Immich gives durations as milliseconds (timeline) or "0:01:02.500" (assets). */
function parseDuration(d: number | string | null | undefined): number | undefined {
	if (typeof d === 'number') return d > 0 ? Math.round(d) : undefined;
	if (!d) return undefined;
	const m = d.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
	if (!m) return undefined;
	const ms = Math.round((Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3])) * 1000);
	return ms || undefined;
}

/** UTC time + offset → local wall-clock time without a zone, like Immich shows it. */
function localTime(utc: string, offsetHours: number): string {
	const t = Date.parse(utc.endsWith('Z') || /[+-]\d\d:\d\d$/.test(utc) ? utc : `${utc}Z`);
	if (!Number.isFinite(t)) return utc;
	return new Date(t + offsetHours * 3_600_000).toISOString().slice(0, 19);
}

async function albumAssets(ref: ImmichLinkRef, albumId: string, order: 'asc' | 'desc'): Promise<ManifestAsset[]> {
	const buckets = await json<Array<{ timeBucket: string; count: number }>>(
		ref,
		`/timeline/buckets?albumId=${albumId}&order=${order}`
	);
	const out: ManifestAsset[] = [];
	for (const { timeBucket } of buckets) {
		const b = await json<TimeBucket>(
			ref,
			`/timeline/bucket?albumId=${albumId}&timeBucket=${encodeURIComponent(timeBucket)}&order=${order}`
		);
		for (let i = 0; i < b.id.length; i++) {
			if (b.isTrashed[i]) continue;
			out.push({
				id: b.id[i],
				ratio: b.ratio[i] || 1,
				video: !b.isImage[i],
				duration: parseDuration(b.duration[i]),
				takenAt: localTime(b.fileCreatedAt[i], b.localOffsetHours[i] ?? 0),
				thumbhash: b.thumbhash[i] ?? undefined
			});
		}
	}
	return out;
}

export async function manifest(ref: ImmichLinkRef): Promise<Manifest> {
	const link = await sharedLink(ref);
	let assets: ManifestAsset[];
	if (link.type === 'ALBUM' && link.album) {
		assets = await albumAssets(ref, link.album.id, link.album.order ?? 'desc');
	} else {
		assets = link.assets
			.filter((a) => a.type === 'IMAGE' || a.type === 'VIDEO')
			.map((a) => ({
				id: a.id,
				ratio: a.width && a.height ? a.width / a.height : 1,
				video: a.type === 'VIDEO',
				duration: parseDuration(a.duration),
				takenAt: a.localDateTime?.slice(0, 19),
				thumbhash: a.thumbhash ?? undefined
			}));
	}
	return {
		title: link.album?.albumName ?? '',
		description: link.album?.description || ownText(link.description),
		allowUpload: link.allowUpload,
		allowDownload: link.allowDownload,
		showMetadata: link.showMetadata,
		expiresAt: link.expiresAt,
		assets
	};
}

export function thumbnail(ref: ImmichLinkRef, asset: string, size: ThumbSize) {
	return call(ref, `/assets/${asset}/thumbnail?size=${size}`);
}

export function original(ref: ImmichLinkRef, asset: string) {
	return call(ref, `/assets/${asset}/original`);
}

export function video(ref: ImmichLinkRef, asset: string) {
	return call(ref, `/assets/${asset}/video/playback`);
}

/** Bytes start..end (inclusive) of the playback file. Immich answers 206, or 200 with the whole file if it ignores ranges. */
export function videoRange(ref: ImmichLinkRef, asset: string, start: number, end: number) {
	return call(ref, `/assets/${asset}/video/playback`, { headers: { range: `bytes=${start}-${end}` } });
}

/**
 * Immich's full-size rendition. Immich only has one when "full-size previews"
 * are turned on; otherwise it redirects to the preview, which `call` reports
 * as not_found.
 */
export function fullsize(ref: ImmichLinkRef, asset: string) {
	return call(ref, `/assets/${asset}/thumbnail?size=fullsize`);
}

interface AssetResponse {
	originalFileName?: string;
	localDateTime?: string;
	width?: number | null;
	height?: number | null;
	exifInfo?: {
		make?: string | null;
		model?: string | null;
		lensModel?: string | null;
		fNumber?: number | null;
		exposureTime?: string | null;
		iso?: number | null;
		focalLength?: number | null;
		fileSizeInByte?: number | null;
		exifImageWidth?: number | null;
		exifImageHeight?: number | null;
		city?: string | null;
		state?: string | null;
		country?: string | null;
	};
}

export async function info(ref: ImmichLinkRef, asset: string): Promise<AssetInfo> {
	const a = await json<AssetResponse>(ref, `/assets/${asset}`);
	const e = a.exifInfo;
	const camera = [e?.make, e?.model].filter(Boolean).join(' ');
	const exposure = [
		e?.fNumber ? `f/${e.fNumber}` : null,
		e?.exposureTime ? `${e.exposureTime} s` : null,
		e?.focalLength ? `${e.focalLength} mm` : null,
		e?.iso ? `ISO ${e.iso}` : null
	]
		.filter(Boolean)
		.join(' · ');
	const place = [e?.city, e?.country].filter(Boolean).join(', ');
	return {
		filename: a.originalFileName,
		takenAt: a.localDateTime?.slice(0, 19),
		camera: camera || undefined,
		lens: e?.lensModel ?? undefined,
		exposure: exposure || undefined,
		size: e?.fileSizeInByte ?? undefined,
		width: e?.exifImageWidth ?? a.width ?? undefined,
		height: e?.exifImageHeight ?? a.height ?? undefined,
		place: place || undefined
	};
}

export async function upload(
	ref: ImmichLinkRef,
	file: { path: string; name: string; type: string; modified: number }
): Promise<'created' | 'duplicate'> {
	const form = new FormData();
	form.set('assetData', await openAsBlob(file.path, { type: file.type || 'application/octet-stream' }), file.name);
	const when = new Date(file.modified || Date.now()).toISOString();
	form.set('fileCreatedAt', when);
	form.set('fileModifiedAt', when);
	form.set('filename', file.name);
	const res = await call(ref, '/assets', { method: 'POST', body: form });
	const body = (await res.json()) as { status: string };
	return body.status === 'duplicate' ? 'duplicate' : 'created';
}

// Links are made as the person, so they own them in Immich. Viewer traffic never uses
// this; it only ever uses a share link's key.

/** What an API key needs to make links. sharedLink.delete only lets revoking also remove the Immich link. */
export const API_KEY_PERMISSIONS = ['album.read', 'sharedLink.create'] as const;
export const API_KEY_OPTIONAL = ['sharedLink.delete', 'sharedLink.update', 'sharedLink.read'] as const;
/** Signing in with a key also needs to know whose key it is. */
export const SIGN_IN_KEY_PERMISSIONS = ['user.read', ...API_KEY_PERMISSIONS] as const;
/** What the key the agent makes at an SSO sign-in may do: exactly this, nothing more. */
export const AGENT_KEY_PERMISSIONS = [
	...SIGN_IN_KEY_PERMISSIONS,
	'sharedLink.update',
	'sharedLink.delete',
	'sharedLink.read'
] as const;
export const AGENT_KEY_NAME = 'shrim.pics agent';

/** Immich no longer accepts this sign-in or key: signed out, expired, or deleted. */
export class ImmichSignedOut extends ImmichError {
	constructor() {
		super('link_gone', 401);
	}
}

async function asUser(cred: Credential, path: string, init: RequestInit = {}): Promise<Response> {
	let res: Response;
	try {
		const headers = new Headers(init.headers);
		if (cred.kind === 'session') headers.set('authorization', `Bearer ${cred.token}`);
		else headers.set('x-api-key', cred.key);
		res = await fetch(`${config.immichUrl}/api${path}`, {
			signal: AbortSignal.timeout(15_000),
			...init,
			headers,
			redirect: 'manual'
		});
	} catch {
		throw new ImmichError('immich_unreachable', 502);
	}
	if (res.ok) return res;
	res.body?.cancel().catch(() => {});
	if (res.status === 401) throw new ImmichSignedOut();
	if (res.status === 403) throw new ImmichError('not_allowed', 403);
	if (res.status === 404 || res.status === 400) throw new ImmichError('not_found', 404);
	throw new ImmichError('immich_unreachable', 502);
}

export interface ImmichUser {
	id: string;
	name: string;
	email: string;
	isAdmin: boolean;
}

/** A key needs user.read for this. */
export async function whoAmI(cred: Credential, timeoutMs = 15_000): Promise<ImmichUser> {
	const u = (await (await asUser(cred, '/users/me', { signal: AbortSignal.timeout(timeoutMs) })).json()) as ImmichUser;
	return { id: u.id, name: u.name || u.email, email: u.email, isAdmin: !!u.isAdmin };
}

export interface ImmichSignIn {
	/** An Immich sign-in token: used once to make the person's API key, then logged out. */
	token: string;
	user: ImmichUser;
}

export interface ImmichServerInfo {
	oauth: boolean;
	/** The label Immich puts on its own SSO button. */
	oauthButtonText: string;
	/** Immich's public address, if its admin set one. */
	externalDomain: string;
}

export async function serverInfo(): Promise<ImmichServerInfo | null> {
	try {
		const [features, cfg] = await Promise.all(
			['/server/features', '/server/config'].map(async (path) => {
				const res = await fetch(`${config.immichUrl}/api${path}`, { signal: AbortSignal.timeout(3000) });
				if (!res.ok) throw new Error(String(res.status));
				return (await res.json()) as Record<string, unknown>;
			})
		);
		return {
			oauth: features.oauth === true,
			oauthButtonText: typeof cfg.oauthButtonText === 'string' ? cfg.oauthButtonText : '',
			externalDomain: typeof cfg.externalDomain === 'string' ? cfg.externalDomain.replace(/\/$/, '') : ''
		};
	} catch {
		return null;
	}
}

async function publicPost(path: string, body: unknown): Promise<{ status: number; body: Record<string, unknown> }> {
	let res: Response;
	try {
		res = await fetch(`${config.immichUrl}/api${path}`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify(body),
			redirect: 'manual',
			signal: AbortSignal.timeout(15_000)
		});
	} catch {
		throw new ImmichError('immich_unreachable', 502);
	}
	return { status: res.status, body: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/**
 * Immich passes `redirectUri` on to the sign-in provider as it is, so the provider must allow it.
 * We pick `state` and the PKCE challenge, and keep the verifier ourselves.
 */
export async function oauthAuthorize(redirectUri: string, state: string, codeChallenge: string): Promise<string> {
	const { status, body } = await publicPost('/oauth/authorize', { redirectUri, state, codeChallenge });
	if (status >= 300 || typeof body.url !== 'string') throw new ImmichError('not_allowed', status || 502);
	return body.url;
}

export async function oauthCallback(url: string, state: string, codeVerifier: string): Promise<ImmichSignIn | null> {
	const { status, body } = await publicPost('/oauth/callback', { url, state, codeVerifier });
	if (status >= 300 || typeof body.accessToken !== 'string' || typeof body.userId !== 'string') return null;
	const email = typeof body.userEmail === 'string' ? body.userEmail : '';
	return {
		token: body.accessToken,
		user: {
			id: body.userId,
			name: (typeof body.name === 'string' && body.name) || email,
			email,
			isAdmin: body.isAdmin === true
		}
	};
}

/** Needs their Immich sign-in. */
export async function createApiKey(
	cred: Credential,
	name: string,
	permissions: readonly string[]
): Promise<{ id: string; secret: string }> {
	const res = await asUser(cred, '/api-keys', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ name, permissions })
	});
	const body = (await res.json()) as { secret: string; apiKey: { id: string } };
	return { id: body.apiKey.id, secret: body.secret };
}

/** Needs their Immich sign-in. */
export async function apiKeyExists(cred: Credential, id: string): Promise<boolean> {
	try {
		await asUser(cred, `/api-keys/${id}`);
		return true;
	} catch (e) {
		if (e instanceof ImmichError && e.code === 'not_found') return false;
		throw e;
	}
}

export async function deleteApiKey(cred: Credential, id: string): Promise<void> {
	try {
		await asUser(cred, `/api-keys/${id}`, { method: 'DELETE' });
	} catch (e) {
		if (!(e instanceof ImmichError && e.code === 'not_found')) throw e;
	}
}

/** Ends an Immich sign-in. Keys aren't sign-ins: they stay until deleted in Immich. */
export async function logout(cred: Credential): Promise<void> {
	if (cred.kind !== 'session') return;
	await asUser(cred, '/auth/logout', { method: 'POST', signal: AbortSignal.timeout(5000) }).catch(() => {});
}

const NO_EXTRAS = { fullAccess: false, canUpdate: false, canDelete: false };

export type ApiKeyCheck =
	| { ok: true; id: string; name: string; fullAccess: boolean; canDelete: boolean; canUpdate: boolean }
	| { ok: false; reason: 'invalid' | 'missing'; missing?: string[] };

/** A key with "all" permissions passes too. */
export async function checkApiKey(
	apiKey: string,
	required: readonly string[] = API_KEY_PERMISSIONS
): Promise<ApiKeyCheck> {
	let info: { id: string; name: string; permissions: string[] };
	try {
		info = (await (await asUser({ kind: 'apiKey', key: apiKey, ...NO_EXTRAS }, '/api-keys/me')).json()) as typeof info;
	} catch (e) {
		if (e instanceof ImmichError && e.code === 'immich_unreachable') throw e;
		return { ok: false, reason: 'invalid' };
	}
	if (info.permissions.includes('all'))
		return { ok: true, id: info.id, name: info.name, fullAccess: true, canDelete: true, canUpdate: true };
	const missing = required.filter((p) => !info.permissions.includes(p));
	if (missing.length) return { ok: false, reason: 'missing', missing };
	return {
		ok: true,
		id: info.id,
		name: info.name,
		fullAccess: false,
		canDelete: info.permissions.includes('sharedLink.delete'),
		canUpdate: info.permissions.includes('sharedLink.update')
	};
}

export interface AlbumSummary {
	id: string;
	name: string;
	count: number;
	startDate: string | null;
	endDate: string | null;
	/** Shared with this person by someone else: who. */
	sharedBy: string | null;
	/** Immich lets owners and editors share an album, not viewers. */
	canShare: boolean;
}

interface AlbumResponse {
	id: string;
	albumName: string;
	assetCount: number;
	startDate?: string;
	endDate?: string;
	updatedAt: string;
	ownerId?: string;
	owner?: { id: string; name: string };
	albumUsers?: Array<{ user: { id: string; name: string }; role: 'owner' | 'editor' | 'viewer' }>;
}

/** `userId` tells which are whose. */
export async function listAlbums(cred: Credential, userId?: string): Promise<AlbumSummary[]> {
	// Older Immich lists only owned albums unless asked for shared ones too.
	const [own, shared] = await Promise.all([
		asUser(cred, '/albums').then((r) => r.json() as Promise<AlbumResponse[]>),
		asUser(cred, '/albums?shared=true').then((r) => r.json() as Promise<AlbumResponse[]>)
	]);
	const byId = new Map([...own, ...shared].map((a) => [a.id, a]));
	return [...byId.values()]
		.sort((a, b) => (b.endDate ?? b.updatedAt).localeCompare(a.endDate ?? a.updatedAt))
		.map((a) => {
			const owner = a.albumUsers?.find((u) => u.role === 'owner')?.user ?? a.owner;
			const ownerId = owner?.id ?? a.ownerId;
			const role = !userId
				? 'owner'
				: ownerId === userId
					? 'owner'
					: a.albumUsers?.find((u) => u.user.id === userId)?.role;
			return {
				id: a.id,
				name: a.albumName,
				count: a.assetCount,
				startDate: a.startDate ?? null,
				endDate: a.endDate ?? null,
				sharedBy: role === 'owner' ? null : (owner?.name ?? null),
				canShare: role !== 'viewer'
			};
		});
}

/** The description of Immich links the agent makes itself. */
export const AGENT_MADE = 'Made by the shrim.pics agent';

/** What the person wrote, without the shrim.pics link put in front of it (SHRIM_AUTO_LINKS) or the agent's own note. */
export function ownText(description: string | null): string {
	const text = (description ?? '').replace(/^https?:\/\/\S+\/s\/[\w-]+#[\w-]+[ \t]*(\r?\n|$)/, '').trim();
	return text === AGENT_MADE ? '' : text;
}

export async function createAlbumLink(
	cred: Credential,
	opts: { albumId: string; allowUpload: boolean; allowDownload: boolean; showMetadata: boolean }
): Promise<{ id: string; key: string }> {
	const res = await asUser(cred, '/shared-links', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			type: 'ALBUM',
			albumId: opts.albumId,
			allowUpload: opts.allowUpload,
			allowDownload: opts.allowDownload,
			showMetadata: opts.showMetadata,
			// No expiry in Immich: shrim.pics enforces the link's expiry, and can change it later.
			expiresAt: null,
			description: AGENT_MADE
		})
	});
	const link = (await res.json()) as { id: string; key: string };
	return { id: link.id, key: link.key };
}

export async function updateSharedLink(
	cred: Credential,
	id: string,
	patch: { allowUpload?: boolean; allowDownload?: boolean; showMetadata?: boolean; expiresAt?: null }
) {
	await asUser(cred, `/shared-links/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify(patch)
	});
}

/** What the share-link list says about each link (assets left out). */
export interface OwnSharedLink {
	id: string;
	key: string;
	type: 'ALBUM' | 'INDIVIDUAL';
	description: string | null;
	password: string | null;
	createdAt: string;
	expiresAt: string | null;
	allowUpload: boolean;
	allowDownload: boolean;
	showMetadata: boolean;
}

/** Their own Immich share links. Needs sharedLink.read. */
export async function listSharedLinks(cred: Credential): Promise<OwnSharedLink[]> {
	return (await asUser(cred, '/shared-links')).json() as Promise<OwnSharedLink[]>;
}

/** Needs sharedLink.update. */
export async function setSharedLinkDescription(cred: Credential, id: string, description: string | null) {
	await asUser(cred, `/shared-links/${id}`, {
		method: 'PATCH',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ description })
	});
}

export async function deleteSharedLink(cred: Credential, id: string) {
	try {
		await asUser(cred, `/shared-links/${id}`, { method: 'DELETE' });
	} catch (e) {
		if (!(e instanceof ImmichError && e.code === 'not_found')) throw e;
	}
}

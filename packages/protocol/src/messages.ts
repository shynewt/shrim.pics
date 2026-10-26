/** Everything here travels inside encrypted streams, except the relay types at the bottom. */

export type ThumbSize = 'thumbnail' | 'preview';

/** Renditions Immich can make. `fullsize` is only there when the server makes them; agents fall back. */
export type RenditionSize = ThumbSize | 'fullsize';

export type RequestHead =
	| { op: 'manifest' }
	| { op: 'thumb'; asset: string; size: ThumbSize }
	| { op: 'original'; asset: string }
	| { op: 'video'; asset: string }
	/** Bytes start..end (inclusive) of the playback file. Answered with status 206 and `start`, `end`, `total`. */
	| { op: 'video.range'; asset: string; start: number; end: number }
	/**
	 * The sharpest image the share allows, for zooming in: Immich's full-size
	 * rendition, else the original if downloads are allowed and a browser can
	 * show it. 404 when there is nothing better than `preview`.
	 */
	| { op: 'fullsize'; asset: string }
	| { op: 'info'; asset: string }
	| { op: 'upload.begin'; name: string; type: string; size: number; modified: number }
	| { op: 'upload.part'; uploadId: string; index: number }
	| { op: 'upload.finish'; uploadId: string };

export type Op = RequestHead['op'];

export interface ResponseHead {
	status: number;
	type?: string;
	size?: number;
	filename?: string;
	/** For `video.range`: the bytes in the body (inclusive), and the size of the whole file. */
	start?: number;
	end?: number;
	total?: number;
	/** A short code the viewer maps to friendly text. */
	error?: AgentErrorCode;
}

export type AgentErrorCode =
	| 'bad_request'
	| 'immich_unreachable'
	| 'link_gone'
	| 'not_allowed'
	| 'not_found'
	| 'too_large'
	| 'unsupported_type'
	| 'upload_failed';

export interface ManifestAsset {
	id: string;
	/** width / height */
	ratio: number;
	video: boolean;
	/** milliseconds, for videos */
	duration?: number;
	/** ISO date the photo was taken, local time without zone */
	takenAt?: string;
	thumbhash?: string;
}

export interface Manifest {
	title: string;
	description: string;
	allowUpload: boolean;
	allowDownload: boolean;
	showMetadata: boolean;
	expiresAt: string | null;
	assets: ManifestAsset[];
}

export interface AssetInfo {
	filename?: string;
	takenAt?: string;
	camera?: string;
	lens?: string;
	exposure?: string;
	size?: number;
	width?: number;
	height?: number;
	place?: string;
}

export interface UploadBegun {
	uploadId: string;
	partSize: number;
}

export interface UploadFinished {
	status: 'created' | 'duplicate';
}

export const UPLOAD_PART_SIZE = 4 * 1024 * 1024;

// Relay ↔ agent (plaintext, but contains no user content)

export type RelayErrorCode =
	| 'not_found'
	| 'gone'
	| 'inactive'
	| 'offline'
	| 'timeout'
	| 'too_large'
	| 'slow_down'
	| 'unauthorized'
	| 'bad_request';

export interface RelayRequestEvent {
	rid: string;
	share: string;
	/** base64url of the whole request body, when it was small enough */
	inline?: string;
}

export interface AgentMe {
	accountActive: boolean;
	publicOrigin: string;
	email: string;
}

export interface CreatedShare {
	id: string;
}

export const SHARE_ID_PATTERN = /^[A-Za-z0-9]{10}$/;
export const AGENT_TOKEN_PREFIX = 'shr_agent_';

/** Bytes a relay should accept for one request body. */
export const MAX_REQUEST_BODY = 16 * 1024;
export const MAX_UPLOAD_REQUEST_BODY = UPLOAD_PART_SIZE + 128 * 1024;
export const INLINE_LIMIT = 64 * 1024;

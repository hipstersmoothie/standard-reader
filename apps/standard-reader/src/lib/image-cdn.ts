/**
 * "Image server" preference — which Bluesky-CDN-compatible host the reader's
 * browser loads AT Protocol blob images from (covers, icons, avatars, article
 * images).
 *
 * The server always builds image URLs on the Bluesky CDN
 * (`https://cdn.bsky.app/img/…`, see `#/server/atproto/blob`), so every cached
 * response, query cache entry and server-side cache stays shared across
 * readers. The swap happens at render time: {@link rewriteImageCdnUrl} moves a
 * Bluesky CDN URL onto the chosen host, keeping the path. The design system's
 * `ImageSrcProvider` (installed in `__root.tsx`) applies it to every image
 * component, and app-level `<img>`s call `useImageSrcTransform()`.
 *
 * Only a vetted list is offered — never a free-form host — because every
 * image a reader sees would load from it. Each was checked (Nov 2026) to answer
 * `/img/<preset>/plain/<did>/<cid>@<format>` for blobs on Bluesky's PDSes and on
 * self-hosted ones, including percent-encoded DIDs.
 *
 * Persisted in the `standard-reader-image-cdn` cookie (SSR for everyone, so the
 * first paint already points at the chosen host and hydration matches).
 * Signed-in readers also store it on `user.image_cdn` (`null` = Bluesky).
 */

export const IMAGE_CDN_IDS = ["bsky", "porxie", "luna", "blueat"] as const;

export type ImageCdnId = (typeof IMAGE_CDN_IDS)[number];

export interface ImageCdnHost {
  id: ImageCdnId;
  /** Origin the `/img/…` path is appended to. No trailing slash. */
  origin: string;
  /** Host name as shown in Settings — a domain, so never translated. */
  label: string;
  /**
   * Whether the host honours the size preset and `@jpeg` / `@png` suffix.
   * Hosts that don't serve the author's original upload as-is: the image still
   * displays, but it isn't resized, so full-size photos cost more bandwidth.
   */
  resizes: boolean;
}

export const DEFAULT_IMAGE_CDN: ImageCdnId = "bsky";

/** The Bluesky CDN origin every server-built image URL starts with. */
export const BSKY_IMAGE_CDN_ORIGIN = "https://cdn.bsky.app";

export const IMAGE_CDN_HOSTS: Readonly<Record<ImageCdnId, ImageCdnHost>> = {
  bsky: {
    id: "bsky",
    origin: BSKY_IMAGE_CDN_ORIGIN,
    label: "cdn.bsky.app",
    resizes: true,
  },
  porxie: {
    id: "porxie",
    origin: "https://porxie-bsky.dollware.net",
    label: "porxie-bsky.dollware.net",
    resizes: true,
  },
  luna: {
    id: "luna",
    origin: "https://luna.danielmorrisey.com",
    label: "luna.danielmorrisey.com",
    resizes: false,
  },
  blueat: {
    id: "blueat",
    origin: "https://cdn.blueat.network",
    label: "cdn.blueat.network",
    resizes: false,
  },
};

export const IMAGE_CDN_COOKIE = "standard-reader-image-cdn";

export const IMAGE_CDN_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export function isImageCdnId(value: unknown): value is ImageCdnId {
  return (
    typeof value === "string" &&
    (IMAGE_CDN_IDS as ReadonlyArray<string>).includes(value)
  );
}

/** Parse a stored value (cookie or DB). Anything unknown is the default. */
export function parseImageCdn(value: unknown): ImageCdnId {
  return isImageCdnId(value) ? value : DEFAULT_IMAGE_CDN;
}

export function imageCdnToCookieValue(cdn: ImageCdnId): ImageCdnId {
  return cdn;
}

/** `null` for the default, so "Bluesky" stays one state instead of two. */
export function imageCdnToDbValue(cdn: ImageCdnId): ImageCdnId | null {
  return cdn === DEFAULT_IMAGE_CDN ? null : cdn;
}

export function dbValueToImageCdn(
  value: string | null | undefined,
): ImageCdnId {
  return parseImageCdn(value);
}

const BSKY_IMAGE_PREFIX = `${BSKY_IMAGE_CDN_ORIGIN}/img/`;

/**
 * Move a Bluesky CDN image URL onto the chosen host. Anything else — other
 * hosts, relative paths, `data:`/`blob:` URLs, the default host — comes back
 * unchanged, so this is safe to run over every `<img src>`.
 */
export function rewriteImageCdnUrl(url: string, cdn: ImageCdnId): string;
export function rewriteImageCdnUrl(
  url: string | null | undefined,
  cdn: ImageCdnId,
): string | null | undefined;
export function rewriteImageCdnUrl(
  url: string | null | undefined,
  cdn: ImageCdnId,
): string | null | undefined {
  if (!url || cdn === DEFAULT_IMAGE_CDN) return url;
  if (!url.startsWith(BSKY_IMAGE_PREFIX)) return url;
  return `${IMAGE_CDN_HOSTS[cdn].origin}${url.slice(BSKY_IMAGE_CDN_ORIGIN.length)}`;
}

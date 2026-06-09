const FETCH_TIMEOUT_MS = 5000;

/** Formats satori can measure — webp/avif make it throw mid-render. */
const SATORI_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/svg+xml",
]);

function toDataUrl(buffer: ArrayBuffer, contentType: string): string {
  const base64 = Buffer.from(buffer).toString("base64");
  return `data:${contentType};base64,${base64}`;
}

/**
 * Rewrite a raw PDS `com.atproto.sync.getBlob` URL to the Bluesky image CDN,
 * which transcodes to JPEG (PDS blobs are often webp, which satori can't
 * parse) and resizes to a sane fullsize variant.
 */
function bskyCdnJpegUrl(url: string): string | null {
  try {
    const parsed = new URL(url);
    if (!parsed.pathname.endsWith("/xrpc/com.atproto.sync.getBlob")) {
      return null;
    }
    const did = parsed.searchParams.get("did");
    const cid = parsed.searchParams.get("cid");
    if (!did || !cid) return null;
    return `https://cdn.bsky.app/img/feed_fullsize/plain/${did}/${cid}@jpeg`;
  } catch {
    return null;
  }
}

async function fetchSatoriImage(url: string): Promise<string | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!response.ok) return null;

    const contentType =
      response.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    if (!SATORI_IMAGE_TYPES.has(contentType)) return null;

    const buffer = await response.arrayBuffer();
    return toDataUrl(buffer, contentType);
  } catch {
    return null;
  }
}

/** Fetch a remote image for Satori `<img src={…} />`. */
export async function loadOgImage(
  url: string | null | undefined,
): Promise<string | null> {
  if (!url) return null;

  const cdnUrl = bskyCdnJpegUrl(url);
  if (cdnUrl) {
    const fromCdn = await fetchSatoriImage(cdnUrl);
    if (fromCdn) return fromCdn;
  }

  return fetchSatoriImage(url);
}

/** Try publication icon, then owner avatar (matches `PublicationAvatar`). */
export async function loadPublicationIcon(
  iconUrl: string | null | undefined,
  ownerAvatarUrl: string | null | undefined,
): Promise<string | null> {
  const icon = await loadOgImage(iconUrl);
  if (icon) return icon;
  return loadOgImage(ownerAvatarUrl);
}

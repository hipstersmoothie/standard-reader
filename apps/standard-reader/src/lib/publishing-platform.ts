import { LEAFLET_CONTENT } from "./leaflet/types";
import { OFFPRINT_CONTENT } from "./offprint/types";

/**
 * The three AT Protocol publishing platforms we can attribute an article back
 * to by name, so a reader can jump from our reader to the original.
 *
 * Identification is driven by the document's `contentFormat` (the `$type` of
 * the content union entry) rather than the canonical URL's host: all three
 * platforms support custom domains, so host-sniffing alone silently misses
 * articles. The host check is only a fallback for records whose content we
 * never resolved (`contentFormat` null) but whose URL still gives them away.
 */
export type PublishingPlatform = "leaflet" | "pckt" | "offprint";

/** Every Leaflet content/document lexicon lives under this authority. */
export const LEAFLET_NSID_PREFIX = "pub.leaflet.";

/**
 * Leaflet's own host. Publications on a custom domain are identified by their
 * content format instead, so this is only the fallback — exported for callers
 * that have to express "is this Leaflet?" somewhere the checks below can't run
 * (a SQL predicate, say).
 */
export const LEAFLET_HOST = "leaflet.pub";

/** `pub.leaflet.document` — a full Leaflet doc, distinct from `pub.leaflet.content`. */
const LEAFLET_DOCUMENT = `${LEAFLET_NSID_PREFIX}document`;

/** Every pckt content/block/facet lexicon lives under this authority. */
const PCKT_NSID_PREFIX = "blog.pckt.";

/**
 * Hosts that identify a platform when `contentFormat` is missing. Matched
 * against the exact host and against `*.<host>` (both pckt and Offprint put
 * each publication on its own subdomain; Leaflet does too).
 *
 * Deliberately does NOT include `offprint.net` — that domain redirects to
 * `offprint.cafe`, an unrelated product with its own branding.
 */
const PLATFORM_HOSTS: ReadonlyArray<readonly [string, PublishingPlatform]> = [
  [LEAFLET_HOST, "leaflet"],
  ["pckt.blog", "pckt"],
  ["offprint.app", "offprint"],
];

function platformFromContentFormat(
  contentFormat: string,
): PublishingPlatform | null {
  if (contentFormat === LEAFLET_CONTENT || contentFormat === LEAFLET_DOCUMENT) {
    return "leaflet";
  }
  if (contentFormat === OFFPRINT_CONTENT) return "offprint";
  if (contentFormat.startsWith(PCKT_NSID_PREFIX)) return "pckt";
  return null;
}

function platformFromUrl(url: string): PublishingPlatform | null {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
  for (const [domain, platform] of PLATFORM_HOSTS) {
    if (host === domain || host.endsWith(`.${domain}`)) return platform;
  }
  return null;
}

/**
 * Skyreader publishes "linkblogs" — curated reshares of other people's posts —
 * as `site.standard.document` records whose body reuses Leaflet's
 * `pub.leaflet.content` lexicon. That makes `contentFormat` alone report them as
 * Leaflet, so a linkblog would otherwise get a "Read on Leaflet" button linking
 * to a `skyreader.app` URL — the platform mismatch behind this being a bug.
 *
 * Linkblogs always live on `skyreader.app` (each reader's on
 * `linkblogs.skyreader.app`), never on Leaflet, so the canonical host is a
 * reliable veto: a `skyreader.app` article is not one of the three platforms we
 * attribute, whatever its content format claims.
 */
const SKYREADER_HOST = "skyreader.app";

function isSkyreaderUrl(url: string): boolean {
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return false;
  }
  return host === SKYREADER_HOST || host.endsWith(`.${SKYREADER_HOST}`);
}

/**
 * Which publishing platform an article came from, or null when it's from
 * somewhere else (or we can't tell). `contentFormat` wins over the URL because
 * custom domains are common on all three platforms — the one exception is a
 * Skyreader linkblog, whose host vetoes the reused Leaflet content format (see
 * `isSkyreaderUrl`).
 */
export function publishingPlatform({
  contentFormat,
  canonicalUrl,
}: {
  contentFormat?: string | null;
  canonicalUrl?: string | null;
}): PublishingPlatform | null {
  // A Skyreader linkblog reuses Leaflet's content lexicon, so its host must veto
  // the content-format check below before it reports the article as Leaflet.
  if (canonicalUrl && isSkyreaderUrl(canonicalUrl)) return null;
  if (contentFormat) {
    const fromFormat = platformFromContentFormat(contentFormat);
    if (fromFormat) return fromFormat;
  }
  if (canonicalUrl) return platformFromUrl(canonicalUrl);
  return null;
}

/**
 * Display name, exactly as each platform writes it. `pckt` is lowercase in
 * their own brand guidance; `Offprint` and `Leaflet` are capitalized.
 */
export const PLATFORM_NAME: Record<PublishingPlatform, string> = {
  leaflet: "Leaflet",
  pckt: "pckt",
  offprint: "Offprint",
};

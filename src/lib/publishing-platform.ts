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

/** `pub.leaflet.document` — a full Leaflet doc, distinct from `pub.leaflet.content`. */
const LEAFLET_DOCUMENT = "pub.leaflet.document";

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
  ["leaflet.pub", "leaflet"],
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
 * Which publishing platform an article came from, or null when it's from
 * somewhere else (or we can't tell). `contentFormat` wins over the URL because
 * custom domains are common on all three platforms.
 */
export function publishingPlatform({
  contentFormat,
  canonicalUrl,
}: {
  contentFormat?: string | null;
  canonicalUrl?: string | null;
}): PublishingPlatform | null {
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

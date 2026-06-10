/**
 * Constellation backlink index client — discovers records that link to a URL,
 * AT-URI, or DID across the network.
 *
 * @see https://constellation.microcosm.blue/
 */

export interface ConstellationBacklinkRecord {
  did: string;
  collection: string;
  rkey: string;
}

export interface ConstellationBacklinksResult {
  total: number;
  records: Array<ConstellationBacklinkRecord>;
  cursor: string | null;
}

const DEFAULT_CONSTELLATION_URL = "https://constellation.microcosm.blue";
const FETCH_TIMEOUT_MS = 8000;
const BSKY_POST_COLLECTION = "app.bsky.feed.post";
const MARGIN_TARGET_PATH = ".target.source";
const MARGIN_REPLY_ROOT_PATH = ".root.uri";

/** JSON paths in `app.bsky.feed.post` where a linked URL may appear. */
export const BSKY_POST_LINK_PATHS = [
  ".embed.external.uri",
  ".embed.media.external.uri",
  ".facets[].features[app.bsky.richtext.facet#link].uri",
  ".facets[app.bsky.richtext.facet].features[app.bsky.richtext.facet#link].uri",
] as const;

/** Bluesky post link sources as `collection:path` for the xrpc API. */
export const BSKY_POST_LINK_SOURCES = BSKY_POST_LINK_PATHS.map(
  (path) => `${BSKY_POST_COLLECTION}:${path}` as const,
);

/** Margin note collections indexed by Constellation at `target.source`. */
export const MARGIN_NOTE_COLLECTIONS = [
  "at.margin.note",
  "at.margin.annotation",
  "at.margin.highlight",
] as const;

/** Cosmik card collection (Margin / Semble) indexed at page URL fields. */
export const COSMIK_CARD_COLLECTION = "network.cosmik.card";

/** JSON paths on `network.cosmik.card` where a linked URL may appear. */
export const COSMIK_CARD_URL_PATHS = [".url", ".content.url"] as const;

/** Margin + cosmik collections merged into Discussion. */
export const MARGIN_DISCUSSION_COLLECTIONS = [
  ...MARGIN_NOTE_COLLECTIONS,
  COSMIK_CARD_COLLECTION,
] as const;

/** Margin note link sources as legacy `/links` collection + path specs. */
export const MARGIN_NOTE_LINK_SOURCES = MARGIN_NOTE_COLLECTIONS.map(
  (collection) => `${collection}:${MARGIN_TARGET_PATH}` as const,
);

/** Cosmik card link sources as legacy `/links` collection + path specs. */
export const COSMIK_CARD_LINK_SOURCES = COSMIK_CARD_URL_PATHS.map(
  (path) => `${COSMIK_CARD_COLLECTION}:${path}` as const,
);

/** All margin Discussion link sources (at.margin.* + network.cosmik.card). */
export const MARGIN_DISCUSSION_LINK_SOURCES = [
  ...MARGIN_NOTE_LINK_SOURCES,
  ...COSMIK_CARD_LINK_SOURCES,
] as const;

/** Constellation source for `at.margin.reply` records pointing at a note root. */
export const MARGIN_REPLY_LINK_SOURCE =
  `at.margin.reply:${MARGIN_REPLY_ROOT_PATH}` as const;

/** Cosmik graph edges between two page URLs (Margin / Semble). */
export const COSMIK_CONNECTION_COLLECTION = "network.cosmik.connection";
export const COSMIK_CONNECTION_TARGET_PATH = ".target";
export const COSMIK_CONNECTION_SOURCE_PATH = ".source";
export const COSMIK_CONNECTION_TARGET_LINK_SOURCE =
  `${COSMIK_CONNECTION_COLLECTION}:${COSMIK_CONNECTION_TARGET_PATH}` as const;
export const COSMIK_CONNECTION_SOURCE_LINK_SOURCE =
  `${COSMIK_CONNECTION_COLLECTION}:${COSMIK_CONNECTION_SOURCE_PATH}` as const;

/** @deprecated Use {@link COSMIK_CONNECTION_TARGET_LINK_SOURCE}. */
export const COSMIK_CONNECTION_LINK_SOURCE =
  COSMIK_CONNECTION_TARGET_LINK_SOURCE;

export const COSMIK_CONNECTION_LINK_SOURCES = [
  COSMIK_CONNECTION_TARGET_LINK_SOURCE,
  COSMIK_CONNECTION_SOURCE_LINK_SOURCE,
] as const;

/** In-body link citations from other standard.site / Leaflet documents. */
export const CITATION_COLLECTIONS = [
  "site.standard.document",
  "pub.leaflet.document",
] as const;

export const CITATION_URL_PATHS = [
  ".content.pages[pub.leaflet.pages.linearDocument].blocks[pub.leaflet.pages.linearDocument#block].block.facets[].features[pub.leaflet.richtext.facet#link].uri",
  ".content.pages[pub.leaflet.pages.linearDocument].blocks[pub.leaflet.pages.linearDocument#block].block.children[pub.leaflet.blocks.unorderedList#listItem].content.facets[].features[pub.leaflet.richtext.facet#link].uri",
  ".content.items[app.offprint.block.text].facets[].features[app.offprint.richtext.facet#link].uri",
  ".content.items[blog.pckt.block.text].facets[].features[blog.pckt.richtext.facet#link].uri",
  ".pages[pub.leaflet.pages.linearDocument].blocks[].block.facets[].features[pub.leaflet.richtext.facet#link].uri",
] as const;

/** Citation link sources as legacy `/links` collection + path specs. */
export const CITATION_LINK_SOURCES = CITATION_COLLECTIONS.flatMap(
  (collection) =>
    CITATION_URL_PATHS.map((path) => `${collection}:${path}` as const),
);

/** All Constellation sources Standard Reader queries for Discussion + extras. */
export const DISCUSSION_LINK_SOURCES = [
  ...BSKY_POST_LINK_SOURCES,
  ...MARGIN_DISCUSSION_LINK_SOURCES,
] as const;

export interface ConstellationLinkSourceSummary {
  collection: string;
  path: string;
  records: number;
  distinctDids: number;
}

export interface ConstellationAllLinksResult {
  sources: Array<ConstellationLinkSourceSummary>;
}

function constellationBaseUrl(): string {
  const configured = process.env.CONSTELLATION_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return DEFAULT_CONSTELLATION_URL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHttpUrl(target: string): boolean {
  return /^https?:\/\//i.test(target);
}

function parseSourceSpec(source: string): {
  collection: string;
  path: string;
} | null {
  const colon = source.indexOf(":");
  if (colon <= 0) return null;
  const collection = source.slice(0, colon);
  const path = source.slice(colon + 1);
  if (!collection || !path) return null;
  return { collection, path };
}

function parseBacklinkRecord(
  value: unknown,
): ConstellationBacklinkRecord | null {
  if (!isRecord(value)) return null;
  const { did, collection, rkey } = value;
  if (
    typeof did !== "string" ||
    typeof collection !== "string" ||
    typeof rkey !== "string"
  ) {
    return null;
  }
  if (!did.startsWith("did:") || !collection || !rkey) return null;
  return { did, collection, rkey };
}

function constellationHeaders(): HeadersInit {
  return {
    Accept: "application/json",
    "User-Agent": "standard-reader (comments)",
  };
}

function parseBacklinksPayload(payload: unknown): ConstellationBacklinksResult {
  const empty: ConstellationBacklinksResult = {
    total: 0,
    records: [],
    cursor: null,
  };
  if (!isRecord(payload)) return empty;

  const rawRecords = payload.records ?? payload.linking_records;
  const records = Array.isArray(rawRecords)
    ? rawRecords
        .map((row) => parseBacklinkRecord(row))
        .filter((row): row is ConstellationBacklinkRecord => row != null)
    : [];

  const total =
    typeof payload.total === "number" ? payload.total : records.length;
  const nextCursor =
    typeof payload.cursor === "string" && payload.cursor.length > 0
      ? payload.cursor
      : null;

  return { total, records, cursor: nextCursor };
}

function parseBacklinksCountPayload(payload: unknown): number {
  if (!isRecord(payload)) return 0;
  return typeof payload.total === "number" ? payload.total : 0;
}

function parseLegacyCountBody(body: string): number {
  const trimmed = body.trim();
  if (!trimmed) return 0;
  const parsed = Number.parseInt(trimmed, 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Total backlinks for one target + source via Constellation's count endpoint.
 * Best-effort; returns 0 on timeout or any network/parse failure.
 */
async function fetchBacklinksCount({
  target,
  source,
}: {
  target: string;
  source: string;
}): Promise<number> {
  if (!target.trim() || !source.trim()) return 0;

  const parsed = parseSourceSpec(source);
  if (!parsed) return 0;

  try {
    const useLegacyLinks = isHttpUrl(target);
    const url = useLegacyLinks
      ? new URL("/links/count", constellationBaseUrl())
      : new URL(
          "/xrpc/blue.microcosm.links.getBacklinksCount",
          constellationBaseUrl(),
        );

    if (useLegacyLinks) {
      url.searchParams.set("target", target);
      url.searchParams.set("collection", parsed.collection);
      url.searchParams.set("path", parsed.path);
    } else {
      url.searchParams.set("subject", target);
      url.searchParams.set("source", source);
    }

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: constellationHeaders(),
    });
    if (!response.ok) return 0;

    if (useLegacyLinks) {
      return parseLegacyCountBody(await response.text());
    }

    return parseBacklinksCountPayload(await response.json());
  } catch {
    return 0;
  }
}

async function fetchBacklinksPage({
  target,
  source,
  cursor,
  limit,
}: {
  target: string;
  source: string;
  cursor?: string;
  limit: number;
}): Promise<ConstellationBacklinksResult> {
  const empty: ConstellationBacklinksResult = {
    total: 0,
    records: [],
    cursor: null,
  };

  if (!target.trim() || !source.trim()) return empty;

  const parsed = parseSourceSpec(source);
  if (!parsed) return empty;

  try {
    // The xrpc endpoint rejects https?:// subjects (400); use legacy /links
    // for web URLs. AT-URI and DID subjects work on xrpc.
    const useLegacyLinks = isHttpUrl(target);
    const url = useLegacyLinks
      ? new URL("/links", constellationBaseUrl())
      : new URL(
          "/xrpc/blue.microcosm.links.getBacklinks",
          constellationBaseUrl(),
        );

    if (useLegacyLinks) {
      url.searchParams.set("target", target);
      url.searchParams.set("collection", parsed.collection);
      url.searchParams.set("path", parsed.path);
    } else {
      url.searchParams.set("subject", target);
      url.searchParams.set("source", source);
    }
    url.searchParams.set("limit", String(limit));
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: constellationHeaders(),
    });
    if (!response.ok) return empty;

    return parseBacklinksPayload(await response.json());
  } catch {
    return empty;
  }
}

/**
 * Fetch records linking to `target` via the given `source` collection:path spec.
 * Returns empty on timeout or any network/parse failure (best-effort).
 */
export async function getBacklinks({
  target,
  source,
  cursor,
  limit = 100,
}: {
  target: string;
  source: string;
  cursor?: string;
  limit?: number;
}): Promise<ConstellationBacklinksResult> {
  return fetchBacklinksPage({ target, source, cursor, limit });
}

/** Fetch all pages of backlinks for one target + source. */
async function getAllBacklinksForSource(
  target: string,
  source: string,
): Promise<Array<ConstellationBacklinkRecord>> {
  const merged: Array<ConstellationBacklinkRecord> = [];
  let cursor: string | undefined;

  do {
    const page = await fetchBacklinksPage({
      target,
      source,
      cursor,
      limit: 100,
    });
    merged.push(...page.records);
    cursor = page.cursor ?? undefined;
  } while (cursor);

  return merged;
}

/**
 * Cheap backlink total for trending — Constellation count endpoint per source.
 * Best-effort; returns 0 on failure.
 */
export async function getBacklinkCountForTarget(
  target: string,
): Promise<number> {
  if (!target.trim()) return 0;

  const totals = await Promise.all(
    BSKY_POST_LINK_SOURCES.map((source) =>
      fetchBacklinksCount({ target, source }),
    ),
  );

  return totals.reduce((sum, n) => sum + n, 0);
}

function mergeBacklinkRecords(
  results: Array<Array<ConstellationBacklinkRecord>>,
  collections: ReadonlySet<string>,
): Array<ConstellationBacklinkRecord> {
  const seen = new Set<string>();
  const merged: Array<ConstellationBacklinkRecord> = [];

  for (const records of results) {
    for (const record of records) {
      if (!collections.has(record.collection)) continue;
      const key = `${record.did}/${record.collection}/${record.rkey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(record);
    }
  }

  return merged;
}

/** Query all configured Bluesky post link sources for a target. */
export async function getPostBacklinksForTarget(
  target: string,
): Promise<Array<ConstellationBacklinkRecord>> {
  const results = await Promise.all(
    BSKY_POST_LINK_SOURCES.map((source) =>
      getAllBacklinksForSource(target, source),
    ),
  );

  return mergeBacklinkRecords(results, new Set([BSKY_POST_COLLECTION]));
}

/** Query all configured margin Discussion link sources for a target URL. */
export async function getMarginNoteBacklinksForTarget(
  target: string,
): Promise<Array<ConstellationBacklinkRecord>> {
  const results = await Promise.all(
    MARGIN_DISCUSSION_LINK_SOURCES.map((source) =>
      getAllBacklinksForSource(target, source),
    ),
  );

  return mergeBacklinkRecords(results, new Set(MARGIN_DISCUSSION_COLLECTIONS));
}

/** Cheap margin-note total for one URL (deduped across margin collections). */
export async function getMarginNoteBacklinkCountForTarget(
  target: string,
): Promise<number> {
  const records = await getMarginNoteBacklinksForTarget(target);
  return records.length;
}

/** Reply count for a margin note AT-URI via Constellation. */
export async function getMarginReplyCountForNote(
  noteUri: string,
): Promise<number> {
  if (!noteUri.startsWith("at://")) return 0;
  return fetchBacklinksCount({
    target: noteUri,
    source: MARGIN_REPLY_LINK_SOURCE,
  });
}

function parseAllLinksPayload(payload: unknown): ConstellationAllLinksResult {
  const empty: ConstellationAllLinksResult = { sources: [] };
  if (!isRecord(payload)) return empty;

  const links = payload.links;
  if (!isRecord(links)) return empty;

  const sources: Array<ConstellationLinkSourceSummary> = [];
  for (const [collection, paths] of Object.entries(links)) {
    if (!isRecord(paths)) continue;
    for (const [path, stats] of Object.entries(paths)) {
      if (!isRecord(stats)) continue;
      const records = typeof stats.records === "number" ? stats.records : 0;
      const distinctDids =
        typeof stats.distinct_dids === "number" ? stats.distinct_dids : 0;
      if (records <= 0) continue;
      sources.push({ collection, path, records, distinctDids });
    }
  }

  sources.sort((a, b) => b.records - a.records);
  return { sources };
}

/**
 * All indexed link sources for one target — Constellation `/links/all`.
 * Best-effort; returns empty on timeout or failure.
 */
export async function getAllLinkSourcesForTarget(
  target: string,
): Promise<ConstellationAllLinksResult> {
  if (!target.trim()) return { sources: [] };

  try {
    const url = new URL("/links/all", constellationBaseUrl());
    url.searchParams.set("target", target);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: constellationHeaders(),
    });
    if (!response.ok) return { sources: [] };

    return parseAllLinksPayload(await response.json());
  } catch {
    return { sources: [] };
  }
}

/** Cosmik connections where `target` is the linked article URL. */
export async function getCosmikConnectionBacklinksForTarget(
  target: string,
): Promise<Array<ConstellationBacklinkRecord>> {
  const records = await getAllBacklinksForSource(
    target,
    COSMIK_CONNECTION_TARGET_LINK_SOURCE,
  );
  return mergeBacklinkRecords(
    [records],
    new Set([COSMIK_CONNECTION_COLLECTION]),
  );
}

/** Cosmik connections where `source` is the linked article URL. */
export async function getCosmikConnectionBacklinksForSource(
  target: string,
): Promise<Array<ConstellationBacklinkRecord>> {
  const records = await getAllBacklinksForSource(
    target,
    COSMIK_CONNECTION_SOURCE_LINK_SOURCE,
  );
  return mergeBacklinkRecords(
    [records],
    new Set([COSMIK_CONNECTION_COLLECTION]),
  );
}

/** Cosmik connections where the article URL appears on either endpoint. */
export async function getCosmikConnectionBacklinksForUrl(
  url: string,
): Promise<Array<ConstellationBacklinkRecord>> {
  const [asTarget, asSource] = await Promise.all([
    getCosmikConnectionBacklinksForTarget(url),
    getCosmikConnectionBacklinksForSource(url),
  ]);
  return mergeBacklinkRecords(
    [asTarget, asSource],
    new Set([COSMIK_CONNECTION_COLLECTION]),
  );
}

/** Other documents whose body links to `target`. */
export async function getCitationBacklinksForTarget(
  target: string,
): Promise<Array<ConstellationBacklinkRecord>> {
  const results = await Promise.all(
    CITATION_LINK_SOURCES.map((source) =>
      getAllBacklinksForSource(target, source),
    ),
  );

  return mergeBacklinkRecords(results, new Set(CITATION_COLLECTIONS));
}

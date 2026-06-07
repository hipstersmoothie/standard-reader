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

/** JSON paths in `app.bsky.feed.post` where a linked URL may appear. */
export const BSKY_POST_LINK_PATHS = [
  ".embed.external.uri",
  ".facets[].features[app.bsky.richtext.facet#link].uri",
] as const;

/** Bluesky post link sources as `collection:path` for the xrpc API. */
export const BSKY_POST_LINK_SOURCES = BSKY_POST_LINK_PATHS.map(
  (path) => `${BSKY_POST_COLLECTION}:${path}` as const,
);

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

/** Query all configured link sources for a target and union the results. */
export async function getPostBacklinksForTarget(
  target: string,
): Promise<Array<ConstellationBacklinkRecord>> {
  const results = await Promise.all(
    BSKY_POST_LINK_SOURCES.map((source) =>
      getAllBacklinksForSource(target, source),
    ),
  );

  const seen = new Set<string>();
  const merged: Array<ConstellationBacklinkRecord> = [];

  for (const records of results) {
    for (const record of records) {
      if (record.collection !== BSKY_POST_COLLECTION) continue;
      const key = `${record.did}/${record.rkey}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(record);
    }
  }

  return merged;
}

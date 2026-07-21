import { refreshIdentity } from "#/server/atproto/identity";
import { parseAtUri } from "#/server/atproto/uri";

const DEFAULT_SLINGSHOT_URL = "https://slingshot.microcosm.blue";
/** Default per-request timeout for unauthenticated repo reads. */
const DEFAULT_FETCH_TIMEOUT_MS = 8000;
/** Page size for `com.atproto.repo.listRecords`. */
const LIST_PAGE = 100;
/** Per-request timeout for paginated `listRecords` reconcile calls. */
const LIST_FETCH_TIMEOUT_MS = 15_000;

/**
 * Slingshot is a caching proxy over repo records; faster and more reliable
 * than hitting the author's PDS directly (which may be slow or unreachable).
 *
 * The URL is configurable via `SLINGSHOT_URL` on the server (process.env) or
 * `VITE_SLINGSHOT_URL` in the browser (Vite only exposes VITE_-prefixed vars to
 * client bundles). Falls back to the public default when neither is set, so
 * client-side callers (leaflet polls, pckt galleries) work out of the box.
 */
export function slingshotBaseUrl(): string {
  const configured =
    (typeof process !== "undefined" && process.env?.SLINGSHOT_URL?.trim()) ||
    (
      import.meta as unknown as { env?: Record<string, string> }
    ).env?.VITE_SLINGSHOT_URL?.trim();
  if (configured) return configured.replace(/\/+$/, "");
  return DEFAULT_SLINGSHOT_URL;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface RecordResponse {
  /** The record value (`payload.value`); null when the record can't be fetched. */
  value: unknown | null;
  /** The base URL that served the record — useful for callers (e.g. gallery)
   * that need to know which host the blob URLs should target. */
  base: string;
  /** The record's CID (`payload.cid`); undefined when the host omitted it or the
   * record couldn't be fetched. Needed to build strongRefs for writes (e.g.
   * upvote subjects). */
  cid?: string;
}

async function getRecordFromBase(
  base: string,
  parsed: { did: string; collection: string; rkey: string },
  timeoutMs = DEFAULT_FETCH_TIMEOUT_MS,
): Promise<RecordResponse | null> {
  const cleanBase = base.replace(/\/+$/, "");
  const params = new URLSearchParams({
    repo: parsed.did,
    collection: parsed.collection,
    rkey: parsed.rkey,
  });
  const url = `${cleanBase}/xrpc/com.atproto.repo.getRecord?${params}`;
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) return null;
    const payload: unknown = await response.json();
    if (!isRecord(payload) || !isRecord(payload.value)) return null;
    const cid = typeof payload.cid === "string" ? payload.cid : undefined;
    return { value: payload.value, base: cleanBase, ...(cid ? { cid } : {}) };
  } catch {
    return null;
  }
}

/**
 * Fetch a repo record value (with the base URL that served it).
 *
 * Tries Slingshot (a caching proxy aggregating repo records) first, then falls
 * back to the author's PDS when Slingshot doesn't have the record. `pds` is
 * optional — omit it when the caller doesn't already know the PDS; this fn
 * only needs it for the fallback and can fetch from Slingshot alone when null.
 *
 * This is the only unauthenticated repo-record read primitive in the codebase.
 * Write-path freshness reads (edit-after-create) must use the authenticated
 * `@atcute/client` `getRecord` instead — Slingshot is a cache and can lag.
 */
export async function fetchRepoRecordWithFallback(
  uri: string,
  pds?: string | null,
  timeoutMs?: number,
): Promise<RecordResponse | null> {
  const parsed = parseAtUri(uri);
  if (!parsed) return null;

  const fromSlingshot = await getRecordFromBase(
    slingshotBaseUrl(),
    parsed,
    timeoutMs,
  );
  if (fromSlingshot) return fromSlingshot;

  if (pds) {
    const fromPds = await getRecordFromBase(pds, parsed, timeoutMs);
    if (fromPds) return fromPds;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// listRecords — paginated repo-record enumeration with migration retry.
// ─────────────────────────────────────────────────────────────────────────────

export interface ListedRecord {
  uri: string;
  cid?: string;
  value?: Record<string, unknown>;
}

/**
 * Thrown when a repo host responds with a permanent "repo not found" error —
 * the repo was deleted or migrated away from the host the PLC directory points
 * at. Distinct from transient failures (502, fetch failed, timeout) so the
 * caller can mark the tracked repo `gone` instead of retrying every tick.
 *
 * `pds` is the host that returned the gone response; `triedFreshIdentity` is
 * true when {@link listRepoRecords} already refreshed the DID doc and retried
 * against a fresh PDS before re-throwing, so callers know not to retry the
 * identity refresh themselves.
 */
export class RepoGoneError extends Error {
  constructor(
    public readonly did: string,
    public readonly pds: string,
    message: string,
    public readonly triedFreshIdentity: boolean = false,
  ) {
    super(message);
    this.name = "RepoGoneError";
  }
}

/**
 * Read the host's error body and classify the failure. Returns a `RepoGoneError`
 * for permanent "repo not found" responses, or a generic `Error` (with the host
 * `error`/`message` surfaced) for transient / unknown failures so the caller
 * keeps retrying.
 */
async function classifyRecordError(
  res: Response,
  did: string,
  host: string,
  collection: string,
  triedFreshIdentity: boolean,
): Promise<Error> {
  let hostError = "";
  let hostMessage = "";
  try {
    const body = (await res.json()) as { error?: string; message?: string };
    hostError = body.error ?? "";
    hostMessage = body.message ?? "";
  } catch {
    // Not JSON; fall through to the status-only message.
  }
  const detail = hostError
    ? `: ${hostError}${hostMessage ? ` (${hostMessage})` : ""}`
    : "";
  // PDSes return 400 InvalidRequest + a "repo"/"not found" message when the
  // repo was deleted or migrated away from that PDS. 404 is the same signal
  // from some PDSes. Both are permanent for that host.
  const gone =
    (res.status === 400 || res.status === 404) &&
    (/repo.*not found|could not find repo|target repository not found/i.test(
      `${hostError} ${hostMessage}`,
    ) ||
      hostError === "RepoNotFound" ||
      hostError === "RepoDeactivated");
  if (gone) {
    return new RepoGoneError(
      did,
      host,
      `listRecords ${collection} failed: ${res.status}${detail}`,
      triedFreshIdentity,
    );
  }
  return new Error(`listRecords ${collection} failed: ${res.status}${detail}`);
}

/**
 * Paginate `com.atproto.repo.listRecords` against a single host. Throws
 * `RepoGoneError` if the host reports the repo is permanently gone, or a
 * generic `Error` for transient failures.
 *
 * `limit` caps the total records returned (across all pages); pagination stops
 * once it's reached. Omit it to enumerate every record in the collection.
 */
async function listRecordsFromHost(
  host: string,
  did: string,
  collection: string,
  triedFreshIdentity: boolean,
  limit?: number,
): Promise<Array<ListedRecord>> {
  const records: Array<ListedRecord> = [];
  let cursor: string | undefined;
  do {
    const url = new URL("/xrpc/com.atproto.repo.listRecords", host);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", collection);
    // Shrink the page size when a caller only needs a few records (e.g. search
    // preview, discover-fixture probe) so we don't fetch a full 100-row page
    // just to throw most of it away.
    const pageSize = limit
      ? Math.min(LIST_PAGE, Math.max(1, limit - records.length))
      : LIST_PAGE;
    url.searchParams.set("limit", String(pageSize));
    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(LIST_FETCH_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw await classifyRecordError(
        res,
        did,
        host,
        collection,
        triedFreshIdentity,
      );
    }
    const body = (await res.json()) as {
      cursor?: string;
      records?: Array<ListedRecord>;
    };
    const page = body.records ?? [];
    records.push(...page);
    if (limit && records.length >= limit) {
      return records.slice(0, limit);
    }
    cursor = page.length === pageSize ? body.cursor : undefined;
  } while (cursor);
  return records;
}

export interface ListRepoRecordsResult {
  records: Array<ListedRecord>;
  /** Host that served the records — Slingshot, the original PDS, or a fresh PDS
   * after migration. Useful for observability + detecting migration. */
  servedBy: string;
  /** True when records came from a fresh PDS after the cached identity was
   * stale (repo migrated). `servedBy` is the new PDS in that case. */
  migrated?: boolean;
  /** The PDS we originally tried (cached identity) before the migration retry.
   * Present only when `migrated` is true. */
  migratedFrom?: string;
}

/**
 * List every record in `collection` for `did`.
 *
 * Tries Slingshot first (it aggregates records across PDSes and serves cached
 * copies even after a migration). If Slingshot doesn't have the records, falls
 * back to the author's PDS (`pds` argument — usually the cached identity's
 * PDS). If the PDS reports the repo is permanently gone, refreshes the DID doc
 * (the repo may have migrated to a new PDS) and retries once against the fresh
 * PDS before re-throwing `RepoGoneError`. Slingshot errors don't trigger the
 * migration retry — they're treated as a soft miss and we fall through to the
 * PDS.
 *
 * `pds` may be null when the caller has no cached PDS; in that case we rely on
 * Slingshot alone and never hit a PDS directly.
 *
 * `limit` caps the total records returned (across all pages). Use it for
 * preview-style reads (search, discover probes) that don't need the full
 * collection; omit it to enumerate everything (reconcile, backfill).
 */
export async function listRepoRecords(
  did: string,
  collection: string,
  pds: string | null,
  limit?: number,
): Promise<ListRepoRecordsResult> {
  // Slingshot first — it's a cache and won't return a "repo gone" error, just
  // an empty list or a soft failure when it doesn't have the records.
  try {
    const records = await listRecordsFromHost(
      slingshotBaseUrl(),
      did,
      collection,
      false,
      limit,
    );
    if (records.length > 0) {
      return { records, servedBy: slingshotBaseUrl() };
    }
  } catch {
    // Slingshot soft failure — fall through to the PDS.
  }

  if (!pds) {
    return { records: [], servedBy: slingshotBaseUrl() };
  }

  try {
    const records = await listRecordsFromHost(
      pds,
      did,
      collection,
      false,
      limit,
    );
    return { records, servedBy: pds };
  } catch (error: unknown) {
    if (!(error instanceof RepoGoneError) || error.triedFreshIdentity) {
      throw error;
    }
    // PDS reports gone — the repo may have migrated. Refresh the DID doc and
    // retry once against the fresh PDS before declaring the repo gone.
    const fresh = await refreshIdentity(did);
    if (!fresh.pds || fresh.pds === pds) {
      // Same PDS (or couldn't resolve a new one) — repo is truly gone.
      throw new RepoGoneError(
        did,
        pds,
        `listRecords ${collection} failed: repo gone at ${pds}`,
        true,
      );
    }
    const records = await listRecordsFromHost(
      fresh.pds,
      did,
      collection,
      true,
      limit,
    );
    return {
      records,
      servedBy: fresh.pds,
      migrated: true,
      migratedFrom: pds,
    };
  }
}

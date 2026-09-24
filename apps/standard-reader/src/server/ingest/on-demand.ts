import { fetchRepoRecordWithFallback } from "../atproto/fetch-record.ts";
import { resolveIdentity } from "../atproto/identity.ts";
/**
 * On-demand indexing of a single document the stream hasn't delivered yet.
 *
 * Publishers link to `/a/{did}/{rkey}` the moment `putRecord` returns — bots
 * post the URL in a reply, and OG scrapers fetch it within the second. The
 * Jetstream ingester usually mirrors the record a moment later, but "usually"
 * and "a moment" are the problem: until it lands, the article page and
 * `getDocument` answer "not found", and whatever scraped the link keeps that
 * answer for good.
 *
 * So a read-path miss gets one chance to fetch the record from the author's
 * repo and push it through the same `upsertDocument` the stream uses — the row
 * it writes is indistinguishable from a streamed one, and the stream's own
 * event for the record converges on it (upserts are idempotent). This is the
 * "fall back to the PDS once, then serve from the DB" rule applied to a single
 * record rather than a whole collection.
 *
 * The fallback is reachable by anyone with a URL, so it is bounded: only
 * `site.standard.document` URIs, one attempt per URI per {@link RETRY_AFTER_MS}
 * (success or failure), concurrent fetches deduped per URI and capped overall,
 * and a short timeout so a slow PDS can't hold a page render hostage.
 */
import type { DocumentRecord } from "../atproto/types.ts";
import { Collections, parseAtUri } from "../atproto/uri.ts";
import { logEvent } from "../observability/log.ts";
import { upsertDocument } from "./handlers.ts";

/** How long a URI is left alone after an attempt, whatever its outcome. */
const RETRY_AFTER_MS = 60_000;
/** Cap on remembered attempts; the oldest are forgotten first. */
const MAX_REMEMBERED = 5000;
/** Cap on on-demand fetches in flight across the whole process. */
const MAX_CONCURRENT = 8;
/** Per-request timeout for the record fetch — this sits on a page render. */
const FETCH_TIMEOUT_MS = 4000;

const DID_PATTERN = /^did:(?:plc:[a-z2-7]{24}|web:[a-zA-Z0-9.%:-]+)$/;
/** atproto record-key syntax. */
const RKEY_PATTERN = /^[a-zA-Z0-9._:~-]{1,512}$/;

const lastAttempt = new Map<string, number>();
const inflight = new Map<string, Promise<boolean>>();

function recentlyAttempted(uri: string, now: number): boolean {
  const at = lastAttempt.get(uri);
  return at !== undefined && now - at < RETRY_AFTER_MS;
}

function rememberAttempt(uri: string, now: number): void {
  // Re-insert so Map order tracks recency, then trim from the oldest end.
  lastAttempt.delete(uri);
  lastAttempt.set(uri, now);
  while (lastAttempt.size > MAX_REMEMBERED) {
    const oldest = lastAttempt.keys().next().value;
    if (oldest === undefined) break;
    lastAttempt.delete(oldest);
  }
}

async function fetchAndIndex(
  uri: string,
  did: string,
  rkey: string,
): Promise<boolean> {
  const start = performance.now();
  let outcome = "indexed";
  try {
    const identity = await resolveIdentity(did);
    // Ask the PDS first: the record is minutes old at most, and Slingshot is a
    // cache that may not have seen it yet.
    const fetched = await fetchRepoRecordWithFallback(
      uri,
      identity.pds,
      FETCH_TIMEOUT_MS,
      { preferPds: true },
    );
    const record = fetched?.value as DocumentRecord | null | undefined;
    if (!record) {
      outcome = "not-in-repo";
      return false;
    }
    await upsertDocument(uri, did, rkey, fetched?.cid, record);
    return true;
  } catch (error) {
    outcome = "error";
    logEvent("ingest.onDemandFailed", {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      uri,
    });
    return false;
  } finally {
    logEvent("ingest.onDemand", {
      durationMs: Math.round(performance.now() - start),
      ok: outcome === "indexed",
      outcome,
      uri,
    });
  }
}

/**
 * Try to mirror one not-yet-indexed `site.standard.document` into the
 * read-model straight from its author's repo.
 *
 * Call it only after the DB read missed. Resolves `true` when a record was
 * fetched and handed to `upsertDocument` — the caller should re-run its read,
 * which still applies every usual filter (blocks, labels, malformed records
 * `upsertDocument` declined to store). Resolves `false`, without throwing, when
 * the URI isn't a document, was tried recently, the process is at its
 * concurrency cap, or the repo doesn't have the record.
 */
export async function indexDocumentOnDemand(uri: string): Promise<boolean> {
  const parsed = parseAtUri(uri);
  if (
    !parsed ||
    parsed.collection !== Collections.document ||
    !DID_PATTERN.test(parsed.did) ||
    !RKEY_PATTERN.test(parsed.rkey)
  ) {
    return false;
  }

  const pending = inflight.get(uri);
  if (pending) return pending;

  const now = Date.now();
  if (recentlyAttempted(uri, now) || inflight.size >= MAX_CONCURRENT) {
    return false;
  }
  rememberAttempt(uri, now);

  const attempt = fetchAndIndex(uri, parsed.did, parsed.rkey);
  inflight.set(uri, attempt);
  try {
    return await attempt;
  } finally {
    inflight.delete(uri);
  }
}

/** Test-only: forget every remembered attempt. */
export function resetOnDemandIndexingForTests(): void {
  lastAttempt.clear();
  inflight.clear();
}

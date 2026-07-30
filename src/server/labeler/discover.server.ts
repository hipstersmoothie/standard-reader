/**
 * Discover every labeler on the AT Protocol network.
 *
 * The Labelers directory should show what actually exists, not just the handful
 * of labelers someone here happens to have subscribed to. A labeler declares
 * itself by publishing one `app.bsky.labeler.service` record, so the complete
 * set is "every repo holding a record in that collection" — which relays answer
 * directly via `com.atproto.sync.listReposByCollection`.
 *
 * Each discovered DID is then resolved the normal way
 * ({@link resolveAtprotoLabeler}) and upserted into `labeler_services`, so the
 * directory read stays a plain DB query (see CLAUDE.md — read from the DB, not
 * the network). Only DIDs we have no usable row for are resolved, so the first
 * run does the bulk of the work and later runs cost two relay calls plus
 * whatever is new.
 *
 * The relay's index is close to complete but not authoritative — it only covers
 * repos that relay carries, and labelers are missed in practice. Discovery is
 * therefore additive: it seeds the directory in bulk, while subscribing to or
 * looking up a labeler still backfills it on demand.
 *
 * Runs on a timer in the long-lived ingest worker, never on a request path.
 *
 * Note this is *discovery only*: appearing in the directory does not mean we
 * poll a labeler for labels. That is driven by subscriptions — see
 * `syncAllLabels` in `sync.server.ts`.
 */

import { and, eq, inArray, isNull, notLike } from "drizzle-orm";

import { db as database } from "#/db/index.server";
import * as dbSchema from "#/db/schema";
import { labelerServices } from "#/db/schema";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import { chunk, mapWithConcurrency } from "#/lib/concurrency";

import { resolveAtprotoLabeler } from "./atproto-labeler.server.ts";

/** Collection a labeler declares itself in. One record per labeler, rkey `self`. */
const LABELER_COLLECTION = "app.bsky.labeler.service";

/**
 * Relay used to enumerate labeler repos. Any relay works — this is a public,
 * unauthenticated index read, not a firehose subscription.
 */
const RELAY_URL =
  process.env.ATPROTO_RELAY_URL ?? "https://relay1.us-west.bsky.network";

/** Page size for the enumeration (the relay caps this). */
const PAGE_LIMIT = 500;
/** Stop paging no matter what, so a broken cursor can't loop forever. */
const MAX_PAGES = 50;

/** How many labelers to resolve at once — each is a few network round trips. */
const RESOLVE_CONCURRENCY = 8;

/** How often the ingest worker re-scans the network for new labelers. */
const DISCOVERY_INTERVAL_MS = 6 * 60 * 60_000;

/** Rows to upsert per statement. */
const UPSERT_CHUNK = 50;

/**
 * Cap on how many unnamed rows one run tries to repair, so a systemic failure
 * (an identity resolver outage that nulls every handle) can't turn each scan
 * into hundreds of doomed round trips.
 */
const MAX_REFRESH_PER_RUN = 100;

interface ListReposByCollectionResponse {
  repos?: Array<{ did?: string }>;
  cursor?: string;
}

/**
 * Every DID that has published an `app.bsky.labeler.service` record.
 *
 * Includes labelers that have since gone away — the relay indexes the record's
 * existence, not whether the service still answers — so callers should expect a
 * meaningful share of these to fail resolution.
 */
export async function listNetworkLabelerDids(): Promise<Array<string>> {
  const dids = new Set<string>();
  let cursor: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const url = new URL(
      "/xrpc/com.atproto.sync.listReposByCollection",
      RELAY_URL,
    );
    url.searchParams.set("collection", LABELER_COLLECTION);
    url.searchParams.set("limit", String(PAGE_LIMIT));
    if (cursor) url.searchParams.set("cursor", cursor);

    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) {
      throw new Error(
        `[labelers] listReposByCollection failed with ${res.status}`,
      );
    }
    const body = (await res.json()) as ListReposByCollectionResponse;
    for (const repo of body.repos ?? []) {
      if (typeof repo.did === "string") dids.add(repo.did);
    }

    cursor = body.cursor;
    if (!cursor || (body.repos ?? []).length === 0) break;
  }

  return [...dids];
}

export interface DiscoveryResult {
  /** DIDs the relay reported. */
  discovered: number;
  /** DIDs we had no row for and tried to resolve. */
  attempted: number;
  /** New labelers written into `labeler_services`. */
  added: number;
  /** Existing rows whose missing metadata we filled in. */
  refreshed: number;
  /** DIDs that declared a record but no longer resolve to a usable service. */
  unresolvable: number;
}

/**
 * Scan the network and add any labeler we don't already know about.
 *
 * Rows we already have a handle for are left alone — re-resolving hundreds of
 * unchanged labelers every few hours would be pure waste, and their label
 * definitions are refreshed on demand by `refreshLabelerDefinitions`. Rows
 * missing a handle are re-resolved so the directory heals itself instead of
 * showing a bare DID forever.
 */
export async function syncNetworkLabelers(
  db: Db = database,
  schema: Schema = dbSchema,
): Promise<DiscoveryResult> {
  const discovered = await listNetworkLabelerDids();
  const result: DiscoveryResult = {
    discovered: discovered.length,
    attempted: 0,
    added: 0,
    refreshed: 0,
    unresolvable: 0,
  };
  if (discovered.length === 0) return result;

  // What we already hold for these DIDs, in bounded batches so the IN list
  // can't grow past what Postgres is happy to plan. Keyed by `labelerDid`
  // rather than by record URI: a labeler registered with one of our own
  // `app.standard-reader.labeler.service` records has a different URI, so
  // matching on URI would insert a second row and list it twice.
  const existing = new Map<string, { uri: string; handle: string | null }>();
  for (const batch of chunk(discovered, 500)) {
    const rows = await db
      .select({
        labelerDid: schema.labelerServices.labelerDid,
        uri: schema.labelerServices.uri,
        handle: schema.labelerServices.handle,
      })
      .from(schema.labelerServices)
      .where(inArray(schema.labelerServices.labelerDid, batch));
    for (const row of rows) {
      existing.set(row.labelerDid, { uri: row.uri, handle: row.handle });
    }
  }

  const toInsert = discovered.filter((did) => !existing.has(did));

  // Rows we hold but couldn't name, so the directory heals itself instead of
  // showing a bare DID forever. Queried from the table rather than filtered out
  // of `discovered`, because the relay's index is *not* complete: labelers whose
  // repos it doesn't carry — five of them among one test reader's real Bluesky
  // subscriptions — reach us only via the on-demand backfill, and would never be
  // repaired by a pass scoped to what the relay returned.
  //
  // did:web is excluded on purpose: those documents carry no `alsoKnownAs`, so
  // there is no handle to find and retrying forever would be pointless. Their
  // host is derived from the DID at render time instead (see `labelerHandle`).
  const unnamed = await db
    .select({
      labelerDid: schema.labelerServices.labelerDid,
      uri: schema.labelerServices.uri,
    })
    .from(schema.labelerServices)
    .where(
      and(
        eq(schema.labelerServices.deleted, false),
        isNull(schema.labelerServices.handle),
        notLike(schema.labelerServices.labelerDid, "did:web:%"),
      ),
    )
    .limit(MAX_REFRESH_PER_RUN);
  for (const row of unnamed) {
    if (!existing.has(row.labelerDid)) {
      existing.set(row.labelerDid, { uri: row.uri, handle: null });
    }
  }
  const toRefresh = unnamed.map((row) => row.labelerDid);

  result.attempted = toInsert.length + toRefresh.length;
  if (result.attempted === 0) return result;

  // One pass over both sets so RESOLVE_CONCURRENCY is the real ceiling on
  // in-flight requests rather than twice it.
  const declarations = await mapWithConcurrency(
    [...toInsert, ...toRefresh],
    RESOLVE_CONCURRENCY,
    async (did) => {
      try {
        return await resolveAtprotoLabeler(did);
      } catch {
        // A single unreachable labeler must not abort the scan.
        return null;
      }
    },
  );
  const newDeclarations = declarations.slice(0, toInsert.length);
  const refreshedDeclarations = declarations.slice(toInsert.length);

  const rows = newDeclarations.flatMap((declaration) =>
    declaration
      ? [
          {
            uri: `at://${declaration.did}/${LABELER_COLLECTION}/self`,
            ownerDid: declaration.did,
            rkey: "self",
            labelerDid: declaration.did,
            serviceEndpoint: declaration.serviceEndpoint,
            handle: declaration.handle,
            displayName: declaration.displayName,
            description: declaration.description,
            avatarUrl: declaration.avatarUrl,
            labelValueDefinitions: declaration.labelValueDefinitions,
            source: "atproto" as const,
            deleted: false,
          },
        ]
      : [],
  );
  result.unresolvable = newDeclarations.length - rows.length;

  for (const batch of chunk(rows, UPSERT_CHUNK)) {
    await db
      .insert(labelerServices)
      .values(batch)
      .onConflictDoNothing({ target: labelerServices.uri });
    result.added += batch.length;
  }

  // Update in place by URI so a `record`-sourced row keeps its identity and
  // never gains an `atproto` twin.
  for (const declaration of refreshedDeclarations) {
    if (!declaration?.handle) continue;
    const row = existing.get(declaration.did);
    if (!row) continue;
    await db
      .update(labelerServices)
      .set({
        handle: declaration.handle,
        displayName: declaration.displayName,
        description: declaration.description,
        avatarUrl: declaration.avatarUrl,
      })
      .where(eq(labelerServices.uri, row.uri));
    result.refreshed++;
  }

  return result;
}

/**
 * Periodic network scan for the long-lived ingest worker: once on start, then
 * every {@link DISCOVERY_INTERVAL_MS}.
 */
export function startLabelerDiscovery(): { stop: () => void } {
  const run = () => {
    void syncNetworkLabelers(database, dbSchema).then(
      (result) => {
        if (result.added > 0 || result.attempted > 0) {
          console.info(
            `[labelers] discovery: ${result.discovered} on network, ${result.added} added, ${result.refreshed} refreshed, ${result.unresolvable} unresolvable`,
          );
        }
      },
      (error: unknown) => {
        console.warn("[labelers] discovery failed", error);
      },
    );
  };
  run();
  const timer = setInterval(run, DISCOVERY_INTERVAL_MS);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

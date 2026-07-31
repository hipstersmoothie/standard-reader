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

import { and, eq, inArray, isNull, lt, notLike, or } from "drizzle-orm";

import { db as database } from "#/db/index.server";
import * as dbSchema from "#/db/schema";
import { labelerServices } from "#/db/schema";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import { chunk, mapWithConcurrency } from "#/lib/concurrency";

import { resolveAtprotoLabeler } from "./atproto-labeler.server.ts";
import { sampleLabels } from "./labels.server.ts";

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
  // rather than by record URI, so a row written under any other URI shape can
  // never be duplicated into a second listing for the same labeler.
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
    void syncNetworkLabelers(database, dbSchema)
      .then(async (result) => {
        if (result.added > 0 || result.attempted > 0) {
          console.info(
            `[labelers] discovery: ${result.discovered} on network, ${result.added} added, ${result.refreshed} refreshed, ${result.unresolvable} unresolvable`,
          );
        }
        // Classify a slice of the directory each run, so which labelers aim at
        // standard.site converges without any single scan spiking.
        const probe = await probeStandardSiteLabelers(database, dbSchema);
        if (probe.probed > 0) {
          console.info(
            `[labelers] probed ${probe.probed}, ${probe.standardSite} aimed at standard.site`,
          );
        }
      })
      .catch((error: unknown) => {
        console.warn("[labelers] discovery failed", error);
      });
  };
  run();
  const timer = setInterval(run, DISCOVERY_INTERVAL_MS);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

/** Labelers probed per run, so a scan never spikes into hundreds of requests. */
const PROBE_BATCH = 60;
/** How long a probe verdict stands before it is re-checked. */
const PROBE_TTL_MS = 7 * 24 * 60 * 60_000;
/** Labels sampled per labeler when deciding whether it aims at standard.site. */
const PROBE_SAMPLE = 250;

/**
 * Decide which labelers are aimed at **standard.site** and record it.
 *
 * A labeler qualifies when something it labels is ours: a
 * `site.standard.document` URI, or the account of a publisher we index.
 * pub-search is the motivating case — it labels *publisher accounts*
 * (`bulk-mirror` on the DIDs behind drivepatents.com, crownnote.com, …), never
 * document URIs, so a document-only test misses it entirely.
 *
 * This can't be read out of `document_labels`: that table only holds labels for
 * labelers somebody already subscribes to, and a directory is for finding the
 * ones you haven't. So each labeler is asked directly, one sampled page.
 *
 * Sampling is the honest trade. A labeler built for standard.site labels little
 * else, so it shows up in the first page; a Bluesky-facing labeler with 50k
 * labels might have a handful of ours further in and be missed. That is the
 * intended reading — "aimed at this network", not "has ever touched it".
 *
 * Bounded to {@link PROBE_BATCH} per run and best-effort per labeler, so the
 * whole directory converges over a few scans without ever spiking.
 */
export async function probeStandardSiteLabelers(
  db: Db = database,
  schema: Schema = dbSchema,
): Promise<{ probed: number; standardSite: number }> {
  const svc = schema.labelerServices;
  const stale = await db
    .select({ labelerDid: svc.labelerDid, uri: svc.uri })
    .from(svc)
    .where(
      and(
        eq(svc.deleted, false),
        or(
          isNull(svc.labelsProbedAt),
          lt(svc.labelsProbedAt, new Date(Date.now() - PROBE_TTL_MS)),
        ),
      ),
    )
    .limit(PROBE_BATCH);
  if (stale.length === 0) return { probed: 0, standardSite: 0 };

  const verdicts = await mapWithConcurrency(
    stale,
    RESOLVE_CONCURRENCY,
    async (row) => {
      try {
        const { labels } = await sampleLabels(row.labelerDid, PROBE_SAMPLE);
        const subjects = [...new Set(labels.map((l) => l.uri))];
        return { ...row, hit: await labelsOurCorpus(db, schema, subjects) };
      } catch {
        // Unreachable or misbehaving: leave it unprobed to retry next run.
        return null;
      }
    },
  );

  let standardSite = 0;
  for (const verdict of verdicts) {
    if (!verdict) continue;
    if (verdict.hit) standardSite++;
    await db
      .update(labelerServices)
      .set({ labelsStandardSite: verdict.hit, labelsProbedAt: new Date() })
      .where(eq(labelerServices.uri, verdict.uri));
  }
  return { probed: verdicts.filter(Boolean).length, standardSite };
}

/**
 * Whether this labeler is *aimed* at standard.site, by what share of a sample it
 * points at our corpus — a document URI, or the account of a publisher we index.
 *
 * A share, not "any": with 250 subjects sampled, almost every general-purpose
 * labeler eventually tags somebody who also publishes here, and an any-match
 * test flagged 21 of them — Pride Labeller, Warhammer Labeler, NFLair. The
 * measured distribution separates cleanly, so the threshold isn't arbitrary:
 * pub-search is 94% ours, GitHub Contributor Labeler 32% (it labels GitHub
 * users, some of whom publish here — correctly not one of ours), and everything
 * else 0–6%.
 */
const STANDARD_SITE_SHARE = 0.5;
/**
 * Below this many subjects a share means nothing. At 5, two incidental matches
 * clear the threshold: it flagged Kevara Labeler and colibri, each of which has
 * five labels total and happened to tag a publisher. pub-search samples 16, so
 * this floor separates "aimed at standard.site" from "too small to tell".
 */
const MIN_PROBE_SUBJECTS = 10;

async function labelsOurCorpus(
  db: Db,
  schema: Schema,
  subjects: Array<string>,
): Promise<boolean> {
  if (subjects.length < MIN_PROBE_SUBJECTS) return false;

  // Document subjects are decidable from the URI alone.
  let ours = subjects.filter((uri) =>
    uri.includes("/site.standard.document/"),
  ).length;

  const dids = subjects.filter((uri) => uri.startsWith("did:"));
  for (const batch of chunk(dids, 200)) {
    const hits = await db
      .selectDistinct({ did: schema.publications.did })
      .from(schema.publications)
      .where(
        and(
          inArray(schema.publications.did, batch),
          eq(schema.publications.deleted, false),
        ),
      );
    ours += hits.length;
  }
  return ours / subjects.length >= STANDARD_SITE_SHARE;
}

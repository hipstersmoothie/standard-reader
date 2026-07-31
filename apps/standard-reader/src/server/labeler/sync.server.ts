/**
 * Mirror labeler labels into the read-model.
 *
 * This is the only place that contacts a labeler over HTTP. It pulls each
 * registered labeler's active labels and full-replaces that labeler's rows in
 * `document_labels`, so request paths can resolve labels with a plain SQL JOIN
 * (see `labels.server.ts`). Run it on a schedule from the ingest worker.
 */

import { and, eq, exists, or, sql } from "drizzle-orm";

import { db as database } from "#/db/index.server";
import * as dbSchema from "#/db/schema";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import { chunk, mapWithConcurrency } from "#/lib/concurrency";
import { isRenderableLabelSubject } from "#/lib/label-subjects";

import { fetchLabelerLabelsSince } from "./labels.server.ts";

/**
 * How often the ingest worker re-syncs labeler labels into the read-model.
 *
 * Hourly, not the old two minutes. The interval — not the number of labelers —
 * is what sets the load: at two minutes that is 720 runs a day, so covering the
 * ~190 reachable labelers would have meant 135k requests a day to other
 * people's servers. Hourly makes the same coverage ~4.5k. Labels are not
 * time-critical the way a feed is; a label arriving within the hour is fine.
 */
const SYNC_INTERVAL_MS = 60 * 60_000;

/**
 * Labelers synced at once. They are independent HTTP endpoints, so the run is
 * bound by the slowest few rather than the sum — sequentially, ~190 labelers at
 * a 4s timeout each is over 12 minutes of mostly waiting.
 */
const SYNC_CONCURRENCY = 8;

/**
 * Rows per insert statement.
 *
 * Postgres binds parameters with an int16 count, capping a single statement at
 * 65535, and this insert binds four per row. A labeler's first sync pulls its
 * whole history — Blacksky returned ~22.5k labels (90,140 parameters) and failed
 * with `bind message has 24700 parameter formats but 0 parameters`, while
 * Skywatch's ~55k exhausted drizzle's stack building one giant statement. Both
 * are network-sized inputs, not edge cases, so the write is always chunked.
 */
const INSERT_CHUNK = 1000;

/** Negations per delete statement (two bound parameters each). */
const DELETE_CHUNK = 500;

/**
 * Apply one labeler's new labels since its last synced cursor: upsert active
 * labels, delete negated ones, then persist the new cursor. Incremental by
 * design — only the labels emitted since last time cross the wire, instead of
 * re-fetching (and re-diffing) the labeler's entire history every run.
 */
export async function syncLabelerLabels(
  db: Db,
  schema: Schema,
  labelerDid: string,
): Promise<number> {
  const state = await db
    .select({ cursor: schema.labelSyncState.cursor })
    .from(schema.labelSyncState)
    .where(eq(schema.labelSyncState.labelerDid, labelerDid))
    .limit(1);

  const { diff, cursor, rejected, error } = await fetchLabelerLabelsSince(
    labelerDid,
    state[0]?.cursor ?? undefined,
  );

  // A labeler serving labels we can't attribute to it is worth shouting about:
  // either its signing key rotated in a way its DID document doesn't reflect,
  // or something is forging labels under its DID. We drop them either way.
  if (rejected > 0) {
    console.warn(
      `[labels] rejected ${rejected} unverifiable label(s) from ${labelerDid}`,
    );
  }

  // Keep only what this app can render — see `isRenderableLabelSubject`. Most
  // labelers spend themselves on Bluesky posts, which have no surface here.
  const active = diff.active.filter((l) => isRenderableLabelSubject(l.uri));
  const negated = diff.negated.filter((l) => isRenderableLabelSubject(l.uri));

  const dl = schema.documentLabels;
  for (const batch of chunk(active, INSERT_CHUNK)) {
    await db
      .insert(dl)
      .values(
        batch.map((l) => ({
          src: labelerDid,
          uri: l.uri,
          val: l.val,
          cts: l.cts ? new Date(l.cts) : null,
        })),
      )
      .onConflictDoUpdate({
        target: [dl.src, dl.uri, dl.val],
        set: { cts: sql`excluded.cts`, syncedAt: sql`now()` },
      });
  }

  // Negations are deleted a batch per statement rather than one at a time: a
  // labeler with thousands of them otherwise means thousands of sequential
  // round trips, and this database is a region away from the worker.
  for (const batch of chunk(negated, DELETE_CHUNK)) {
    const matches = batch.map((n) =>
      and(eq(dl.src, n.src), eq(dl.uri, n.uri), eq(dl.val, n.val)),
    );
    await db.delete(dl).where(or(...matches));
  }

  // Health is recorded alongside the cursor so the labeler page can tell a
  // labeler that is broken or unreachable from one that has simply labeled
  // nothing — indistinguishable to a reader otherwise.
  const health = {
    cursor: cursor ?? null,
    storedCount: active.length,
    rejectedCount: rejected,
    lastError: error ?? null,
  };
  await db
    .insert(schema.labelSyncState)
    .values({ labelerDid, ...health })
    .onConflictDoUpdate({
      target: schema.labelSyncState.labelerDid,
      set: { ...health, syncedAt: sql`now()` },
    });

  return active.length + negated.length;
}

/**
 * Sync every labeler someone actually reads with. Failures are logged and
 * skipped per-labeler.
 *
 * Scoped to labelers with at least one live subscription. **Not** every row in
 * `labeler_services`: that table mirrors the whole network for the directory
 * (hundreds of labelers, see `discover.server.ts`), and polling all of them on
 * this timer would mean tens of thousands of daily requests to other people's
 * label servers for labels nobody here has asked to see — and would fill
 * `document_labels` with them.
 *
 * Subscriptions are now the only thing that puts a labeler on this timer. There
 * used to be an exception for our own first-party labelers, which were polled
 * whether or not anyone subscribed; they no longer exist.
 */
export async function syncAllLabels(
  db: Db,
  schema: Schema,
): Promise<{ labelers: number; labels: number }> {
  const ls = schema.labelerServices;
  const subs = schema.labelerSubscriptions;
  const rows = await db
    .selectDistinct({ did: ls.labelerDid })
    .from(ls)
    .where(
      and(
        eq(ls.deleted, false),
        or(
          // Every labeler whose server still answers. `reachable` is null until
          // the probe reaches it, so an unprobed labeler is skipped rather than
          // assumed alive — 272 of 460 are dead, and syncing those is 4s of
          // timeout each, every run, forever.
          eq(ls.reachable, true),
          // Subscribed labelers are synced regardless: somebody is reading them,
          // and a stale `reachable` shouldn't silently stop their labels.
          exists(
            db
              .select({ one: sql`1` })
              .from(subs)
              .where(
                and(
                  eq(subs.labelerDid, ls.labelerDid),
                  eq(subs.deleted, false),
                ),
              ),
          ),
        ),
      ),
    );

  // Bounded concurrency, not a sequential loop: these are independent servers,
  // and one slow labeler shouldn't hold up the other 190. Errors are swallowed
  // per labeler so a single bad endpoint can't abort the run.
  const counts = await mapWithConcurrency(
    rows,
    SYNC_CONCURRENCY,
    async ({ did }) => {
      try {
        return await syncLabelerLabels(db, schema, did);
      } catch (error: unknown) {
        console.error(`[labels] sync failed for ${did}`, error);
        return 0;
      }
    },
  );
  return {
    labelers: rows.length,
    labels: counts.reduce((sum, n) => sum + n, 0),
  };
}

/**
 * Periodic label sync for the long-lived ingest worker: runs once on start and
 * every {@link SYNC_INTERVAL_MS} thereafter. This is the sole caller of the
 * labeler HTTP endpoints in production.
 */
export function startLabelSync(): { stop: () => void } {
  const run = () => {
    void syncAllLabels(database, dbSchema).then(
      ({ labelers, labels }) => {
        if (labelers > 0) {
          console.info(
            `[labels] synced ${labels} label(s) from ${labelers} labeler(s)`,
          );
        }
      },
      (error: unknown) => {
        console.warn("[labels] sync failed", error);
      },
    );
  };
  run();
  const timer = setInterval(run, SYNC_INTERVAL_MS);
  timer.unref?.();
  return { stop: () => clearInterval(timer) };
}

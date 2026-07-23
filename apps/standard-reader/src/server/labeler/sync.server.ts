/**
 * Mirror labeler labels into the read-model.
 *
 * This is the only place that contacts a labeler over HTTP. It pulls each
 * registered labeler's active labels and full-replaces that labeler's rows in
 * `document_labels`, so request paths can resolve labels with a plain SQL JOIN
 * (see `labels.server.ts`). Run it on a schedule from the ingest worker.
 */

import { and, eq, sql } from "drizzle-orm";

import { db as database } from "#/db/index.server";
import * as dbSchema from "#/db/schema";
import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";

import { fetchLabelerLabelsSince } from "./labels.server.ts";

/** How often the ingest worker re-syncs labeler labels into the read-model. */
const SYNC_INTERVAL_MS = 2 * 60_000;

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

  const { diff, cursor } = await fetchLabelerLabelsSince(
    labelerDid,
    state[0]?.cursor ?? undefined,
  );

  const dl = schema.documentLabels;
  if (diff.active.length > 0) {
    await db
      .insert(dl)
      .values(
        diff.active.map((l) => ({
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
  for (const n of diff.negated) {
    await db
      .delete(dl)
      .where(and(eq(dl.src, n.src), eq(dl.uri, n.uri), eq(dl.val, n.val)));
  }

  await db
    .insert(schema.labelSyncState)
    .values({ labelerDid, cursor: cursor ?? null })
    .onConflictDoUpdate({
      target: schema.labelSyncState.labelerDid,
      set: { cursor: cursor ?? null, syncedAt: sql`now()` },
    });

  return diff.active.length + diff.negated.length;
}

/** Sync every registered labeler. Failures are logged and skipped per-labeler. */
export async function syncAllLabels(
  db: Db,
  schema: Schema,
): Promise<{ labelers: number; labels: number }> {
  const ls = schema.labelerServices;
  const rows = await db
    .selectDistinct({ did: ls.labelerDid })
    .from(ls)
    .where(eq(ls.deleted, false));

  let labels = 0;
  for (const { did } of rows) {
    try {
      labels += await syncLabelerLabels(db, schema, did);
    } catch (error: unknown) {
      console.error(`[labels] sync failed for ${did}`, error);
    }
  }
  return { labelers: rows.length, labels };
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

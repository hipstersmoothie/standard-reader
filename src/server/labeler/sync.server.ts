/**
 * Mirror labeler labels into the read-model.
 *
 * This is the only place that contacts a labeler over HTTP. It pulls each
 * registered labeler's active labels and full-replaces that labeler's rows in
 * `document_labels`, so request paths can resolve labels with a plain SQL JOIN
 * (see `labels.server.ts`). Run it on a schedule from the ingest worker.
 */

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";

import { db as database } from "#/db/index.server";
import * as dbSchema from "#/db/schema";
import { eq } from "drizzle-orm";

import { fetchAllLabelsFromLabeler } from "./labels.server.ts";

/** How often the ingest worker re-syncs labeler labels into the read-model. */
const SYNC_INTERVAL_MS = 2 * 60_000;

/** Replace one labeler's mirrored labels with its current active set. */
export async function syncLabelerLabels(
  db: Db,
  schema: Schema,
  labelerDid: string,
): Promise<number> {
  const labels = await fetchAllLabelsFromLabeler(labelerDid);
  const dl = schema.documentLabels;
  // The neon-http driver has no transactions; run delete + insert sequentially.
  // A periodic sync tolerates the brief window (the next run restores it).
  await db.delete(dl).where(eq(dl.src, labelerDid));
  if (labels.length > 0) {
    await db.insert(dl).values(
      labels.map((l) => ({
        src: labelerDid,
        uri: l.uri,
        val: l.val,
        cts: l.cts ? new Date(l.cts) : null,
      })),
    );
  }
  return labels.length;
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

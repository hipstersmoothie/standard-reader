/**
 * Port a reader's Bluesky moderation setup into Standard Reader.
 *
 * A reader who already subscribes to labelers on Bluesky should not have to
 * rebuild that here: on their first sign-in we read their Bluesky preferences
 * and create the matching subscriptions, carrying over each labeler's per-label
 * visibility choices. After that they manage labelers here, and Bluesky is
 * never written back to (see `bsky-prefs.server.ts` for why).
 *
 * Runs **once per reader**, stamped by `user.bskyLabelersImportedAt`. Importing
 * is additive, so re-running it would resurrect any labeler the reader has
 * since unsubscribed from — the one-shot stamp is what makes their local
 * choices stick.
 */

import type { Client } from "@atcute/client";
import { eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import {
  putLabelerSubscriptionRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { upsertLabelerSubscription } from "#/server/ingest/handlers";

import { fetchBskyLabelerPrefs, prefsForLabeler } from "./bsky-prefs.server.ts";
import { resolveLabelerView } from "./resolve.server.ts";

export interface ImportResult {
  imported: number;
  skipped: number;
}

/**
 * Import the reader's Bluesky labelers, unless already done.
 *
 * Best-effort throughout: this runs on the sign-in path, so any failure — no
 * preferences scope, an unreachable labeler, a rejected record write — is
 * swallowed per labeler and never propagates. A reader whose import fails
 * simply lands with no labelers, exactly as before.
 */
export async function importBskyLabelerSubscriptions(
  client: Client,
  userId: string,
  did: string,
): Promise<ImportResult> {
  const result: ImportResult = { imported: 0, skipped: 0 };

  const user = await db.query.user.findFirst({
    where: eq(schema.user.id, userId),
    columns: { bskyLabelersImportedAt: true },
  });
  if (user?.bskyLabelersImportedAt) return result;

  const prefs = await fetchBskyLabelerPrefs(client);
  if (!prefs) return result;

  const existing = await db
    .selectDistinct({ labelerDid: schema.labelerSubscriptions.labelerDid })
    .from(schema.labelerSubscriptions)
    .where(eq(schema.labelerSubscriptions.subscriberDid, did));
  const already = new Set(existing.map((row) => row.labelerDid));

  for (const labelerDid of prefs.labelerDids) {
    if (already.has(labelerDid)) {
      result.skipped++;
      continue;
    }
    try {
      // Resolving also backfills `labeler_services`, so the labeler has a
      // directory row and a sync endpoint from the moment it is subscribed.
      const view = await resolveLabelerView(labelerDid);
      const labelValues = (view?.labelValueDefinitions ?? [])
        .map((def) => def.identifier)
        .filter((id): id is string => typeof id === "string");

      const createdAt = new Date().toISOString();
      const labelPrefs = prefsForLabeler(prefs, labelerDid, labelValues);
      const { uri, cid } = await putLabelerSubscriptionRecord(
        client,
        did,
        labelerDid,
        createdAt,
        labelPrefs,
      );
      await upsertLabelerSubscription(uri, did, subjectRkey(labelerDid), cid, {
        labeler: labelerDid,
        labels: labelPrefs,
        createdAt,
      });
      result.imported++;
    } catch (error) {
      console.warn(`Failed to import Bluesky labeler ${labelerDid}:`, error);
      result.skipped++;
    }
  }

  await db
    .update(schema.user)
    .set({ bskyLabelersImportedAt: new Date() })
    .where(eq(schema.user.id, userId));

  return result;
}

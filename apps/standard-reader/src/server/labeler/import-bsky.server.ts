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
 *
 * **Never on a path anyone waits for.** Each labeler costs a DID-document fetch,
 * two repo reads and a PDS write, so a reader with a dozen labelers was adding
 * tens of seconds to their own login when this ran inline in the OAuth callback.
 * Callers use {@link scheduleBskyLabelerImport}, which returns immediately and
 * lets the work finish after the response.
 */

import type { Client } from "@atcute/client";
import { and, eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { hasBskyPreferencesScope } from "#/integrations/auth/scope";
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

/** How many labelers to resolve at once (each is a few network round trips). */
const RESOLVE_CONCURRENCY = 6;

/** Map over `items` with a bounded number of concurrent workers, in order. */
async function mapWithConcurrency<T, R>(
  items: Array<T>,
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<Array<R>> {
  const out: Array<R> = Array.from({ length: items.length });
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i] as T);
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  );
  return out;
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

  const toImport = prefs.labelerDids.filter((d) => !already.has(d));
  result.skipped += prefs.labelerDids.length - toImport.length;

  // Resolve concurrently — this is the slow half (a DID document plus two repo
  // reads each) and it is read-only, so there is nothing to serialize.
  const resolved = await mapWithConcurrency(
    toImport,
    RESOLVE_CONCURRENCY,
    async (labelerDid) => {
      try {
        // Resolving also backfills `labeler_services`, so the labeler has a
        // directory row and a sync endpoint from the moment it is subscribed.
        const view = await resolveLabelerView(labelerDid);
        const labelValues = (view?.labelValueDefinitions ?? [])
          .map((def) => def.identifier)
          .filter((id): id is string => typeof id === "string");
        return { labelerDid, labelValues };
      } catch (error) {
        console.warn(`Failed to resolve Bluesky labeler ${labelerDid}:`, error);
        return null;
      }
    },
  );

  // Writes stay sequential: they all commit to the same repo, so issuing them
  // in parallel only invites contention and PDS rate limiting.
  for (const entry of resolved) {
    if (!entry) {
      result.skipped++;
      continue;
    }
    const { labelerDid, labelValues } = entry;
    try {
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

/**
 * Readers whose import is running in this process, so concurrent requests can't
 * stampede. Two processes can still both run one, which is harmless: the record
 * write is an idempotent `putRecord` at a deterministic rkey and the mirror is
 * an upsert.
 */
const inFlight = new Set<string>();

/**
 * Readers with nothing to do — already imported, or no preferences scope to read
 * with. Without this every page load for every signed-in reader would re-check
 * the DB, since the overwhelmingly common case is "already done".
 */
const skipUntil = new Map<string, number>();
const SKIP_TTL_MS = 60 * 60 * 1000;

/**
 * Start the reader's Bluesky labeler import in the background, if it's needed.
 *
 * Returns immediately — **nothing awaits the import**. It is called from
 * request paths (the OAuth callback and the signed-in shell read), and a reader
 * should never wait on a labeler backfill to finish signing in or to see a page.
 * The result lands in the DB, so it shows up on their next load.
 *
 * Safe to call on every request: the scope check, the one-shot stamp and the
 * in-process guards above mean the common case costs nothing.
 */
export function scheduleBskyLabelerImport(
  client: Client,
  userId: string,
  did: string,
): void {
  const skip = skipUntil.get(userId);
  if (skip !== undefined && skip > Date.now()) return;
  if (inFlight.has(userId)) return;
  inFlight.add(userId);

  void (async () => {
    try {
      const [row] = await db
        .select({
          importedAt: schema.user.bskyLabelersImportedAt,
          scope: schema.account.scope,
        })
        .from(schema.user)
        .leftJoin(
          schema.account,
          and(
            eq(schema.account.userId, schema.user.id),
            eq(schema.account.providerId, "atproto"),
          ),
        )
        .where(eq(schema.user.id, userId))
        .limit(1);

      // A session established before this scope existed can't read preferences,
      // and won't gain the grant until the reader next re-authorizes — so skip
      // rather than burning a doomed getPreferences call on every page load.
      if (row?.importedAt || !hasBskyPreferencesScope(row?.scope)) {
        skipUntil.set(userId, Date.now() + SKIP_TTL_MS);
        return;
      }

      const result = await importBskyLabelerSubscriptions(client, userId, did);
      skipUntil.set(userId, Date.now() + SKIP_TTL_MS);
      if (result.imported > 0) {
        console.info(
          `Imported ${result.imported} Bluesky labeler(s) for ${did} (${result.skipped} skipped)`,
        );
      }
    } catch (error) {
      console.warn("Background Bluesky labeler import failed:", error);
    } finally {
      inFlight.delete(userId);
    }
  })();
}

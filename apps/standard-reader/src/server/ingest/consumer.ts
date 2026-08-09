import { asc, eq, lt, sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { ingestDeadLetter, ingestState } from "../../db/schema.ts";
import type {
  BookmarkRecord,
  BskyProfileRecord,
  CollectionSidecarRecord,
  CollectionsPublicationRecord,
  DocumentRecord,
  LabelerSubscriptionRecord,
  ListRecord,
  ListSaveRecord,
  MochottArticleRecord,
  PublicationRecord,
  PublicationThemeRecord,
  ReadRecord,
  RecommendRecord,
  SidebarPrefRecord,
  SubscriptionRecord,
  TapEvent,
  TapRecordPayload,
  UserFollowRecord,
} from "../atproto/types.ts";
import { Collections, buildAtUri } from "../atproto/uri.ts";
import { logEvent } from "../observability/log.ts";
import {
  enqueuePostNotification,
  recordClaimsPublishDate,
} from "../push/enqueue.ts";
import {
  applyIdentity,
  deleteRecord,
  upsertBookmark,
  upsertBskyProfile,
  upsertCollectionSidecar,
  upsertCollectionsPublication,
  upsertDocument,
  upsertLabelerSubscription,
  upsertList,
  upsertListSave,
  upsertMochottArticle,
  upsertPublication,
  upsertPublicationTheme,
  upsertRead,
  upsertRecommend,
  upsertSidebarPref,
  upsertSubscription,
  upsertUserFollow,
} from "./handlers.ts";

const STREAM_ID = "tap";

/**
 * Collections already reported by {@link handleRecord}'s default branch.
 *
 * tap's own subscription filter is what makes that branch unreachable, so a hit
 * means the filter and this dispatcher disagree — worth knowing. But the
 * disagreement arrives at firehose volume: if a chatty collection ever slips
 * through, a per-event log would bury every other line in the service (and the
 * telemetry bill) under it. One line per collection per process names the leak,
 * which is the part we can't get anywhere else; tap already knows the rate.
 */
const reportedUnmodeledCollections = new Set<string>();

function noteUnmodeledCollection(collection: string, uri: string): void {
  if (reportedUnmodeledCollections.has(collection)) {
    return;
  }
  reportedUnmodeledCollections.add(collection);
  logEvent("ingest.recordDropped", {
    collection,
    ok: false,
    reason: "unmodeled-collection",
    uri,
  });
}

/**
 * Queue a web push notification for a document we just indexed.
 *
 * Gated on `live` because this dispatcher is shared with the PDS reconcile
 * replay (`repo-sync.ts` sets `live: false`) — without it, repairing a repo
 * would notify about its whole history. The claim inside
 * {@link enqueuePostNotification} is what covers the rest: tap redelivery,
 * dead-letter replay, and later `update` events for the same document.
 *
 * Deliberately NOT restricted to `action === "create"`. `upsertDocument`
 * resolves external bodies (Leaflet, pckt, fetched formats), and a transient
 * failure there leaves `hasRenderableBody = false` — a create-only gate would
 * find nothing and the post would never notify, because the later `update` that
 * fixes the body wouldn't try again. "The first event where it became
 * renderable" is the trigger we actually want.
 *
 * Failures are swallowed: a missed notification must never dead-letter an event
 * that was applied to the read-model successfully.
 */
async function maybeQueuePushNotification(
  uri: string,
  payload: TapRecordPayload,
  record: Record<string, unknown>,
): Promise<void> {
  if (!payload.live || !recordClaimsPublishDate(record)) {
    return;
  }
  try {
    await enqueuePostNotification(uri);
  } catch (error) {
    logEvent("push.enqueueFailed", {
      ok: false,
      reason: error instanceof Error ? error.message : String(error),
      uri,
    });
  }
}

/**
 * Apply one record event to the read-model.
 *
 * Exported because the PDS reconcile sweep replays records through this very
 * function (`#/server/ingest/repo-sync`). A repo that tap stopped streaming has
 * to be repaired from its PDS, and the repaired rows must be indistinguishable
 * from live-ingested ones — routing both through one dispatcher is what
 * guarantees that. A second, parallel "backfill" mapping would be free to drift
 * from this one, and the drift would only ever show up as a subtly wrong row in
 * whichever collection someone forgot to keep in step.
 */
export async function handleRecord(payload: TapRecordPayload): Promise<void> {
  const { did, collection, rkey, action, cid, record } = payload;
  const uri = buildAtUri(did, collection, rkey);

  if (action === "delete") {
    await deleteRecord(uri, collection);
    logEvent("ingest.tapDelete", {
      collection,
      did,
      ok: true,
      rkey,
      uri,
    });
    return;
  }

  if (!record) {
    // A create/update with no body — nothing to map, and nothing downstream
    // will ever notice on its own: the caller treats "returned without
    // throwing" as applied and acks the event, so the record is gone for good
    // until the PDS reconcile round-robin happens past this repo (days, at the
    // current sweep rate). Every other way a record fails to land leaves a
    // trace — a dead-letter row, a withheld ack — this one leaves none, so it
    // has to announce itself.
    logEvent("ingest.recordDropped", {
      action,
      collection,
      did,
      ok: false,
      reason: "no-record-body",
      rkey,
      uri,
    });
    return;
  }

  switch (collection) {
    case Collections.publication: {
      await upsertPublication(
        uri,
        did,
        rkey,
        cid,
        record as unknown as PublicationRecord,
      );
      return;
    }
    case Collections.document: {
      await upsertDocument(
        uri,
        did,
        rkey,
        cid,
        record as unknown as DocumentRecord,
      );
      await maybeQueuePushNotification(uri, payload, record);
      return;
    }
    case Collections.subscription: {
      await upsertSubscription(
        uri,
        did,
        rkey,
        cid,
        record as unknown as SubscriptionRecord,
      );
      return;
    }
    case Collections.recommend: {
      await upsertRecommend(
        uri,
        did,
        rkey,
        cid,
        record as unknown as RecommendRecord,
      );
      return;
    }
    case Collections.userFollow: {
      await upsertUserFollow(
        uri,
        did,
        rkey,
        cid,
        record as unknown as UserFollowRecord,
      );
      return;
    }
    case Collections.labelerSubscription:
    case Collections.labelerSubscriptionV2: {
      await upsertLabelerSubscription(
        uri,
        did,
        rkey,
        cid,
        record as unknown as LabelerSubscriptionRecord,
      );
      return;
    }
    case Collections.read: {
      await upsertRead(uri, did, rkey, cid, record as unknown as ReadRecord);
      return;
    }
    case Collections.bookmark: {
      await upsertBookmark(
        uri,
        did,
        rkey,
        cid,
        record as unknown as BookmarkRecord,
      );
      return;
    }
    case Collections.collection: {
      await upsertCollectionSidecar(
        did,
        rkey,
        record as unknown as CollectionSidecarRecord,
      );
      return;
    }
    case Collections.mochottArticle: {
      await upsertMochottArticle(
        did,
        rkey,
        record as unknown as MochottArticleRecord,
      );
      return;
    }
    case Collections.collectionsPublication: {
      await upsertCollectionsPublication(
        did,
        rkey,
        record as unknown as CollectionsPublicationRecord,
      );
      return;
    }
    case Collections.publicationTheme: {
      await upsertPublicationTheme(
        did,
        rkey,
        record as unknown as PublicationThemeRecord,
      );
      return;
    }
    case Collections.bskyProfile: {
      await upsertBskyProfile(
        uri,
        did,
        cid,
        record as unknown as BskyProfileRecord,
      );
      return;
    }
    case Collections.list: {
      await upsertList(uri, did, rkey, cid, record as unknown as ListRecord);
      return;
    }
    case Collections.listSave: {
      await upsertListSave(
        uri,
        did,
        rkey,
        cid,
        record as unknown as ListSaveRecord,
      );
      return;
    }
    case Collections.sidebarPref: {
      await upsertSidebarPref(
        uri,
        did,
        rkey,
        cid,
        record as unknown as SidebarPrefRecord,
      );
      return;
    }
    default: {
      // A collection we don't model (tap filtering should prevent this).
      noteUnmodeledCollection(collection, uri);
      return;
    }
  }
}

async function recordProgress(eventId: number): Promise<void> {
  await db
    .insert(ingestState)
    .values({
      id: STREAM_ID,
      lastEventId: eventId,
      lastEventAt: sql`now()`,
      eventsProcessed: 1,
    })
    .onConflictDoUpdate({
      target: ingestState.id,
      set: {
        lastEventId: sql`greatest(coalesce(${ingestState.lastEventId}, 0), ${eventId})`,
        lastEventAt: sql`now()`,
        eventsProcessed: sql`${ingestState.eventsProcessed} + 1`,
        updatedAt: sql`now()`,
      },
    });
}

async function deadLetter(event: TapEvent, error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  const collection =
    event.type === "record" ? event.record.collection : "identity";
  const action = event.type === "record" ? event.record.action : "identity";
  const uri =
    event.type === "record"
      ? buildAtUri(event.record.did, event.record.collection, event.record.rkey)
      : event.identity.did;

  await db.insert(ingestDeadLetter).values({
    eventId: event.id,
    uri,
    collection,
    action,
    payload: event as unknown as Record<string, unknown>,
    error: message,
  });
}

/**
 * Outcome of processing one event, used to decide whether to ack:
 * - `applied`: written to the read-model (idempotent upsert/delete).
 * - `dead-lettered`: apply failed but the event was durably captured in
 *   `ingest_dead_letter` for later replay.
 * - `unhandled`: apply failed AND the dead-letter write failed too (e.g. the DB
 *   is down or out of storage). The caller MUST NOT ack — leaving it un-acked
 *   lets tap redeliver once the DB recovers, instead of silently dropping it.
 */
export type ProcessResult = "applied" | "dead-lettered" | "unhandled";

/**
 * Process a single tap event. All operations are idempotent upserts/deletes, so
 * at-least-once redelivery is safe — we re-apply rather than risk dropping an
 * event by deduping on id. Apply failures are captured in `ingest_dead_letter`;
 * if even that write fails we report `unhandled` so the caller withholds the ack
 * and tap redelivers later (this is what prevents data loss during an outage).
 */
export async function processTapEvent(event: TapEvent): Promise<ProcessResult> {
  try {
    if (event.type === "identity") {
      await applyIdentity(event.identity);
    } else {
      await handleRecord(event.record);
    }
    await recordProgress(event.id);
    return "applied";
  } catch (error) {
    try {
      await deadLetter(event, error);
      return "dead-lettered";
    } catch {
      // Both the apply and the dead-letter write failed (DB down / full). Don't
      // ack: surface via logs and let tap redeliver once the DB recovers.
      console.error("[ingest] failed to dead-letter event", event.id, error);
      return "unhandled";
    }
  }
}

const DEAD_LETTER_MAX_RETRIES = 5;
const DEAD_LETTER_REPLAY_BATCH = 200;

/**
 * Re-apply dead-lettered events. Rows land in `ingest_dead_letter` when the
 * original apply failed (almost always a transient DB error), and without a
 * replay they are silently missing from the read model forever — tap acked the
 * event, so it never redelivers. Successful replays delete the row; failures
 * bump `retries` until {@link DEAD_LETTER_MAX_RETRIES}, after which the row is
 * left for manual inspection. Runs from the hourly recompute sweep.
 */
export async function replayDeadLetters(): Promise<{
  replayed: number;
  failed: number;
}> {
  const rows = await db
    .select()
    .from(ingestDeadLetter)
    .where(lt(ingestDeadLetter.retries, DEAD_LETTER_MAX_RETRIES))
    .orderBy(asc(ingestDeadLetter.id))
    .limit(DEAD_LETTER_REPLAY_BATCH);

  let replayed = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const event = row.payload as unknown as TapEvent | null;
      if (event?.type === "identity") {
        await applyIdentity(event.identity);
      } else if (event?.type === "record") {
        await handleRecord(event.record);
      } else {
        throw new Error("unrecognized dead-letter payload");
      }
      await db.delete(ingestDeadLetter).where(eq(ingestDeadLetter.id, row.id));
      replayed += 1;
    } catch (error: unknown) {
      failed += 1;
      await db
        .update(ingestDeadLetter)
        .set({
          retries: row.retries + 1,
          error: error instanceof Error ? error.message : String(error),
        })
        .where(eq(ingestDeadLetter.id, row.id));
    }
  }
  return { failed, replayed };
}

/** Process a batch (tap may deliver one event per webhook call, but the WS/SDK
 * path can hand us arrays). Returns counts for logging. */
export async function processTapEvents(
  events: Array<TapEvent>,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const event of events) {
    const result = await processTapEvent(event);
    if (result === "applied") {
      ok += 1;
    } else {
      failed += 1;
    }
  }
  return { ok, failed };
}

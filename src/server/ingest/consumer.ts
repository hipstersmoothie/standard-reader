import { sql } from "drizzle-orm";

import type {
  BskyProfileRecord,
  DocumentRecord,
  PublicationRecord,
  ReadRecord,
  RecommendRecord,
  SubscriptionRecord,
  TapEvent,
  TapRecordPayload,
} from "../atproto/types.ts";

import { db } from "../../db/index.ts";
import { ingestDeadLetter, ingestState } from "../../db/schema.ts";
import { Collections, buildAtUri } from "../atproto/uri.ts";
import {
  applyIdentity,
  deleteRecord,
  upsertBskyProfile,
  upsertDocument,
  upsertPublication,
  upsertRead,
  upsertRecommend,
  upsertSubscription,
} from "./handlers.ts";

const STREAM_ID = "tap";

async function handleRecord(payload: TapRecordPayload): Promise<void> {
  const { did, collection, rkey, action, cid, record } = payload;
  const uri = buildAtUri(did, collection, rkey);

  if (action === "delete") {
    await deleteRecord(uri, collection);
    return;
  }

  if (!record) {
    // create/update with no body — nothing to map.
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
    case Collections.read: {
      await upsertRead(uri, did, rkey, cid, record as unknown as ReadRecord);
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
    default: {
      // A collection we don't model (tap filtering should prevent this).
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
 * Process a single tap event. All operations are idempotent upserts/deletes, so
 * at-least-once redelivery is safe — we re-apply rather than risk dropping an
 * event by deduping on id. Failures are captured in `ingest_dead_letter` and
 * swallowed so the caller can still 200 (avoids wedging tap's per-repo
 * ordering on a single poison event); transient infra failures can be replayed
 * from the dead-letter table.
 *
 * @returns `true` if applied cleanly, `false` if dead-lettered.
 */
export async function processTapEvent(event: TapEvent): Promise<boolean> {
  try {
    if (event.type === "identity") {
      await applyIdentity(event.identity);
    } else {
      await handleRecord(event.record);
    }
    await recordProgress(event.id);
    return true;
  } catch (error) {
    try {
      await deadLetter(event, error);
    } catch {
      // If even the dead-letter write fails, surface via logs only.
      console.error("[ingest] failed to dead-letter event", event.id, error);
    }
    return false;
  }
}

/** Process a batch (tap may deliver one event per webhook call, but the WS/SDK
 * path can hand us arrays). Returns counts for logging. */
export async function processTapEvents(
  events: Array<TapEvent>,
): Promise<{ ok: number; failed: number }> {
  let ok = 0;
  let failed = 0;
  for (const event of events) {
    const applied = await processTapEvent(event);
    if (applied) {
      ok += 1;
    } else {
      failed += 1;
    }
  }
  return { ok, failed };
}

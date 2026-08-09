import { sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import {
  PUSH_INDEXED_WITHIN_HOURS,
  PUSH_PUBLISHED_WITHIN_HOURS,
} from "./config.ts";

/**
 * The ingest side of web push: queue a newly-indexed document for notification.
 *
 * This is the ONLY thing push adds to the tap worker. It's one statement that
 * usually inserts nothing, which matters — the worker sees tens of thousands of
 * document writes an hour and must not fall behind the firehose. Everything
 * expensive (recipient resolution, encryption, the HTTPS calls to push services)
 * happens later, in the push-send cron.
 */

/**
 * Whether the record itself claims a publication date.
 *
 * This has to be checked against the *record*, not `documents.published_at`.
 * `upsertDocument` computes that column as
 * `publishedAt ?? updatedAt ?? new Date()`, so a document with no dates at all
 * lands with `published_at = now()` and sails through any freshness window. A
 * repo importing 200 undated archive posts would then notify on all 200. Real
 * posts carry the date — the lexicon requires it — so requiring one here costs
 * nothing and closes that hole.
 */
export function recordClaimsPublishDate(record: {
  publishedAt?: unknown;
  updatedAt?: unknown;
}): boolean {
  for (const value of [record.publishedAt, record.updatedAt]) {
    if (typeof value === "string" && Number.isFinite(Date.parse(value))) {
      return true;
    }
  }
  return false;
}

/**
 * Claim a document for notification, atomically.
 *
 * The primary key on `document_push_queue` is what makes this exactly-once: tap
 * redelivery, dead-letter replay, and every later `update` event for the same
 * document all collapse into `DO NOTHING`. Returns whether this call is the one
 * that claimed it (useful for logging; nothing downstream depends on it).
 *
 * The guards, in order of what each one actually protects against:
 *
 *   - `deleted` / `has_renderable_body` — don't notify about something there's
 *     nothing to read.
 *   - `indexed_at` — the real "new to us" signal. It's set once on first insert
 *     and survives every later upsert, so a tap cursor rewind or a fresh tap
 *     instance re-streaming repos we already know can't page every reader at
 *     once.
 *   - `published_at` lower bound — an old post surfacing late (a repo being
 *     re-added, a slow backfill) isn't news.
 *   - `published_at` upper bound — a future-dated record shouldn't be able to
 *     stay permanently eligible.
 */
export async function enqueuePostNotification(
  documentUri: string,
): Promise<boolean> {
  const rows = await db.execute<{ document_uri: string }>(sql`
    insert into document_push_queue (document_uri, author_did)
    select d.uri, d.did
      from documents d
     where d.uri = ${documentUri}
       and d.deleted = false
       and d.has_renderable_body = true
       and d.indexed_at > now() - make_interval(hours => ${PUSH_INDEXED_WITHIN_HOURS})
       and d.published_at > now() - make_interval(hours => ${PUSH_PUBLISHED_WITHIN_HOURS})
       and d.published_at < now() + make_interval(hours => 1)
    on conflict (document_uri) do nothing
    returning document_uri
  `);

  // The neon-http and node-postgres drivers disagree about whether `execute`
  // returns the rows directly or wraps them in `{ rows }`.
  const returned = Array.isArray(rows)
    ? rows
    : ((rows as { rows?: Array<unknown> }).rows ?? []);
  return returned.length > 0;
}

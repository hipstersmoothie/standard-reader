/**
 * Server-only: the send pipeline's write + read side over the shared
 * newsletter_sends / newsletter_send_events tables.
 *
 * - Writers (`recordSend`, `recordEvents`) are called by the Resend send runner
 *   and by the Resend webhook handler (opens/clicks/bounces/unsubscribes).
 * - `loadSendMetrics` aggregates real per-document delivery metrics for the
 *   analytics screens.
 *
 * All functions no-op / return empty when no DB is configured, so the app keeps
 * working on sample data.
 */

import { and, eq, inArray, sql } from "drizzle-orm";

import {
  type NewNewsletterSend,
  type NewNewsletterSendEvent,
  type NewsletterEventType,
  newsletterSendEvents,
  newsletterSends,
} from "@standard-reader/db/schema";

import { getDb } from "../db/index.server";

export interface DocSendMetrics {
  sentAt: Date;
  recipients: number;
  delivered: number;
  /** Unique openers. */
  opens: number;
  /** Unique clickers. */
  clicks: number;
  unsubs: number;
  bounces: number;
  /** Cumulative unique opens at 0,4,…,48h (13 points). */
  opensByHour: number[];
  topLinks: { url: string; count: number }[];
}

export async function recordSend(send: NewNewsletterSend): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  await db
    .insert(newsletterSends)
    .values(send)
    .onConflictDoUpdate({
      target: newsletterSends.id,
      set: { subject: send.subject, recipientCount: send.recipientCount },
    });
  return true;
}

/**
 * Reserve a send before mailing — insert the send row, skipping if one already
 * exists. Returns true only if THIS caller created it, so a concurrent
 * dispatcher can't double-send the same document (at-most-once). A send that
 * fails after reserving won't auto-retry; re-trigger it manually.
 */
export async function reserveSend(send: NewNewsletterSend): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .insert(newsletterSends)
    .values(send)
    .onConflictDoNothing({ target: newsletterSends.id })
    .returning({ id: newsletterSends.id });
  return Boolean(row);
}

export async function recordEvents(
  events: NewNewsletterSendEvent[],
): Promise<boolean> {
  const db = getDb();
  if (!db || events.length === 0) return false;
  await db.insert(newsletterSendEvents).values(events).onConflictDoNothing();
  return true;
}

/**
 * Record a provider webhook event (Resend opens/clicks/bounces/complaints).
 * Correlates back to the send via the delivered event's provider message id
 * (which the runner stored as that event's id). The event id is keyed on
 * message + type + recipient (+ url) so repeated deliveries dedupe, keeping
 * unique-open/click counts honest.
 */
export async function recordWebhookEvent(evt: {
  messageId: string;
  recipient: string;
  type: NewsletterEventType;
  url?: string;
}): Promise<boolean> {
  const db = getDb();
  if (!db) return false;
  const [row] = await db
    .select({ sendId: newsletterSendEvents.sendId })
    .from(newsletterSendEvents)
    .where(eq(newsletterSendEvents.id, evt.messageId))
    .limit(1);
  if (!row) return false;
  await db
    .insert(newsletterSendEvents)
    .values({
      id: `${evt.messageId}:${evt.type}:${evt.recipient}:${evt.url ?? ""}`,
      sendId: row.sendId,
      recipient: evt.recipient,
      type: evt.type,
      url: evt.url,
    })
    .onConflictDoNothing();
  return true;
}

/** Build the 13-point cumulative-open curve (0…48h, 4h steps) from buckets. */
function cumulativeCurve(
  buckets: Map<number, number>,
  totalOpens: number,
): number[] {
  const curve: number[] = [];
  let running = 0;
  for (let i = 0; i < 13; i++) {
    running += buckets.get(i) ?? 0;
    curve.push(Math.min(running, totalOpens));
  }
  return curve;
}

export async function loadSendMetrics(
  documentUris: string[],
): Promise<Map<string, DocSendMetrics>> {
  const out = new Map<string, DocSendMetrics>();
  const db = getDb();
  if (!db || documentUris.length === 0) return out;

  const sends = await db
    .select({
      id: newsletterSends.id,
      documentUri: newsletterSends.documentUri,
      recipientCount: newsletterSends.recipientCount,
      sentAt: newsletterSends.sentAt,
    })
    .from(newsletterSends)
    .where(inArray(newsletterSends.documentUri, documentUris));
  if (sends.length === 0) return out;

  const sendIds = sends.map((s) => s.id);

  const counts = await db
    .select({
      sendId: newsletterSendEvents.sendId,
      type: newsletterSendEvents.type,
      total: sql<number>`count(*)::int`,
      uniq: sql<number>`count(distinct ${newsletterSendEvents.recipient})::int`,
    })
    .from(newsletterSendEvents)
    .where(inArray(newsletterSendEvents.sendId, sendIds))
    .groupBy(newsletterSendEvents.sendId, newsletterSendEvents.type);

  const linkRows = await db
    .select({
      sendId: newsletterSendEvents.sendId,
      url: newsletterSendEvents.url,
      total: sql<number>`count(*)::int`,
    })
    .from(newsletterSendEvents)
    .where(
      and(
        inArray(newsletterSendEvents.sendId, sendIds),
        eq(newsletterSendEvents.type, "clicked"),
      ),
    )
    .groupBy(newsletterSendEvents.sendId, newsletterSendEvents.url);

  const bucketExpr = sql<number>`floor(extract(epoch from (${newsletterSendEvents.occurredAt} - ${newsletterSends.sentAt})) / 14400)::int`;
  const openBuckets = await db
    .select({
      sendId: newsletterSendEvents.sendId,
      bucket: bucketExpr,
      uniq: sql<number>`count(distinct ${newsletterSendEvents.recipient})::int`,
    })
    .from(newsletterSendEvents)
    .innerJoin(newsletterSends, eq(newsletterSendEvents.sendId, newsletterSends.id))
    .where(
      and(
        inArray(newsletterSendEvents.sendId, sendIds),
        eq(newsletterSendEvents.type, "opened"),
      ),
    )
    .groupBy(newsletterSendEvents.sendId, bucketExpr);

  for (const send of sends) {
    const typeCount = (t: string, uniq = false) => {
      const row = counts.find((c) => c.sendId === send.id && c.type === t);
      return row ? (uniq ? row.uniq : row.total) : 0;
    };
    const opens = typeCount("opened", true);
    const bucketMap = new Map<number, number>();
    for (const b of openBuckets) {
      if (b.sendId === send.id && b.bucket >= 0) {
        bucketMap.set(b.bucket, b.uniq);
      }
    }
    const topLinks = linkRows
      .filter((l) => l.sendId === send.id && l.url)
      .map((l) => ({ url: l.url as string, count: l.total }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    out.set(send.documentUri, {
      sentAt: send.sentAt,
      recipients: send.recipientCount,
      delivered: typeCount("delivered"),
      opens,
      clicks: typeCount("clicked", true),
      unsubs: typeCount("unsubscribed"),
      bounces: typeCount("bounced"),
      opensByHour: cumulativeCurve(bucketMap, opens),
      topLinks,
    });
  }

  return out;
}

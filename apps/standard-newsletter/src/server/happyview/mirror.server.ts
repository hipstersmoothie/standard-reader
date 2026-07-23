/**
 * Upsert desired subscribers into the `newsletter_subscribers` mirror (the send
 * pipeline's read model). Keyed by the (publication_uri, email) unique index so
 * the space is the source of truth and re-syncs are idempotent. DB-touching;
 * exercised against a real database.
 */

import { newsletterSubscribers } from "@standard-reader/db/schema";
import { sql } from "drizzle-orm";

import { getDb } from "../../db/index.server";
import type { DesiredSubscriber } from "./sync";

/**
 * Upsert the mirror rows for a publication. New rows get a fresh unsubscribe
 * token; existing rows keep theirs. `confirmedAt` / `unsubscribedAt` follow the
 * desired status; `source`, `subscriberDid`, and `spaceRecordUri` track the
 * space record backing each row.
 */
export async function upsertMirrorRows(
  publicationUri: string,
  desired: Array<DesiredSubscriber>,
): Promise<void> {
  const db = getDb();
  if (!db || desired.length === 0) return;

  const now = new Date();
  const rows = desired.map((sub) => ({
    id: crypto.randomUUID(),
    publicationUri,
    email: sub.email,
    subscriberDid: sub.subscriberDid,
    status: sub.status,
    source: sub.source,
    spaceRecordUri: sub.spaceRecordUri,
    token: crypto.randomUUID(),
    confirmedAt: sub.status === "confirmed" ? now : null,
    unsubscribedAt: sub.status === "unsubscribed" ? now : null,
  }));

  await db
    .insert(newsletterSubscribers)
    .values(rows)
    .onConflictDoUpdate({
      target: [
        newsletterSubscribers.publicationUri,
        newsletterSubscribers.email,
      ],
      set: {
        status: sql`excluded.status`,
        source: sql`excluded.source`,
        subscriberDid: sql`excluded.subscriber_did`,
        spaceRecordUri: sql`excluded.space_record_uri`,
        confirmedAt: sql`excluded.confirmed_at`,
        unsubscribedAt: sql`excluded.unsubscribed_at`,
      },
    });
}

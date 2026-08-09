/**
 * Push send runner. Claims a batch of queued documents, resolves who opted in,
 * and delivers the notifications — then marks each document `sent` or `failed`.
 *
 * Invoked by the short-lived `push-cron` entrypoint (`scripts/send-push.ts`).
 * Like the weekly digest, it deliberately runs in its own scheduled process
 * rather than inside the long-lived `ingest` worker: the worker's job is keeping
 * up with the firehose, and a fan-out to hundreds of push endpoints has no
 * business competing with that for connections or event-loop time. The ingest
 * side of this feature is one INSERT (`./enqueue.ts`) and nothing else.
 */

import { eq, sql } from "drizzle-orm";
import webpush from "web-push";

import { getCanonicalPublicUrl } from "#/lib/public-url";

import { db } from "../../db/index.ts";
import { documentPushQueue, pushDevices } from "../../db/schema.ts";
import {
  PUSH_AUTHOR_HOURLY_CAP,
  PUSH_CLAIM_TIMEOUT_MINUTES,
  PUSH_MAX_ATTEMPTS,
  pushConfig,
} from "./config.ts";
import { buildNotification } from "./fan-out.ts";
import type { PushPayload, PushTarget } from "./fan-out.ts";

export interface PushRunSummary {
  /** Documents claimed by this run. */
  claimed: number;
  /** Documents that produced at least one successful send. */
  delivered: number;
  /** Documents with nobody opted in (or already gone). */
  skippedEmpty: number;
  /** Documents held back by the per-author hourly cap. */
  suppressed: number;
  /** Documents that errored and were released for another attempt. */
  retried: number;
  /** Documents that exhausted their attempts. */
  failed: number;
  /** Individual notifications accepted by a push service. */
  sent: number;
  /** Dead endpoints pruned (404/410 from the push service). */
  pruned: number;
}

// A type alias, not an interface: `db.execute<T>` constrains `T` to
// `Record<string, unknown>`, and only type aliases get an implicit index
// signature.
type ClaimedRow = {
  document_uri: string;
  author_did: string;
  attempts: number;
};

/** Normalize `db.execute` across the neon-http and node-postgres drivers. */
async function unwrap<T>(query: Promise<unknown>): Promise<Array<T>> {
  const result = await query;
  if (Array.isArray(result)) return result as Array<T>;
  return ((result as { rows?: Array<T> }).rows ?? []) as Array<T>;
}

/**
 * Take ownership of up to `limit` queued documents.
 *
 * `for update skip locked` is what makes this safe to run concurrently — an
 * overrunning cron tick and the next one can never claim the same row, so a slow
 * run can't cause a double send.
 *
 * The second arm of the `where` is the reaper: a row left `sending` by a process
 * that died mid-flight would otherwise sit there forever. The timeout is
 * comfortably longer than the cron interval so a slow-but-alive run is never
 * stolen from.
 */
async function claimBatch(limit: number): Promise<Array<ClaimedRow>> {
  return unwrap<ClaimedRow>(
    db.execute<ClaimedRow>(sql`
      update document_push_queue q
         set state = 'sending',
             attempts = q.attempts + 1,
             claimed_at = now(),
             updated_at = now()
       where q.document_uri in (
         select document_uri
           from document_push_queue
          where (state = 'pending' and available_at <= now())
             or (state = 'sending'
                 and claimed_at < now() - make_interval(mins => ${PUSH_CLAIM_TIMEOUT_MINUTES}))
          order by created_at
          limit ${limit}
          for update skip locked
       )
      returning q.document_uri, q.author_did, q.attempts
    `),
  );
}

/**
 * How many notifications this author has already generated in the last hour.
 *
 * The enqueue's freshness guards can't tell a genuine burst of posting from a
 * repo dumping its archive with fresh timestamps, so this is the backstop.
 * Documents over the cap are marked `failed` rather than retried — by the time a
 * run is under the cap again they're no longer new, and a delayed notification
 * about an old post is worse than none.
 */
async function recentSendsForAuthor(authorDid: string): Promise<number> {
  const rows = await unwrap<{ n: number | string }>(
    db.execute<{ n: number | string }>(sql`
      select count(*)::int as n
        from document_push_queue
       where author_did = ${authorDid}
         and state = 'sent'
         and updated_at > now() - make_interval(hours => 1)
    `),
  );
  return Number(rows[0]?.n ?? 0);
}

async function settle(
  documentUri: string,
  state: "sent" | "failed" | "pending",
  lastError: string | null,
): Promise<void> {
  await db
    .update(documentPushQueue)
    .set({
      state,
      lastError,
      claimedAt: null,
      updatedAt: sql`now()`,
    })
    .where(eq(documentPushQueue.documentUri, documentUri));
}

/** Run `worker` over `items` with at most `limit` in flight. */
async function pooled<T>(
  items: Array<T>,
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let cursor = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (cursor < items.length) {
        const index = cursor;
        cursor += 1;
        await worker(items[index]);
      }
    },
  );
  await Promise.all(runners);
}

interface SendOutcome {
  sent: number;
  pruned: number;
}

async function deliver(
  targets: Array<PushTarget>,
  payload: PushPayload,
): Promise<SendOutcome> {
  const body = JSON.stringify(payload);
  let sent = 0;
  let pruned = 0;
  const dead: Array<string> = [];

  await pooled(targets, pushConfig.sendConcurrency, async (target) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        },
        body,
        { TTL: 60 * 60 * 12 },
      );
      sent += 1;
    } catch (error: unknown) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // The subscription is gone for good — the browser was uninstalled, or
        // the reader revoked permission. Drop the row; nothing to retry.
        dead.push(target.endpoint);
        pruned += 1;
        return;
      }
      console.warn(
        `[push] send failed (${status ?? "no status"}) for ${target.endpoint.slice(0, 60)}…`,
      );
    }
  });

  if (dead.length > 0) {
    await pooled(dead, 4, async (endpoint) => {
      await db.delete(pushDevices).where(eq(pushDevices.endpoint, endpoint));
    });
  }

  return { sent, pruned };
}

export async function runPushSend(): Promise<PushRunSummary> {
  const summary: PushRunSummary = {
    claimed: 0,
    delivered: 0,
    skippedEmpty: 0,
    suppressed: 0,
    retried: 0,
    failed: 0,
    sent: 0,
    pruned: 0,
  };

  if (!pushConfig.configured) {
    // No VAPID keys. Exit quietly rather than throwing — this is the state a
    // Railway PR preview is in, and it must not send real notifications
    // carrying preview-domain links.
    console.log("[push] VAPID keys not configured; nothing to do");
    return summary;
  }

  webpush.setVapidDetails(
    pushConfig.subject,
    pushConfig.publicKey,
    pushConfig.privateKey,
  );

  const baseUrl = getCanonicalPublicUrl();
  const batch = await claimBatch(pushConfig.maxDocumentsPerRun);
  summary.claimed = batch.length;

  for (const row of batch) {
    if (summary.sent >= pushConfig.maxSendsPerRun) {
      // Run budget spent. Release the rest for the next tick rather than
      // letting one very widely-followed publication monopolise the run.
      await settle(row.document_uri, "pending", null);
      continue;
    }

    try {
      if (
        (await recentSendsForAuthor(row.author_did)) >= PUSH_AUTHOR_HOURLY_CAP
      ) {
        summary.suppressed += 1;
        await settle(row.document_uri, "failed", "author hourly cap");
        continue;
      }

      const notification = await buildNotification(row.document_uri, baseUrl);
      if (!notification) {
        summary.skippedEmpty += 1;
        await settle(row.document_uri, "sent", null);
        continue;
      }

      const outcome = await deliver(notification.targets, notification.payload);
      summary.sent += outcome.sent;
      summary.pruned += outcome.pruned;
      summary.delivered += 1;
      await settle(row.document_uri, "sent", null);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      if (row.attempts >= PUSH_MAX_ATTEMPTS) {
        summary.failed += 1;
        await settle(row.document_uri, "failed", message);
      } else {
        summary.retried += 1;
        await settle(row.document_uri, "pending", message);
      }
      console.warn(`[push] ${row.document_uri} failed: ${message}`);
    }
  }

  return summary;
}

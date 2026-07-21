/**
 * Weekly-digest send runner. Selects opted-in readers with a captured email who
 * haven't been sent to recently, builds + renders each digest, and sends it via
 * comail — sequentially, throttled, and capped so a single run stays under
 * comail's hourly ceiling. Readers not reached this run keep their stale
 * `weeklyDigestLastSentAt` and are picked up next run.
 *
 * Invoked directly by the short-lived `digest-cron` job entrypoint
 * (`scripts/send-weekly-digest.ts`) — it deliberately runs in its own scheduled
 * process, not inside the long-lived `ingest` worker or the `web` app, so the
 * heavy weekly send never competes with the firehose consumer or user requests.
 */

import { and, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";

import { getPublicUrl } from "#/lib/public-url";

import { db } from "../../db/index.ts";
import * as schema from "../../db/schema.ts";
import { buildDigestForUser, digestSectionsFromUser } from "./builder.ts";
import { sendEmail } from "./comail.ts";
import { DIGEST_MIN_INTERVAL_DAYS, digestConfig } from "./config.ts";
import { renderDigestEmail } from "./render.tsx";
import { makeUnsubscribeToken } from "./unsubscribe-token.ts";

export interface DigestRunSummary {
  /** Readers matched by the eligibility query (bounded by `maxPerRun`). */
  candidates: number;
  /** Digests successfully accepted by comail. */
  sent: number;
  /** Readers skipped because they had no fresh best-of content this week. */
  skippedEmpty: number;
  /** Sends that failed for a non-rate-limit reason (per-recipient). */
  failed: number;
  /** True if we stopped early because comail returned 429. */
  rateLimited: boolean;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function runWeeklyDigest(): Promise<DigestRunSummary> {
  const baseUrl = getPublicUrl();
  const maxPerRun = digestConfig.maxPerRun;

  const candidates = await db.query.user.findMany({
    where: and(
      isNotNull(schema.user.email),
      isNotNull(schema.user.did),
      eq(schema.user.weeklyDigestEnabled, true),
      or(
        isNull(schema.user.weeklyDigestLastSentAt),
        lt(
          schema.user.weeklyDigestLastSentAt,
          sql`now() - (${DIGEST_MIN_INTERVAL_DAYS}::text || ' days')::interval`,
        ),
      ),
    ),
    columns: {
      id: true,
      did: true,
      email: true,
      weeklyDigestSectionSubscriptions: true,
      weeklyDigestSectionNetwork: true,
      weeklyDigestSectionSaved: true,
      weeklyDigestSectionRecommendations: true,
    },
    limit: maxPerRun,
  });

  const summary: DigestRunSummary = {
    candidates: candidates.length,
    sent: 0,
    skippedEmpty: 0,
    failed: 0,
    rateLimited: false,
  };

  for (let i = 0; i < candidates.length; i++) {
    const reader = candidates[i];
    if (!reader.did || !reader.email) continue;

    const sections = digestSectionsFromUser(reader);
    const digest = await buildDigestForUser(db, schema, {
      did: reader.did,
      sections,
    });
    // Skip when there's no real reading content to send. Recommendations alone
    // (which cold-start to popular publications) aren't enough to justify a
    // send, so the guard looks only at the article-bearing sections.
    if (
      digest.articles.length === 0 &&
      digest.networkArticles.length === 0 &&
      digest.saved.length === 0
    ) {
      summary.skippedEmpty++;
      continue;
    }

    const rendered = await renderDigestEmail(digest, {
      baseUrl,
      userId: reader.id,
    });

    // Same signed token the email body uses, surfaced in the List-Unsubscribe
    // header so Gmail/Apple Mail's native unsubscribe button works too.
    const unsubscribeUrl = `${baseUrl.replace(/\/$/, "")}/api/digest/unsubscribe?token=${encodeURIComponent(
      makeUnsubscribeToken(reader.id),
    )}`;

    const result = await sendEmail({
      to: reader.email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      unsubscribeUrl,
    });

    if (result.rateLimited) {
      // Hourly ceiling hit — stop; unsent readers keep their stale timestamp
      // and are retried next run.
      summary.rateLimited = true;
      break;
    }

    if (result.ok) {
      await db
        .update(schema.user)
        .set({ weeklyDigestLastSentAt: new Date() })
        .where(eq(schema.user.id, reader.id));
      summary.sent++;
    } else {
      summary.failed++;
      console.warn(
        `[digest] send failed for ${reader.id}: ${result.error ?? result.status}`,
      );
    }

    if (i < candidates.length - 1 && digestConfig.sendDelayMs > 0) {
      await sleep(digestConfig.sendDelayMs);
    }
  }

  return summary;
}

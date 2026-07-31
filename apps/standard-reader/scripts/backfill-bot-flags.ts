/**
 * Backfill `profiles.is_bot` from each account's `bot` self-label.
 *
 * The flag is normally set by the profile ingest handler as records come past on
 * the firehose, which only covers profiles seen *since* the column existed. This
 * fills in every account already indexed, reading the self-label from the public
 * AppView (which reports it in a profile view's `labels`, attributed to the
 * account's own DID).
 *
 *   pnpm backfill:bot-flags
 */

import { eq, inArray } from "drizzle-orm";

import { db } from "#/db/index";
import * as schema from "#/db/schema";
import { fetchBlueskyPublicProfiles } from "#/lib/bluesky-public-profile";
import { chunk } from "#/lib/concurrency";

const BATCH = 25;

const rows = await db
  .select({ did: schema.profiles.did, isBot: schema.profiles.isBot })
  .from(schema.profiles);
console.log(`[backfill:bot-flags] ${rows.length} indexed profile(s)`);

let checked = 0;
let flipped = 0;
for (const batch of chunk(rows, BATCH)) {
  const views = await fetchBlueskyPublicProfiles(batch.map((r) => r.did));
  checked += batch.length;

  const nowBots = batch
    .filter((r) => views.get(r.did)?.isBot === true && !r.isBot)
    .map((r) => r.did);
  const nowNotBots = batch
    .filter((r) => views.get(r.did)?.isBot === false && r.isBot)
    .map((r) => r.did);

  if (nowBots.length > 0) {
    await db
      .update(schema.profiles)
      .set({ isBot: true })
      .where(inArray(schema.profiles.did, nowBots));
    flipped += nowBots.length;
  }
  // An account can retract the self-label, so this reconciles both directions.
  if (nowNotBots.length > 0) {
    await db
      .update(schema.profiles)
      .set({ isBot: false })
      .where(inArray(schema.profiles.did, nowNotBots));
    flipped += nowNotBots.length;
  }
  if (checked % 500 === 0) {
    console.log(`  ${checked}/${rows.length} checked, ${flipped} updated`);
  }
}

const [count] = await db
  .select({ n: schema.profiles.did })
  .from(schema.profiles)
  .where(eq(schema.profiles.isBot, true))
  .limit(1);
console.log(
  `[backfill:bot-flags] done: ${checked} checked, ${flipped} updated${count ? "" : ""}`,
);

/**
 * Weekly digest send job — the entrypoint the Railway `digest-cron` service
 * runs on a schedule.
 *
 * This is a self-contained, short-lived process: it opens its own DB connection
 * (Neon HTTP — no persistent pool), builds + renders + sends every eligible
 * reader's digest via comail, then exits. It deliberately does NOT run inside
 * the long-lived `ingest` worker or the user-facing `web` app, so a heavy
 * weekly send never competes with the firehose consumer or user requests.
 *
 * Needs (Railway env on the `digest-cron` service): DATABASE_URL, PUBLIC_URL,
 * COMAIL_DID, COMAIL_API_KEY, COMAIL_FROM, DIGEST_UNSUBSCRIBE_SECRET.
 *
 * Local: `pnpm digest:send:dev` (loads .env).
 */

import { runWeeklyDigest } from "#/server/digest/run";

const startedAt = Date.now();
try {
  const summary = await runWeeklyDigest();
  console.info(
    `[digest] done in ${Date.now() - startedAt}ms: ${JSON.stringify(summary)}`,
  );
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
} catch (error) {
  console.error("[digest] send job failed:", error);
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

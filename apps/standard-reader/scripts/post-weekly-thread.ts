/**
 * Weekly "hottest articles" Bluesky thread job — the entrypoint the Railway
 * `thread-cron` service runs on a schedule (Fridays 16:00 UTC).
 *
 * Self-contained, short-lived process: it opens its own DB connection, selects
 * the week's hottest network articles, posts a threaded set of link cards as the
 * reader bot, then exits. It runs in its own scheduled process (not the `web`
 * app or the long-lived `ingest` worker), mirroring `digest-cron`.
 *
 * Needs (Railway env on the `thread-cron` service): DATABASE_URL, PUBLIC_URL,
 * READER_BOT_IDENTIFIER, READER_BOT_APP_PASSWORD (optional READER_BOT_PDS_URL).
 *
 * Local: `pnpm thread:post:dev` (loads .env). Add `THREAD_DRY_RUN=1` to compose
 * + log the thread without writing any records.
 */

import { runWeeklyThread } from "#/server/announce/run";

const startedAt = Date.now();
try {
  const summary = await runWeeklyThread();
  console.info(
    `[thread] done in ${Date.now() - startedAt}ms: ${JSON.stringify(summary)}`,
  );
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
} catch (error) {
  console.error("[thread] post job failed:", error);
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

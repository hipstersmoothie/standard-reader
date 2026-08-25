/**
 * Web push send job — the entrypoint the Railway `push-cron` service runs every
 * five minutes.
 *
 * Short-lived and self-contained: it opens its own DB connection, drains a batch
 * of `document_push_queue`, sends, and exits. It deliberately does NOT run inside
 * the long-lived `ingest` worker (whose only job is keeping up with the firehose,
 * and which must not be holding connections open for hundreds of outbound HTTPS
 * calls) or the user-facing `web` app.
 *
 * The queue is filled from the tap handler the instant a new document is
 * indexed, so the cron interval is the delivery latency — five minutes at the
 * moment, tunable in `railway.push.json`.
 *
 * Needs (Railway env on the `push-cron` service): DATABASE_URL, PUBLIC_URL,
 * VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT. With the VAPID keys unset
 * the run exits cleanly having done nothing, which is what keeps a PR preview
 * pointed at a shared database from sending real notifications.
 *
 * Local: `pnpm push:send:dev` (loads .env).
 */

import { runPushSend } from "#/server/push/run";

const startedAt = Date.now();
try {
  const summary = await runPushSend();
  console.info(
    `[push] done in ${Date.now() - startedAt}ms: ${JSON.stringify(summary)}`,
  );
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(0);
} catch (error) {
  console.error("[push] send job failed:", error);
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

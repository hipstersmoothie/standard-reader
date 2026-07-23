/**
 * Post → send trigger (cron entry). Mails any published document that hasn't
 * been sent yet to its publication's confirmed subscribers.
 *
 *   pnpm --filter standard-newsletter newsletter:dispatch
 *
 * Idempotent — safe to run on a schedule. Needs DATABASE_URL and RESEND_API_KEY.
 */

import { dispatchPendingSends } from "../src/server/email/dispatch.server";

if (!process.env.DATABASE_URL) {
  console.log("DATABASE_URL not set — nothing to dispatch.");
  process.exit(0);
}

const results = await dispatchPendingSends({ limit: 20 });
if (results.length === 0) {
  console.log("No pending sends.");
  process.exit(0);
}

for (const r of results) {
  const detail = r.outcome === "sent" ? ` (${r.delivered}/${r.total})` : "";
  console.log(`${r.outcome.padEnd(17)} ${r.title}${detail}`);
}

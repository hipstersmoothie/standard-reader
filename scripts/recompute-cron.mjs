/**
 * Recompute cron trigger.
 *
 * Run on a schedule by the Railway `recompute-cron` service. Makes an
 * authenticated POST to the ingest worker's `/api/ingest/recompute` endpoint so
 * the derived aggregate tables (`publication_stats`, cosubscription /
 * corecommend graphs, trending) are refreshed in the long-lived ingest process.
 *
 * Env:
 *   RECOMPUTE_URL          full URL to POST (defaults to the internal ingest svc)
 *   INGEST_WEBHOOK_SECRET  shared secret (Basic auth, user `admin`); falls back
 *                          to TAP_ADMIN_PASSWORD to mirror the worker's auth.
 */

const url =
  process.env.RECOMPUTE_URL ??
  "http://ingest.railway.internal:3099/api/ingest/recompute";
const secret =
  process.env.INGEST_WEBHOOK_SECRET ?? process.env.TAP_ADMIN_PASSWORD;

if (!secret) {
  throw new Error("[recompute-cron] INGEST_WEBHOOK_SECRET is not set");
}

const auth = `Basic ${Buffer.from(`admin:${secret}`).toString("base64")}`;

const startedAt = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: { authorization: auth },
});
const body = await res.text();
console.info(
  `[recompute-cron] POST ${url} -> ${res.status} in ${Date.now() - startedAt}ms: ${body}`,
);
if (!res.ok) {
  throw new Error(
    `[recompute-cron] recompute request failed with status ${res.status}`,
  );
}

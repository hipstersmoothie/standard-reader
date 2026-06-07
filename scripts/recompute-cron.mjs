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
  console.error("[recompute-cron] INGEST_WEBHOOK_SECRET is not set");
  process.exit(1);
}

const auth = `Basic ${Buffer.from(`admin:${secret}`).toString("base64")}`;

try {
  const startedAt = Date.now();
  const res = await fetch(url, {
    method: "POST",
    headers: { authorization: auth },
  });
  const body = await res.text();
  console.info(
    `[recompute-cron] POST ${url} -> ${res.status} in ${Date.now() - startedAt}ms: ${body}`,
  );
  process.exit(res.ok ? 0 : 1);
} catch (error) {
  console.error("[recompute-cron] request failed", error);
  process.exit(1);
}

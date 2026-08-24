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
 *   INGEST_WEBHOOK_SECRET  shared secret (Basic auth, user `admin`)
 */

const url =
  process.env.RECOMPUTE_URL ??
  "http://ingest.railway.internal:3099/api/ingest/recompute";
const secret = process.env.INGEST_WEBHOOK_SECRET;

if (!secret) {
  throw new Error("[recompute-cron] INGEST_WEBHOOK_SECRET is not set");
}

const auth = `Basic ${Buffer.from(`admin:${secret}`).toString("base64")}`;

// The endpoint answers 202 and runs the recompute in the background, so this
// only has to prove the trigger landed. It used to await the whole job, which
// takes ~318s in production — five seconds past undici's default 300s
// `headersTimeout` — so the cron crashed with UND_ERR_HEADERS_TIMEOUT every
// hour on a recompute that had actually succeeded. The job's own outcome is in
// the ingest worker's `ingest.recompute` log event.
const startedAt = Date.now();
const res = await fetch(url, {
  method: "POST",
  headers: { authorization: auth },
  signal: AbortSignal.timeout(30_000),
});
const body = await res.text();
console.info(
  `[recompute-cron] POST ${url} -> ${res.status} in ${Date.now() - startedAt}ms: ${body}`,
);
// 409 means a previous run is still going — expected when a recompute overruns
// the hour, and not a failure of this trigger.
if (!res.ok && res.status !== 409) {
  throw new Error(
    `[recompute-cron] recompute request failed with status ${res.status}`,
  );
}

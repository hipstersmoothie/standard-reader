/**
 * Recompute cron trigger.
 *
 * Run on a schedule by the Railway `recompute-cron` service. Makes an
 * authenticated POST to the ingest worker's `/api/ingest/recompute` endpoint so
 * the derived aggregate tables (`publication_stats`, cosubscription /
 * corecommend graphs, trending) are refreshed in the long-lived ingest process.
 *
 * Also doubles as the ingest watchdog. It runs hourly in its own service, so it
 * is the one scheduled thing that keeps running when the ingest worker does
 * not — which is the case that went unnoticed for 29 hours in September 2026.
 * It checks `/health` (which reports whether the Jetstream cursor is still
 * moving, not merely whether a socket is open) and fails loudly when the stream
 * has stopped or the worker is unreachable.
 *
 * Env:
 *   RECOMPUTE_URL          full URL to POST (defaults to the internal ingest svc)
 *   INGEST_HEALTH_URL      full URL to GET  (defaults to the internal ingest svc)
 *   INGEST_WEBHOOK_SECRET  shared secret (Basic auth, user `admin`)
 */

const url =
  process.env.RECOMPUTE_URL ??
  "http://ingest.railway.internal:3099/api/ingest/recompute";
const healthUrl =
  process.env.INGEST_HEALTH_URL ?? "http://ingest.railway.internal:3099/health";
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

/**
 * Watchdog. Deliberately last: a stopped stream must not stop the recompute
 * from being triggered, but it must still fail this run so the cron shows red.
 *
 * An unreachable worker counts as down. That is the shape the 09-17 outage
 * actually took — the process was gone, so nothing answered at all — and a
 * watchdog that only reports on answers it receives would have said nothing for
 * the entire outage.
 */
let health;
try {
  const healthRes = await fetch(healthUrl, {
    signal: AbortSignal.timeout(15_000),
  });
  health = { body: await healthRes.text(), status: healthRes.status };
} catch (error) {
  health = { body: String(error), status: 0 };
}
console.info(
  `[recompute-cron] GET ${healthUrl} -> ${health.status}: ${health.body}`,
);
if (health.status === 200) {
  console.info("[recompute-cron] ingest stream healthy");
} else {
  throw new Error(
    `[recompute-cron] INGEST STREAM UNHEALTHY (${health.status}): ${health.body} — ` +
      "the Jetstream cursor has stopped advancing or the worker is unreachable. " +
      "Check `railway logs --service ingest` and ingest_state.last_event_at.",
  );
}

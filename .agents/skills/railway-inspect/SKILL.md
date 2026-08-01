---
name: railway-inspect
description: >-
  Inspect the Standard Reader Railway deployment using the Railway CLI — view
  project status, list deployments, stream logs, and triage failures across the
  web, tap, ingest, and recompute-cron services. Use when the user asks to
  "check Railway", "inspect the deployment", "what deployed", "check logs",
  "is the deploy healthy", "why did the deploy fail", "debug Railway",
  "railway status", "railway logs", or mentions Railway, a deploy, a service
  healthcheck, or a deployment failure/crash.
---

# Railway deployment inspection (Standard Reader)

Inspect the live Railway deployment using the Railway CLI. The CLI is the
source of truth for deployment state — never guess from `railway.json` files
alone (they describe intent; the CLI shows reality).

## Standard Reader Railway topology

The `standard-reader` Railway project runs four long-lived services plus two
hourly crons, sharing a single Neon Postgres read-model. GitHub auto-deploys on
push to `main`. Every service uses the `RAILPACK` builder.

Note the split between the two crons: `recompute-cron` is only a *trigger* — it
POSTs the ingest worker and the work runs there. `reconcile-cron` does its work
in its own process, on purpose, so repo repair never competes with the live tap
stream it exists to backstop.

| Service          | Start command                                      | Config file            | Healthcheck / notes                                                   |
| ---------------- | -------------------------------------------------- | ---------------------- | --------------------------------------------------------------------- |
| `web`            | `pnpm start` (= `node .output/server/index.mjs`)  | `railway.json`         | `/api/auth/atproto/metadata.json`; pre-deploy runs `pnpm db:migrate`; custom domain `standard-reader.app` |
| `tap`            | `ghcr.io/.../tap` Docker image on a `/data` volume | (Docker, no railpack)  | Long-running firehose consumer; admin API on `:2480` (private)         |
| `ingest`         | `pnpm ingest:start` (= `tsx src/server/ingest/service.ts`) | `railway.ingest.json`  | Binds `[::]:3099`; consumes `tap.railway.internal:2480`               |
| `recompute-cron` | `node scripts/recompute-cron.mjs`                 | `railway.cron.json`    | `0 * * * *`; POSTs the ingest worker's `/api/ingest/recompute`; `restartPolicyType: NEVER` |
| `reconcile-cron` | `pnpm reconcile:repos`                            | `railway.reconcile.json` | `20 * * * *`; PDS repair round-robin, runs in its own process (does **not** call ingest); `restartPolicyType: NEVER` |

**Runbook gotcha:** Railway auto-detects only the root `railway.json`. Every
non-web service needs its **Config File Path** set explicitly (Dashboard →
service → Settings → Config-as-code, or `serviceInstanceUpdate{
railwayConfigFile }` via the GraphQL API) to `railway.ingest.json` /
`railway.cron.json` / `services/<svc>/railway.json`. Without it Railway silently
falls back to the web build — the #1 cause of "wrong service deployed" bugs.

Shared secrets to be aware of (don't print values): `INGEST_WEBHOOK_SECRET` =
`TAP_ADMIN_PASSWORD`; `PUBLIC_URL=https://standard-reader.app`;
`ATPROTO_PRIVATE_KEY_JWK` is the ES256 OAuth signing key. Honeycomb
(`HONEYCOMB_API_KEY`) is the primary observability layer — Railway has no log
drain, so structured events forward to Honeycomb from `web` + `ingest`.

## Prerequisites

The Railway CLI must be installed and linked to this project.

```bash
# Verify CLI is present
railway --version

# If missing, install (macOS)
brew install railway

# Authenticate (opens browser) — or use --browserless for SSH sessions
railway login

# Link this directory to the standard-reader project + environment
# (interactive: pick the project and environment when prompted)
railway link
```

For CI / non-interactive use, set `RAILWAY_TOKEN` (project-level) or
`RAILWAY_API_TOKEN` (account-level) instead of `railway login`.

The repo root is already linked (a `.railway` directory may exist). If
`railway status` reports the wrong project/environment, re-run `railway link`.

## Inspection workflow

Run these in order. Start broad (project overview), then narrow to the failing
service and deployment. Default to `--json` when you'll parse output, plain
output when a human will read it.

### 1. Project overview — what's deployed and is it healthy?

```bash
railway status
# Human-readable: workspace, project, environment, every resource with
# deployment status + replica counts + regions.

railway status --json
# Same payload as raw JSON — use when parsing.
```

`railway status` groups resources by type (Services, Databases, Volumes, Cron
jobs, Buckets). For each service it shows the latest deployment status and
replica count. This is the fastest "is anything broken?" check — run it first.

### 2. Recent deployments — what happened lately?

```bash
railway deployment list
# Lists deployments with IDs, statuses, and timestamps for the linked service.

# Target a specific service without relinking:
railway deployment list -s ingest
railway deployment list -s web
railway deployment list -s tap
railway deployment list -s recompute-cron
```

Deployment statuses you'll see:

| Status         | Meaning                                                        |
| -------------- | ------------------------------------------------------------- |
| `SUCCESS`      | Deployed and running                                          |
| `FAILED`       | Build or deploy failed                                        |
| `CRASHED`      | Started then crashed — check deploy logs                      |
| `BUILDING`     | Railpack build in progress                                    |
| `DEPLOYING`    | Built; container starting up                                  |
| `INITIALIZING` | Container starting                                           |
| `WAITING` / `QUEUED` | Pending capacity                                         |
| `REMOVING` / `REMOVED` | Tearing down / gone                                      |

A `CRASHED` or `FAILED` status means step 3 next, scoped to that service.

### 3. Logs — stream or fetch historical

`railway logs` shows deploy logs (app stdout/stderr) from the most recent
**successful** deployment by default. Use flags to retarget.

```bash
# Stream the latest deployment's deploy logs (Ctrl-C to stop)
railway logs --latest

# Last N lines, historical (no streaming)
railway logs -n 200

# Since / until windows (historical fetch mode)
railway logs --since 1h
railway logs --since 30m --until 10m

# A specific deployment (grab ID from `railway deployment list`)
railway logs 7422c95b-c604-46bc-9de4-b7a43e1fd53d

# A specific service (without relinking)
railway logs -s ingest --latest
railway logs -s web -n 100

# Build logs (failed build → look here first)
railway logs -s web --build
railway logs -s ingest --build --latest

# HTTP logs (request-level: method, path, status, duration, request ID)
railway logs -s web --http -n 50

# Machine-readable for parsing
railway logs -s ingest -n 100 --json
```

Log type flags (`--deployment` default, `--build`, `--http`, `--network`) are
mutually exclusive. With no `--lines`/`--since`/`--until`, `railway logs`
**streams in real time** over a WebSocket — pass any of those flags to switch
to historical fetch mode instead.

### 4. Variables — confirm runtime config

Never print secret values back to the user. Use this only to confirm a key is
*set* (presence check), and reference env var names rather than values.

```bash
# List variable KEYS for the linked service (mask values when showing output)
railway variable list -s web
railway variable list -s ingest
```

If a deploy is misbehaving, check that these are present and correct:

- `web`: `DATABASE_URL`, `PUBLIC_URL` (= `https://standard-reader.app`),
  `ATPROTO_PRIVATE_KEY_JWK`, `HONEYCOMB_API_KEY`, `HONEYCOMB_DATASET`,
  `INGEST_WEBHOOK_SECRET`, `TAP_API_URL` (= `http://tap.railway.internal:2480`)
- `ingest`: `DATABASE_URL`, `INGEST_WEBHOOK_SECRET`, `TAP_API_URL`,
  `HONEYCOMB_API_KEY`, `INGEST_PORT` (= `3099`)
- `tap`: `TAP_ADMIN_PASSWORD` (must equal `INGEST_WEBHOOK_SECRET`),
  `TAP_SIGNAL_COLLECTION`, `TAP_COLLECTION_FILTERS`, `TAP_DATABASE_URL`
- `recompute-cron`: `INGEST_WEBHOOK_SECRET`, `INGEST_PORT` / service URL for
  the POST target
- `reconcile-cron`: `DATABASE_URL`, `TAP_API_URL`, `TAP_ADMIN_PASSWORD`,
  `HONEYCOMB_API_KEY`. It reaches the DB and PDSes directly rather than going
  through ingest, so it needs the DB URL itself — plus tap's admin credentials,
  because repairing a record can newly track its author's repo. Optional:
  `RECONCILE_LAP_HOURS` (default 24), `RECONCILE_INTERVAL_HOURS` (default 1),
  `RECONCILE_BATCH` (explicit override; skips the fleet-size derivation)

### 5. Drilling into a running service

```bash
# SSH into the running container (interactive shell — for live debugging)
railway ssh -s ingest

# Resource + HTTP metrics for a service
railway metrics -s web

# Database shell (if the service has a database resource)
railway connect
```

`railway ssh` is the fastest way to inspect a running container's filesystem,
env, or process tree. Copy the exact `railway ssh ...` command from the
dashboard (right-click a service → "Copy SSH Command") if the CLI defaults
target the wrong service.

## Triage patterns

### "The latest deploy failed"

1. `railway deployment list -s <service>` → grab the top deployment ID + status.
2. If `FAILED` or `BUILDING` (stuck): `railway logs -s <service> --build --latest`.
   Look for build errors (Railpack, `pnpm build`, missing deps).
3. If `CRASHED`: `railway logs -s <service> --latest -n 200`. The container
   started then died — look for the startup error (missing env, port bind
   failure, missing `.output/server/index.mjs` on `web`).

### "web is returning 5xx / users see errors"

1. `railway logs -s web --http -n 100` → spot the failing paths/status codes.
   Each line has a `request_id`.
2. `railway logs -s web --since 15m` → correlate deploy-log lines around the
   same timestamps as the HTTP errors.
3. If the failures started after a deploy, compare the deployment ID from
   `railway deployment list -s web` against when errors began.

### "ingest worker not updating the read-model"

1. `railway status` → confirm `ingest` shows `SUCCESS` with replicas > 0.
2. `railway logs -s ingest -n 200` → look for tap WebSocket disconnects,
   backfill errors, or DB write failures.
3. Check `tap` is healthy too: `railway logs -s tap -n 100`. The ingest worker
   can't make progress if tap isn't delivering events.
4. Hit the ingest admin endpoint over private networking (from `web` or a
   sandbox): `GET /api/ingest/status` (Basic auth `admin:$INGEST_WEBHOOK_SECRET`)
   on `http://ingest.railway.internal:3099`.

### "recompute cron didn't fire"

1. `railway status` → find the `recompute-cron` cron job entry (shows schedule
   + next run time).
2. `railway deployment list -s recompute-cron` → its deployments are individual
   executions; a `FAILED` entry means the run errored.
3. `railway logs -s recompute-cron --latest` → the run's stdout/stderr.

### "Wrong service got deployed (config-file-path gotcha)"

Symptom: `ingest` or `recompute-cron` is running the `web` build (look for
`node .output/server/index.mjs` in `tap`/`ingest` logs, or a missing `tsx`
startup line).

Cause: Railway fell back to the root `railway.json` because the service's
Config File Path wasn't set. Fix via Dashboard → service → Settings →
Config-as-code → set to `railway.ingest.json` / `railway.cron.json` /
`services/<svc>/railway.json`, then redeploy. This is the documented runbook
gotcha — check it first whenever a non-web service looks like `web`.

## When to stop using the CLI

- **Honeycomb for app-level behavior:** Railway shows deploy/HTTP logs; for
  structured traces, slow-endpoint P99s, and ingest health over time, query
  Honeycomb (`HONEYCOMB_DATASET=standard-reader`). Railway has no log drain, so
  Honeycomb is the durable observability store.
- **Neon for DB issues:** if logs point at the database, use the `neon-postgres`
  skill — don't `railway connect` to a Railway-hosted DB (ours is on Neon).
- **Deploys / config changes:** this skill is read-only inspection. For
  `railway up`, `railway redeploy`, `railway variable set`, or editing
  `railway.json`, surface the intent to the user first and let them confirm —
  don't mutate production without explicit approval.

## Reference

- CLI command index: https://docs.railway.com/cli
- `railway status`: https://docs.railway.com/cli/status
- `railway deployment`: https://docs.railway.com/cli/deployment
- `railway logs`: https://docs.railway.com/cli/logs
- `railway ssh`: https://docs.railway.com/cli/ssh
- `railway metrics`: https://docs.railway.com/cli/metrics
- `railway variable`: https://docs.railway.com/cli/variable

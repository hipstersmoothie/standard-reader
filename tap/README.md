# `tap` — ingestion service for the Standard Reader read-model

[`tap`](https://github.com/bluesky-social/indigo/blob/main/cmd/tap/README.md)
is a single-tenant AT Protocol sync service (from `bluesky-social/indigo`). It
subscribes to a relay firehose, verifies repo structure + identity signatures,
**backfills** full repo history from each PDS, and emits filtered JSON events.

We run it as the first half of the ingestion tier for Standard Reader: tap
serves `site.standard.*` records (+ `app.bsky.actor.profile`) over its
acknowledged WebSocket channel to a standalone Node ingest service
(`pnpm ingest:dev`), which upserts them into the Postgres read-model. The
canonical records always live in each author's repo — Postgres is only a cache.

```
relay firehose ──► tap (verify + backfill + filter)
                ──WebSocket channel + acks──► ingest service (:3099 admin/status)
                                             ──► Postgres read-model
```

## Prerequisites

- Docker (with Compose), or a locally built `tap` binary.
- The Standard Reader ingest service running. It connects to tap's admin API /
  WebSocket channel at `TAP_API_URL` (default `http://127.0.0.1:2480`).
- A shared secret in **both** places:
  - root `.env`: `INGEST_WEBHOOK_SECRET=<secret>` (and optionally `TAP_API_URL=http://127.0.0.1:2480` to enable dynamic repo tracking),
  - `tap/.env`: `TAP_ADMIN_PASSWORD=<same secret>`.

## Quick start (local dev)

```bash
cd tap
cp .env.example .env
# edit .env: set TAP_ADMIN_PASSWORD (must match INGEST_WEBHOOK_SECRET)

# In another terminal, start the ingest worker from the repo root:
pnpm ingest:dev

docker compose up -d
docker compose logs -f tap        # watch it connect + backfill

# Seed some repos to index (optional; signal collection also enumerates publishers):
./seed-repos.sh did:plc:xxxx did:plc:yyyy

# Observe:
curl -u admin:$TAP_ADMIN_PASSWORD http://127.0.0.1:2480/stats/repo-count
curl -u admin:$TAP_ADMIN_PASSWORD http://127.0.0.1:2480/stats/record-count

# Check the read-model side (ingest worker must be running):
curl -u admin:$INGEST_WEBHOOK_SECRET http://localhost:3099/api/ingest/status
```

As repos backfill, events stream over tap's WebSocket channel to the ingest
worker and rows appear in Postgres. After the initial catch-up, recompute the
derived aggregates (stats + co-subscription graph used for
trending/recommendations):

```bash
curl -u admin:$INGEST_WEBHOOK_SECRET -X POST http://localhost:3099/api/ingest/recompute
```

Schedule that on a cron (e.g. every few minutes) in production.

## Network boundary: what gets indexed

`tap` first decides **which repos** to track, then filters **which records** to
deliver. Our defaults (see `docker-compose.yml`):

- `TAP_SIGNAL_COLLECTION=site.standard.publication` — track every repo that has
  at least one publication record (i.e. all standard.site **publishers**).
- `TAP_COLLECTION_FILTERS=site.standard.*,app.bsky.actor.profile,app.standard-reader.read`
  — of those repos, deliver only the standard.site collections we model, Bluesky
  profiles, and our own app-owned reader records (read) written back by the app.

This indexes **all publications, their documents, contributor/owner profiles,
and any subscription/recommend records that live in publisher repos.**

The ingest service also expands tracking dynamically: when the consumer ingests a record
referencing another repo (a document contributor, a subscription's target
publication, a recommend's document author), it calls tap's `/repos/add` for
that DID (requires `TAP_API_URL` set in the root env). So the index grows along
the graph from the publication seed. The app's write path does the same for the
signed-in reader's own repo the first time they follow / mark-read,
so their app-owned records flow back into the read-model.

### Capturing the full subscription/recommend graph

Subscriptions/recommends authored by **reader-only** repos (DIDs that own no
publication) aren't reachable from the publication seed alone. To index the
whole graph, pick one:

- **Full network** (heaviest, days/weeks to backfill, high bandwidth):
  set `TAP_FULL_NETWORK=true` (remove `TAP_SIGNAL_COLLECTION`).
- **Second signal instance**: run another tap with
  `TAP_SIGNAL_COLLECTION=site.standard.graph.subscription` (and the same
  filters/webhook) to also seed from subscriber repos.

> ⚠️ Bandwidth note: tap consumes the **entire** firehose and filters locally,
> so egress/ingress is non-trivial. Budget accordingly (or use a lighter
> Jetstream-based consumer if you don't need backfill/verification).

## Delivery semantics

- tap delivers **at least once** over the WebSocket channel.
- The ingest service applies events as **idempotent upserts/deletes**, so
  redelivery is safe. The tap client automatically acknowledges an event after
  the handler completes successfully. Failures are written to
  `ingest_dead_letter` and swallowed so one bad event never wedges tap's
  per-repo ordering.
- tap owns the firehose cursor + per-repo backfill state (in its own
  SQLite/Postgres store). The app's `ingest_state` table is a high-water mark
  for observability only.

## Configuration reference

All tap env vars are documented upstream; the ones we set live in
`docker-compose.yml` and `.env.example`. Key ones:

| Var                             | Purpose                                                     |
| ------------------------------- | ----------------------------------------------------------- |
| `TAP_DATABASE_URL`              | tap's own store (SQLite volume by default; can be Postgres) |
| `TAP_RELAY_URL` / `TAP_PLC_URL` | upstream relay + PLC directory                              |
| `TAP_SIGNAL_COLLECTION`         | which repos to track (network boundary)                     |
| `TAP_COLLECTION_FILTERS`        | which collections to deliver                                |
| `TAP_ADMIN_PASSWORD`            | Basic-auth secret (admin API **and** WebSocket channel)     |

## Production notes

- Keep the admin API (`:2480`) private; always set `TAP_ADMIN_PASSWORD`.
- Use a Postgres `TAP_DATABASE_URL` for higher throughput.
- Run the ingest service as a separate long-lived worker process, not inside the
  app server. Run the `recompute` cron against that service after backfill
  stabilizes.
- Deploying on Railway/Fly/etc.: this compose file maps cleanly to a single
  long-running container with a persistent volume at `/data`.

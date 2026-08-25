# Deploying Topics

Everything here is **post-merge**. The PR itself ships code, a migration, and a
cron entrypoint; none of it does anything until the steps below are done.

Ordered so the site is never in a broken state: the schema goes first, the app
comes up with an empty (therefore hidden) Topics section, and the derivation
fills it in.

---

## 0. Reconcile the migration ledger — **done**

Recorded here because it explains a one-time oddity, not because it is a step to
run. The feature's tables were created on prod by hand during development, under
three migrations later consolidated into `0032_topics.sql`. Prod's
`drizzle.__drizzle_migrations` listed the three superseded entries, so
`pnpm db:migrate` would have tried to `CREATE TABLE` over tables that already
existed.

Applied 2026-08-01 to production and to the PR's Neon branch: renamed the
`communities_pkey` index left behind by `ALTER TABLE ... RENAME`, added the
`superseded_by` column and its self-referencing foreign key, swapped the three
superseded ledger rows for the consolidated migration's hash and timestamp.
`pnpm db:migrate` against production is now a clean no-op, which is what the
web service's `preDeployCommand` runs.

**Do not run this again**, and nothing about a fresh database needs it — that
just applies `0032_topics.sql` normally.

---

## 1. Environment variables

All server-only — no `VITE_` prefix. Set on the **service that runs the topics
cron** (step 2). The web and ingest services do not need any of them.

Alongside these, `topics-cron` needs the same infrastructure variables every
other cron carries: `DATABASE_URL`, **`DB_DRIVER=pg`**, `HONEYCOMB_API_KEY`,
`HONEYCOMB_DATASET`, and the `OTEL_*` set that the start command's
`--require @opentelemetry/auto-instrumentations-node/register` expects.

| Variable                | Required       | Default                   | What it does                                                                                                                                                                                                       |
| ----------------------- | -------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `ANTHROPIC_API_KEY`     | no, but wanted | —                         | Enables model-authored topic names and descriptions. Without it every topic falls back to a title-cased dominant tag (`opinion` for a cars cluster, `linux` for a maker cluster), and the next run retries naming. |
| `TOPIC_NAMING_MODEL`    | no             | `claude-opus-5`           | Naming model. Naming is cached by cluster identity, so volume is tiny; drop to `claude-haiku-4-5` if the first run's cost is unwelcome.                                                                            |
| `TOPIC_EMBEDDINGS`      | no             | off                       | `1` adds semantic edges between tags that mean the same thing but never co-occur. This is what unifies web dev (`javascript`, `typescript`, `react`, `css`…) and merges `música` with `music`. Recommended on.     |
| `TOPIC_EMBEDDING_MODEL` | no             | `Xenova/all-MiniLM-L6-v2` | Runs locally via `@huggingface/transformers` — no API key, but the model downloads on first use and the pass needs the memory to run it.                                                                           |

`ANTHROPIC_API_KEY` is the only one that costs money. The first run names every
cluster (~85 calls at `effort: "low"`); after that it names only clusters that
are new or whose tag set drifted below 0.8 Jaccard, which is normally zero.

---

## 2. The `topics-cron` service

Topic derivation is **not** part of the hourly recompute sweep — it clusters the
whole tag graph and calls the naming model, which is minutes of work whose
output barely moves hour to hour. It gets its own Railway service, following the
shape of `reconcile-cron`.

| Setting          | Value                                              |
| ---------------- | -------------------------------------------------- |
| Service name     | `topics-cron`                                      |
| Config File Path | `railway.topics.json` — **must be set explicitly** |
| Start command    | `pnpm topics:cron` (from `railway.topics.json`)    |
| Schedule         | `0 4 * * *` (from `railway.topics.json`)           |
| Region           | same as the others (`us-west2`)                    |
| Needs            | the variables in step 1                            |

Railway auto-detects only the root `railway.json`, so a service without an
explicit Config File Path silently builds and runs the **web** service instead —
the project's standing runbook gotcha, and the first thing to check if
`topics-cron` looks like `web`. Set it under Settings → Config-as-code.

`DB_DRIVER=pg` is not optional. The sweep writes its results in one transaction,
and the Neon serverless HTTP driver has no transaction support (`db.transaction`
throws), so the run dies at the point where it persists.

It reads `discover_topic_counts`, which the hourly sweep rebuilds, so it only
needs those counts to exist — not to have just been refreshed. There is no
ordering constraint against any other service.

Runtime: ~4 minutes cold (first run, all clusters named), ~40 seconds once
naming is cached.

---

## 3. First run

```bash
# Dry run first — derives and prints what would be published, writes nothing
# and makes no API calls.
pnpm topics:derive          # published only
pnpm topics:derive --all    # including clusters that missed the bar
```

Then trigger the cron service once by hand rather than waiting for its
schedule, and check:

- **`/discover`** shows a Topics rail with a **See all** link.
- **`/topics`** lists ~85 topics; search matches on tags (`vinyl` should find
  Music even though the card never shows that tag).
- No topic contains `chart`, `weekly`, or `song` — those are one operator's
  publication fleet, and the top-author-share rule exists to exclude it.
- No `*.web.brid.gy` publication or article appears anywhere in the feature.

---

## 4. Rolling back

The feature is entirely additive: nothing outside `/topics`, the Discover rail,
and the derivation reads these tables.

- **Hide it** — `UPDATE topics SET published = false;`. Both surfaces render
  nothing (the rail hides itself when empty) and every `/topics/$slug` 404s.
  The next cron run republishes.
- **Stop rebuilding it** — pause or delete the `topics-cron` service. The last
  derived set stays live and static.
- **Remove it** — revert the PR; the tables can be dropped separately whenever.

No reader data lives in these tables. Everything in them is derived from
`documents` and `publications` and can be rebuilt by one cron run.

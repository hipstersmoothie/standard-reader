# Deploying Topics

Everything here is **post-merge**. The PR itself ships code, a migration, and a
cron entrypoint; none of it does anything until the steps below are done.

Ordered so the site is never in a broken state: the schema goes first, the app
comes up with an empty (therefore hidden) Topics section, and the derivation
fills it in.

---

## 0. Reconcile the migration ledger — **before merging**

Only needed because this feature's tables were created on prod by hand during
development, under three migrations that were later consolidated into one
(`0032_topics.sql`). Prod's `drizzle.__drizzle_migrations` still lists the three
superseded ones, so `pnpm db:migrate` would try to `CREATE TABLE` over tables
that already exist — the pre-deploy command fails and the deploy stops.

This also unblocks CI, which branches the Neon database from prod and applies
migrations to the branch.

```sql
BEGIN;

-- ALTER TABLE ... RENAME leaves the primary key index under the old name.
ALTER INDEX IF EXISTS communities_pkey RENAME TO topics_pkey;

-- The one column the hand-built tables predate.
ALTER TABLE topics ADD COLUMN IF NOT EXISTS superseded_by text;
ALTER TABLE topics DROP CONSTRAINT IF EXISTS topics_superseded_by_topics_slug_fk;
ALTER TABLE topics ADD CONSTRAINT topics_superseded_by_topics_slug_fk
  FOREIGN KEY (superseded_by) REFERENCES topics(slug) ON DELETE SET NULL;

DELETE FROM drizzle.__drizzle_migrations
 WHERE created_at IN (1785563248288, 1785571959144, 1785604772535);

INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('e1a1de621169c8946dd72493ca28aebccc354a86a68f1afe0e4a550027060e87',
        1785607674037);

COMMIT;
```

The hash is `sha256(drizzle/0032_topics.sql)` and the timestamp is that entry's
`when` in `drizzle/meta/_journal.json` — the same pair `drizzle-kit migrate`
would have written. Verify with:

```bash
node -e "console.log(require('crypto').createHash('sha256')
  .update(require('fs').readFileSync('apps/standard-reader/drizzle/0032_topics.sql','utf8'))
  .digest('hex'))"
```

Then delete the PR's stale Neon branch so CI re-creates it from the fixed prod
state, and confirm `pnpm db:migrate` against prod reports nothing to apply.

**This step is one-time.** Nothing about the feature needs it again; a fresh
database just runs `0032_topics.sql` normally.

---

## 1. Environment variables

All server-only — no `VITE_` prefix. Set on the **service that runs the topics
cron** (step 2). The web and ingest services do not need any of them.

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

| Setting       | Value                                                          |
| ------------- | -------------------------------------------------------------- |
| Service name  | `topics-cron`                                                  |
| Start command | `pnpm topics:cron`                                             |
| Schedule      | daily — `0 4 * * *` (off-peak; the exact hour does not matter) |
| Region        | same as the others (`us-west2`)                                |
| Needs         | `DATABASE_URL`, plus the variables in step 1                   |

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

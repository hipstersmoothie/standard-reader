# Standard Reader

> A warm, editorial reader for [standard.site](https://standard.site) publications on the
> AT Protocol (the Atmosphere). Like a classic RSS reader, but built around **discovery** —
> helping you find the publications you aren't following yet.

Instead of polling RSS/Atom feeds, a "publication" is a set of signed records in an
author-controlled AT Proto repository. Any reader that understands the schema can render any
publication, so the directory of all known publications is just a query — not a walled garden.
Standard Reader makes that literal: a [tap](https://github.com/bluesky-social/indigo) instance
backfills all `standard.site` data off the network into a Neon Postgres read-model, powering
feeds, search, trending, and network-wide recommendations. Your personal state (follows, likes,
read/unread, publication lists) is written back to **your** repo as records — owned by you,
cached by us.

For the full product vision (screens, data model, discovery engine), see
[`APP_VISION.md`](./APP_VISION.md). The actionable roadmap lives in [`TODO.md`](./TODO.md).

## Stack

- **Framework:** [TanStack Start](https://tanstack.com/start) + TanStack Router
  (file-based routing), React 19, Vite.
- **UI:** [hip-ui](https://hip-ui.tngl.io) design system (copy-and-own, react-aria) vendored in
  `src/design-system/`, styled with [StyleX](https://stylexjs.com) tokens — no Tailwind.
- **Data:** Neon Postgres read-model managed with [Drizzle](https://orm.drizzle.team)
  (`src/db/`), fed by a tap instance + ingest worker; accessed via server functions.
- **AT Protocol:** [`@atcute/*`](https://github.com/mary-ext/atcute) clients,
  AT Proto / Bluesky OAuth login, app-owned `app.standard-reader.*` lexicons in `lexicons/`.
- **Tooling:** pnpm, oxlint + oxfmt, Vitest.

## Getting started

Requires Node ≥ 22.6 and pnpm (pinned via `package.json#packageManager`).

```bash
pnpm install
cp .env.example .env   # fill in values — see comments in the file
pnpm dev               # http://localhost:3000 (hops to the next free port)
```

At minimum you need `DATABASE_URL` (a Neon Postgres connection string — a local Postgres works
too) and `PUBLIC_URL` (keep the default `http://127.0.0.1:3000` for local loopback OAuth; no
signing key needed in dev). Apply the schema with:

```bash
pnpm db:migrate   # or db:push for quick local iteration
```

### Ingestion (populating the read-model)

The app reads from Postgres; data gets there via a **tap** instance and a standalone ingest
worker:

1. Start tap — see [`tap/README.md`](./tap/README.md) (`docker compose up` in `tap/`, plus
   `seed-repos.sh` or dynamic repo tracking via `TAP_API_URL`).
2. Run the worker: `pnpm ingest:dev`. It consumes tap's acknowledged WebSocket channel, maps
   records to rows idempotently, and expands the tracked-repo set along the graph.

Without ingestion the app runs fine but the directory and feeds will be empty.

## Scripts

| Script | Purpose |
| --- | --- |
| `pnpm dev` / `build` / `start` / `preview` | Dev server / production build / serve / preview |
| `pnpm test` | Vitest |
| `pnpm typecheck` | `tsc --noEmit` |
| `pnpm lint` / `format` / `format:check` | oxlint / oxfmt |
| `pnpm check` | Format + lint `--fix` in one shot |
| `pnpm fix-stylex-keys` | Autofix StyleX `sort-keys` / `valid-shorthands` |
| `pnpm db:generate` / `db:migrate` / `db:push` / `db:studio` | Drizzle Kit |
| `pnpm ingest:dev` / `ingest:start` | Standalone tap-consumer ingest worker |
| `pnpm backfill:*` | One-off data backfills (blob URLs, search text, renderable bodies, content formats) |
| `pnpm lex:lint` / `lex:status` / `atproto:publish-lexicons` | Validate / publish the `app.standard-reader.*` lexicons via `goat` |

## Project structure

```
src/
  routes/             # file-based routes: / (Today), /latest, /discover, /search,
                      #   /a/$did/$rkey (article), /p/… (publication), /l/… (list),
                      #   /likes, /saved, /login, /about + /api/* (OAuth, OG images, ingest)
  components/reader/  # app shell, feeds, article view, audio player, modals
  design-system/      # hip-ui (copy-and-own) + StyleX theme tokens
  server/             # server-only code: atproto, reader queries, ingest, og, content
  db/                 # Drizzle schema + client
  integrations/       # TanStack Query server functions, auth
lexicons/             # app-owned app.standard-reader.* lexicon JSON
tap/                  # tap instance config (docker-compose) — see tap/README.md
scripts/              # backfills, lexicon publishing, asset generation, cron
drizzle/              # generated migrations
```

## Living docs

- [`APP_VISION.md`](./APP_VISION.md) — product vision: concept, screens, data model,
  architecture. Kept in sync with reality as decisions change.
- [`TODO.md`](./TODO.md) — the roadmap derived from the vision.
- [`AGENTS.md`](./AGENTS.md) — repo conventions for AI agents (design-system rules, lint setup,
  gotchas).

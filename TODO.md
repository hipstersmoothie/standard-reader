# Standard Reader — TODO

Derived from [`APP_VISION.md`](./APP_VISION.md). Organized toward the **v1 milestone**, then later
work. Check items off as they land.

---

## 0. Foundation & infra

- [x] Confirm TanStack Start + hip-ui + StyleX baseline runs (`pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`).
- [x] Set up env management (`.env` for `DATABASE_URL`, AT Proto OAuth secrets, tap config) + `.env.example`.
- [x] Confirm Neon project + connection (`src/db/index.ts`) and Drizzle migration flow (`drizzle.config.ts`, `drizzle/`).
- [x] Decide deployment target (Node server output) and wire CI for lint/format/typecheck/build (`.github/workflows/ci.yml`).
- [x] **Production deploy (Railway).** Four services in the `standard-reader` project (GitHub
      auto-deploy on push to `main`), sharing the existing Neon read-model DB:
  - `web` — TanStack Start + Nitro (`pnpm build` → `pnpm start` = `node .output/server/index.mjs`);
    pre-deploy `pnpm db:migrate`; healthcheck `/api/auth/atproto/metadata.json`; custom domain
    `standard-reader.app` (OAuth `client_id`/`jwks` authority). Root `railway.json`.
  - `tap` — `ghcr.io/.../tap` Docker image on a `/data` volume (SQLite state); signal collection
    `site.standard.publication` + dynamic `/repos/add` graph expansion.
  - `ingest` — standalone worker (`pnpm ingest:start` = `tsx src/server/ingest/service.ts`), binds
    `[::]:3099`, consumes `tap.railway.internal:2480`. Config file `railway.ingest.json`.
  - `recompute-cron` — `node scripts/recompute-cron.mjs` on `0 * * * *`, POSTs the ingest worker's
    `/api/ingest/recompute` over private networking. Config file `railway.cron.json`.
  - **Runbook gotcha:** Railway auto-detects only the root `railway.json`, so every non-web service
    in this monorepo needs its **Config File Path** set explicitly (Dashboard → service → Settings →
    Config-as-code, or `serviceInstanceUpdate{ railwayConfigFile }` via the GraphQL API) to
    `railway.ingest.json` / `railway.cron.json`; otherwise it silently falls back to the web build.
    Shared `INGEST_WEBHOOK_SECRET` = `TAP_ADMIN_PASSWORD`; `PUBLIC_URL=https://standard-reader.app`;
    `ATPROTO_PRIVATE_KEY_JWK` is the ES256 private JWK. Prod DB was reset to a clean schema (drop
    `public` + `drizzle`, then `pnpm db:migrate`) before first backfill.
  - **Build gotcha (StyleX + Vite 8 / Rolldown):** `nitro()` must run **before** `tanstackStart()`
    in `vite.config.ts`, and `build.cssCodeSplit` must be `false`. Otherwise Rolldown hoists the
    shared StyleX stylesheet into a single route chunk instead of linking it globally, so most
    pages render unstyled on first paint.
- [x] **Honeycomb o11y.** Structured server events (`observe` / `logEvent`) forward to Honeycomb
      when `HONEYCOMB_API_KEY` is set (`src/server/observability/honeycomb.ts`). Set
      `HONEYCOMB_DATASET=standard-reader` on Railway `web` + `ingest` services; dashboards track
      error rate, slow endpoints, and ingest health.

## 1. Data ingestion — tap → Neon

- [x] Stand up the **tap instance** to backfill all `standard.site` data from the network
      (`tap/` — docker-compose for `bluesky-social/indigo` cmd/tap, signal collection
      `site.standard.publication`, filters `site.standard.*` + `app.bsky.actor.profile`, webhook
      delivery to `/api/ingest/tap`; `tap/README.md` runbook + `tap/seed-repos.sh`).
- [x] Keep the read-model in sync (tap firehose + backfill; consumer expands tracking along the
      graph via tap `/repos/add` when it sees contributor/subscription/recommend references).
- [x] Operational basics: cursor persistence (tap-owned) + `ingest_state` high-water mark;
      retry/backoff (tap) + idempotent upserts + `ingest_dead_letter`; `/api/ingest/status`
      observability + structured logs.
- [x] Topic derivation: `recomputeTopics()` sets each publication's `topic` to its most
      frequent document tag (lexicon has no topic field).
- [x] Local-dev run verified end-to-end via the **real tap pipeline** against a local Postgres:
- [x] Local-dev run verified end-to-end via the **real tap pipeline** against a local Postgres:
      `tap/` docker-compose → acknowledged WebSocket channel → standalone ingest worker
      (`pnpm ingest:dev`) → consumer → `standard_reader` db. `src/db/index.ts` is driver-aware
      (node-postgres for local URLs, Neon serverless for Neon; override `DB_DRIVER`). Backfilled
      5k+ pubs / 60k+ docs / 5k+ subs / 8k+ profiles. The ingest worker, not the TanStack app
      server, owns tap event processing, operational status, and recompute endpoints.

## 2. Read-model schema (Drizzle)

- [x] Replace `demo_users` placeholder with real tables (`src/db/schema/`, migration `0000`,
      applied to Neon).
- [x] `publications` (`site.standard.publication`: uri/cid/did, name, url, description, icon blob,
      flattened `basicTheme`, `showInDiscover`, app-derived `topic`, verification state).
- [x] `documents` (`site.standard.document`: uri, publication ref + raw `site`, title, path,
      canonical URL, description, `content`/`textContent`, cover image blob, tags, app-derived
      `featured`, `bskyPostRef`, published/updated) + `document_contributors`.
- [x] `profiles` — author/contributor identity backfilled from Bluesky (`app.bsky.actor.profile`
  - identity layer): did, handle, pds, display name, bio, avatar/banner (standard.site has no
    profile lexicon).
- [x] `subscriptions` (`site.standard.graph.subscription`: subscriber DID → publication) +
      `recommends` (`site.standard.graph.recommend`: recommender DID → document) — for social proof
  - recommendations.
- [x] Derived/aggregate tables for **trending** and **recommendations**: `publication_stats`
      (counts, freshness, rolling-window velocity, normalized trending score, Constellation backlink
      aggregate) + precomputed `documents.trending_score` / backlink columns + `publication_cosubscriptions`
      (co-subscription similarity). Recomputed via `src/server/ingest/recompute.ts`.
- [x] Indexes for feed, directory sort (Readers / Active / A–Z), and search (GIN `tsvector` on
      documents + publications).
- [x] Generate + run migrations (`drizzle/0000_premium_gorgon.sql`).

## 3. Auth — AT Proto / Bluesky OAuth

Ported from `~/Documents/at-store` (`@atcute/oauth-node-client`). OAuth client +
stores in `src/integrations/auth/`, session/user server fns in
`src/integrations/tanstack-query/api-{auth,user}.functions.ts`, routes under
`src/routes/api/auth/atproto/*` + `src/routes/login.tsx`, auth tables in
`src/db/schema/auth.ts` (migration `drizzle/0002_true_vermin.sql`).

- [x] Implement OAuth sign-in flow (handle/PDS resolution, callback, session).
      Loopback (public) client locally; confidential client (`metadata.json` +
      `jwks.json`) in prod via `ATPROTO_PRIVATE_KEY_JWK`. Saved-handles cookie + signup flow included.
- [x] Persist session; expose current user **DID** to server functions + UI.
      Opaque HttpOnly session cookie → `session` row; DID always read from the
      `user` row (never the client). `maybeAuthMiddleware` / `requireAuthMiddleware`
      attach the DID + `@atcute/client` to server fns; `getSession` query feeds the UI.
- [x] Sign-out + session refresh handling (`user.signOut` deletes the session row + revokes the AT Proto session; OAuth session blobs stored in `verification`
      and restored per request).
- [x] Guard personal views on auth state. `unauthMiddleware` bounces signed-in
      users from `/login`; `requireAuthMiddleware` is ready to gate personal
      server fns/routes as Home/Latest/likes land. Header shows a **Log in**
      button that becomes the signed-in **user menu** (avatar → Copy DID / Log out).

## 4. Lexicons & writes (records = source of truth)

- [x] Define app-owned lexicons under `app.standard-reader` (JSON in `lexicons/`):
  - [x] `app.standard-reader.read` (`subject` = document at-uri + `createdAt`)
  - [x] Likes reuse `site.standard.graph.recommend` (no app-owned like lexicon)
  - [x] Publish tooling via `goat` (`scripts/goat-lex.mjs`): `pnpm lex:lint`,
        `pnpm atproto:publish-lexicons`. Needs `LEXICON_PUBLISH_*` creds for the
        `standard-reader.app` authority + `_lexicon.*` DNS (`goat lex check-dns`).
- [x] Confirm `standard.site` subscription lexicon shape: `site.standard.graph.subscription`
      (`publication` at-uri + optional `createdAt`); read-model ingests it.
- [x] Read-model + ingester for our own records: `reads` table (`drizzle/0003_*`), tap
      collection filters + consumer/handlers/deletes, and a `reader` track-reason so a
      reader's repo is registered with tap on first write. Likes use the network
      `site.standard.graph.recommend` collection (ingested into `recommends`).
- [x] Write path: create/delete records in the user's repo for follow / like (recommend) /
      read. Server-side helper `src/server/atproto/repo-records.ts` (`putRecord`/`deleteRecord`
      via `@atcute/atproto` + `@atcute/tid`, deterministic subject rkeys).
- [x] **Reader API layer** (`src/integrations/tanstack-query/api-reader.functions.ts`,
      mirrors `~/Documents/at-store`): `readerApi` server fns for follow / like /
      read (status reads from the cache + create/delete writes to the repo), structured
      o11y (`src/server/observability/log.ts`), and React Query `*QueryOptions` /
      `*MutationOptions` for the UI (pair mutations with optimistic updates).

## 5. Data layer (server functions)

Read-side query layer mirroring the reader API's server-fn + `*QueryOptions`
shape (`src/integrations/tanstack-query/api-{feed,discover,publication,search}.functions.ts`).
Shared DTOs / column projections / mappers in `api-shapes.ts`; shared read-model
SQL (article-card selector, follow set, unread counts, trending / recommended /
readers-also-follow rails) in `src/server/reader/queries.ts`. Every fn is wrapped
in structured o11y (`observe`) and reads from the Neon read-model.

- [x] Feed queries: Home (featured lead + latest unread + Trending/You-might-follow
      rails, with signed-out/cold-start fallback) + Latest (All / Unread + counts,
      offset pagination). `feedApi` in `api-feed.functions.ts`.
- [x] Directory queries: topic chips + All publications (topic filter, Readers/Active/A–Z
      sort, pagination) + Trending/Recommended rails for Discover. `discoverApi` in
      `api-discover.functions.ts` (rankings are simple reads over the precomputed
      aggregates; quality tuning stays in §7).
- [x] Publication profile query (header + owner identity, recent writing,
      readers-also-follow). `publicationApi.getPublicationProfile`.
- [x] Article query (full content + publication card + byline contributors +
      recommend count). `publicationApi.getArticle`; the GET stays side-effect-free.
      The UI marks read on link interaction (`ArticleLink` → `readerApi.markRead`,
      so it works for external articles too) and again on article open as a
      backstop; both apply an optimistic cache update (`read-optimistic.ts`).
      Feed cards carry an inline `isRead` flag (`selectArticleCards` `readForDid`)
      so read state renders correctly on first paint.
- [x] Search: publications + articles split over the GIN `tsvector` columns
      (`websearch_to_tsquery` + `ts_rank`). Article bodies index record
      `textContent` plus extracted content blocks into `text_content`.
      `searchApi.searchPublications` + `searchApi.searchArticles` with totals,
      offset pagination, load-more (publications), and infinite scroll (articles).
- [x] Handle resolution: AT Proto handle/domain → publication preview for the Add
      modal. `searchApi.resolvePublicationByHandle` resolves handle→DID, reads the
      read-model first, then falls back to listing the author's repo from their PDS
      (and kicks off tap tracking) for not-yet-indexed publications.

## 6. UI — port screens to TanStack Start + hip-ui

Build each on hip-ui components + StyleX tokens (no raw HTML/inline styles).

- [x] App shell: desktop persistent left sidebar; mobile top bar + bottom tab nav; Following list.
- [x] **Home** — masthead (date + unread count), featured lead, latest unread rows, right rail (Trending articles + You might follow).
- [x] **Latest** — chronological list, segmented All/Unread filter with counts.
- [x] **Discover** — Recommended / Followed-by-people-you-follow / Trending / All (chips, sort, grid⇄list toggle).
- [x] **Search** — editorial field, live results split into Publications + Articles. Route `/search` with URL `?q=`; paginated search APIs with full counts; load more (publications) + infinite scroll (articles); reuses `PubDirectoryRow` + `ArticleRow`.
- [x] **Article** (reading view) — ~680px measure, drop-cap, pull quotes, hero, sticky bar (back/byline/follow/save/share), reading-progress bar, footer pub card + "More from {publication}". Route `/a/$did/$rkey` (`_layout.a.$did.$rkey.tsx`); feed/profile cards link here; `publicationApi.getArticle` returns core content + Constellation comment count; below-the-fold rails (`moreFrom`, `readersAlsoFollow`) and discussion load client-side via `getArticleExtras` + `commentsApi.getDocumentComments`. Save toggle writes `site.standard.graph.recommend`; like counts on cards + article byline.
- [x] **Article discussion** — Bluesky comment section on documents: Constellation backlink discovery for external + app quote-share URLs, direct replies to the author's `bskyPostRef` (excluded from the list itself), hydrated via public AppView, facet-rendered commentary, reply counts linking to bsky threads (`commentsApi.getDocumentComments`).
- [x] **Page reader (Listen)** — on-device TTS for the reading view via `kokoro-js` (lazy-loaded on first use; `src/lib/page-reader/*`). Top-bar "Listen" button reads the whole article; selection toolbar adds "Read from here". The transport is a floating action bar (`PageReaderBar`) docked above the bottom nav on every route — same position on desktop and mobile — with status/time, title, back-15s, accent play/pause, speed menu, close, and a thin draggable seek track; the article keeps its own scroll-progress bar (`PageReaderProvider` + `PageReaderBar`).
- [x] **Publication profile** — banner + inline header (avatar/topic/name/desc/stats/Copy DID/Follow),
      recent writing (infinite scroll via `publicationApi.getPublicationDocuments` offset
      pagination), right rail (About + DID + readers-also-follow). Route `/p/$did/$rkey`
      (`_layout.p.$did.$rkey.tsx`); sidebar Following rows + cards link here instead of the
      external publication URL. The "followed by people you follow" social-proof line is deferred
      until the §7 social-graph query lands.
- [x] **Add / Follow modal** — Search field + publication rows (no tabs); uses `searchPublications` API; trending suggestions when empty.
- [x] Global follow toggle reflects everywhere instantly (optimistic).
- [x] Theme picker (light / dark / system) + editorial dark tokens + Shiki `standard-reader-dark`.
- [x] Theme tokens / dark mode parity with prototype (remaining hardcoded surfaces).
- [x] **Reader profile** — browse the signed-in user's likes (`site.standard.graph.recommend` records via `readerApi.getLikes`).
- [x] **Per-page OG cards** — satori-rendered Open Graph images for the main routes (Today, Discover, Latest, Saved, Search, About, Sign in) in the site-card editorial style, served from `/api/og/page/$slug` (`src/server/og/page-card.tsx`); copy lives in `PAGE_OG_CARDS` and each route's `head` emits full social meta via `pageSocialMeta` (`src/lib/site-metadata.ts`). Article quote shares and the site-wide card already had their own OG endpoints.

## 7. Discovery engine (network-powered)

- [x] **Recommended for you** — blends co-subscription, co-recommend (`publication_corecommends`), and likes from co-readers.
- [x] **Followed by people you follow** — co-subscriptions + likes from co-readers.
- [x] **Trending publications / Trending articles** — cron-precomputed normalized scores (decay,
      velocity, z-score blend, Constellation backlinks, distinct recommenders excl. self); 4-day
      recency gate; per-publication + per-author diversity caps on rail reads.
- [x] **Cold start** — popularity fallback (`trending_score` incl. likes) excluding the trending set (rails stay distinct).
- [x] **Readers also follow** — co-subscription + co-recommend affinity on publication profiles.

---

## Later (post-v1)

- [ ] Offline / save-for-later.

## Non-goals (for now)

- Read-first client: **no** in-app posting or authoring publications. Discussion is read-only from Bluesky.

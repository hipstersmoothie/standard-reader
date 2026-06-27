# Standard Reader — TODO

Derived from [`APP_VISION.md`](./APP_VISION.md). Organized toward the **v1 milestone**, then post-v1
work from [`.cursor/plans/post-v1_feature_roadmap_0dbfa3bd.plan.md`](./.cursor/plans/post-v1_feature_roadmap_0dbfa3bd.plan.md).
Check items off as they land.

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
- [x] **Nav perf (Honeycomb audit).** `getShellBootstrap` seeds session, theme, track-reading,
      home scope, and (signed-in) one `loadShellSnapshot` round trip (sidebar + own lists + saved
      lists). `_layout` blocks on sidebar for signed-in readers; guests prefetch sidebar in the
      background. 5m `staleTime` on shell queries; `getHomePage` / `getHomeExtras` read prefs from
      the auth session row (no extra `user.findFirst`). Combined `tag.getPage` loader, parallel
      article status fetches, deferred comments, subscription skeleton in AppShell, client
      `nav.transition` telemetry.
- [x] **`/saved` perf: PLC lookups + preload stale time.** Honeycomb MCP revealed
      `getShellBootstrap` at 4.3s P99 (vs `reader.getSaved` at 363ms P99). Root cause:
      `lookupOwners` in `loadSavedListsHydrated` called `resolveIdentity(did)` (network
      fetch to `plc.directory`, 8s timeout) for every saved-list owner missing a handle
      in the `profiles` table — sequential PLC lookups blocking the critical path. Fix:
      made `lookupOwners` DB-only (tap ingester syncs handles from the firehose; owners
      missing from the DB get null handles, which the UI already handles gracefully).
      Also set `defaultPreloadStaleTime: 30_000` in the router so hover→click preloaded
      data stays fresh instead of refetching (was `0`). Wrapped `getShellBootstrap` in
      `observe()` for ongoing Honeycomb visibility. Result: cold `/saved` 5.2s→3.6s,
      cold `/likes` 3.7s, cold `/history` 1.3s; warm loads ~0.8s across all routes.
- [x] **`/saved` perf: sequential DB query chains.** Phase timing revealed
      `loadShellSnapshot` was dominated by `savedListsForReader` (3 sequential DB
      round trips: listSaves → refetch listSaves → lists) and `loadSidebarData`
      (bookmark count blocked behind `effectiveFollowUris`). Fix: rewrote
      `savedListsForReader` to use a single `listSaves LEFT JOIN lists` query (one
      round trip instead of 3); eliminated the redundant re-query on the non-backfill
      path; started the bookmark count query in parallel with `effectiveFollowUris`
      in `loadSidebarData`. Remaining cold latency (~2–3s) is Neon compute wake-up
      (scale-to-zero); warm loads are ~0.4–0.7s across all routes.
- [x] **Load perf regression suite.** Playwright budgets for guest + signed-in views
      (`pnpm perf:test`, `perf/load-regression.spec.ts`); JSON report in `perf/results/latest.json`;
      fixture discovery via `pnpm perf:discover-fixtures`; signed-in auth via
      `PERF_TEST_IDENTIFIER` + `PERF_TEST_APP_PASSWORD` (or legacy session cookie).
- [x] **`/collections` read path → DB.** `listCollectionsPublications` /
      `getCollectionsPublication` made up to 7 paginated PDS `listRecords` round
      trips on the loader's critical path. Added `publications.collections_publication`
      (bool, mirrored from the `app.standard-reader.collectionsPublication` sidecar
      by the tap ingester) and rewrote both reads to hit the DB with a PDS backfill
      on cold start; write fns eagerly set the flag for read-after-write
      consistency (`drizzle/0022_cold_silk_fever.sql`).
- [x] **Article/narration content resolution → DB-backed.** The article detail and
      narration read paths re-ran the fetch-backed content resolvers
      (`resolveLeafletContent` / `resolvePcktContent` / `resolveGreengaleContent` /
      `resolveFetchedContent`) on every view for Leaflet/pckt/Greengale/standard-markdown/
      yrriban/markpub documents whose body lives out-of-record. The ingester already
      inlines these into `documents.content_json` at tap time, but any row that landed
      un-inlined (transient PDS outage, newly-supported format) triggered a per-request
      `com.atproto.sync.getBlob` / `getRecord` fetch forever — the result was never
      written back. Added `resolveAndPersistContent`
      (`src/server/content/resolve-and-persist.ts`): skips the PDS entirely when the
      row is already inlined, otherwise resolves once and writes the inlined form +
      recomputed `text_content` / `has_renderable_body` back to `documents` so
      subsequent reads stay on the DB (per the "never hit the PDS for a read when
      data exists in the DB" rule). `buildArticleDetail` and `resolveNarration` both
      route through it.
- [x] **Browser image URLs → Bluesky CDN (derived from CID, not stored).**
      Publication icons and document cover images were stored in the DB as raw
      `com.atproto.sync.getBlob` URLs on the author's PDS, so every `<img>` load
      hit the PDS directly — exposing the PDS hostname, defeating CDN caching
      (PDS serves `Cache-Control: private` + `Content-Disposition: attachment`),
      and routing through a non-CDN-optimized server. The Bluesky CDN
      (`cdn.bsky.app`) serves _any_ PDS blob by (did, cid), not just Bluesky app
      blobs — confirmed it serves standard.site icons/covers with
      `Cache-Control: public, max-age=604800` + inline disposition, and can
      transcode format.
      **The DB no longer stores the URL at all** — `publications.icon_url` and
      `documents.cover_image_url` are dropped (migration `0023_woozy_jane_foster`).
      The ingester writes only the CID (`icon_cid` / `cover_image_cid`); every
      read path selects `(did, cid)` and derives the CDN URL at serve time via
      `cdnImageUrl(did, cid, format)` (`src/server/atproto/blob.ts`). This is
      strictly better: the column can't go stale when an author migrates PDS, the
      row is smaller, and the backfill script (`backfill:blobs` /
      `backfillBlobUrls`) is deleted entirely. The `pdsBlobUrlToCdn` URL-rewriter
      helper is also gone — with no stored getBlob URLs to rewrite, callers use
      `cdnImageUrl` directly. Icons use `@png` (alpha-preserving); covers use
      `@jpeg`. Affected read paths: card mappers (`toPublicationCard` /
      `toArticleCard`), `buildArticleDetail`, `getPublicationEmbedMeta`,
      collection summaries, OG image routes (article/collection/publication/list/
      quote), extension page resolver, raw SQL in `queries.ts` /
      `collection-magazine.ts`, and in-content image builders
      (`leafletImageUrl` / `pcktImageUrl` / `structuredImageUrl` / `blobImageUrl`).
- [x] **`/saved` (and `/likes`, `/history`) read-path → no PDS client restore.**
      The personal queue server fns (`getSaved`, `getLikes`, `getReadingHistory`,
      `getBookmarkStatus`, `getReadStatus`, `getReadDocuments`, `getFollowStatus`,
      `getRecommendStatus`) only need the reader's DID for DB queries, but called
      `getAtprotoSessionForRequest()` which restores the PDS client
      (`manager.resume()` — a network round trip to the PDS). Added
      `getReaderDidForRequest()` (`src/middleware/auth-session.server.ts`): a
      DB-only session-row lookup with a DID-only token cache, reused across
      sibling read fns during SSR. `dbMiddleware`'s
      `resolveTrackReadingHistoryEnabled` also restored the PDS client just to
      read a boolean — rewritten to read the `user.track_reading_history` column
      directly from the DB session row. Finally, `getSessionQueryOptions` had
      `staleTime: 0` (default), so every `ensureQueryData` in the
      `/saved` `/likes` `/history` `beforeLoad` blocks refetched the session
      (another `getSession()` server fn → PDS restore + PLC identity lookup)
      on every navigation, even though root `beforeLoad` already seeds it via
      `getShellBootstrap()`. Set `staleTime: 5min` to match the root bootstrap.
      Combined: cold `/saved` load dropped from ~4.4s to ~1.1s; client-side nav
      from `/likes` → `/saved` dropped from ~7.8s to ~2.1s.

## 1. Data ingestion — tap → Neon

- [x] Stand up the **tap instance** to backfill all `standard.site` data from the network
      (`tap/` — docker-compose for `bluesky-social/indigo` cmd/tap, signal collection
      `site.standard.publication`, filters `site.standard.*` + `app.bsky.actor.profile`, webhook
      delivery to `/api/ingest/tap`; `tap/README.md` runbook + `tap/seed-repos.sh`).
- [x] **Loose documents** — `site.standard.document` records whose `site` is an `https://` URL
      (no publication record, e.g. Leaflet-hosted). A third `tap-docs` instance signals on
      `site.standard.document` so author repos with no publication still get tracked + backfilled
      (`tap/docker-compose.yml`, `TAP_DOCS_API_URL` on the ingest worker). The read model relaxes
      `publication_uri IS NOT NULL` to "loose doc OR discover-eligible publication"
      (`discoverEligibleArticleWhere`), so loose docs surface in Latest All, Trending, tags, and
      search. `articleCardColumns` joins the author profile on `documents.did` so bylines resolve
      (avatar/handle fall back to the author when there's no publication). Author profile `/u/$did`
      gains a "Documents" section listing the author's loose docs; `authorProfileStats.documentCount`
      adds the loose-doc total.
      **Verified in production (2026-06-27):** `tap-docs` is online (`:2482`,
      `TAP_SIGNAL_COLLECTION=site.standard.document`, volume `tap-docs-volume` at `/data`,
      actively backfilling repos). The ingest worker has `TAP_DOCS_API_URL` set but is still on
      `main` (no `docsTapChannel` wiring), so only the primary + labeler channels are connected —
      the docs channel will come online once `feat/loose-docs-tap-signal` is merged + redeployed.
      DB check: 795 loose docs already present (authored by 229 DIDs, 28 of which have no
      publication — those arrived via the primary tap, which includes `site.standard.document` in
      its collection filter, for authors who previously had a publication). The read-model +
      byline changes are required to surface them: on `main`, the Latest All feed filters
      `publication_uri IS NOT NULL`, so loose docs are invisible there until the branch lands.
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
- [x] **Reader-repo subscription sync.** Follows write to the reader's PDS immediately but the UI
      reads Neon. Fixed: write-through on follow/unfollow, retry tap `/repos/add` when
      `tracked_repos.added_to_tap_at` is null, ingest reconcile loop + PDS backfill for reader
      repos with zero mirrored subs (`/api/ingest/reconcile-tracked`). Set `TAP_API_URL` on **both**
      Railway `web` and `ingest` services (`http://tap.railway.internal:2480`).
- [x] **Publisher-repo delete reconcile.** Tap delete events are applied on the hot path, but missed
      deletes (dead-letter cap, stream gaps, out-of-order backfill) are repaired by comparing each
      publisher repo to its PDS: `reconcileRepoFromPds` prunes stale rows in batched deletes.
      Runs on a 5-minute ingest timer (5 repos/tick), each hourly recompute sweep (50 repos), and
      manually via `pnpm backfill:repo-documents` / `POST /api/ingest/reconcile-repo`.

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
  - [x] `app.standard-reader.list` (publication list / sidebar folder: `name` + optional
        `description` + ordered `publications` at-uris + `createdAt`, tid rkey) and
        `app.standard-reader.listSave` (another reader's list added to this app: `list`
        at-uri + `createdAt`, deterministic rkey). Not mirrored into Neon — read/written
        directly against the owning repo (`listCollectionRecords`/`putListRecord`/
        `putListSaveRecord` in `repo-records.ts`, `listApi` in `api-lists.functions.ts`;
        public list pages fetch via unauthenticated `getRecord` on the owner's PDS).
        OAuth scope includes both collections, so sessions created before this change
        need a re-login to write lists.
  - [x] Collections sidecar lexicons (`app.standard-reader.collection`,
        `app.standard-reader.collectionsPublication`, `app.standard-reader.publicationTheme`):
        same-rkey sidecars instead of extension fields on `site.standard.*` records; dual-read
        legacy `readerCollection` / `readerCollections` / `basicTheme.fonts` until repos migrate;
        tap filters + ingest handlers wired; OAuth scope updated (re-login to write).
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
- [x] Tag directory: `/tag/$tag` lists publications with indexed posts carrying the tag
      and per-publication tagged-post counts; topic chips on cards link there.
      `tagApi` in `api-tag.functions.ts`.
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
- [x] Fix compounded `text_content`: `documentSearchText` deduped on exact
      equality only, and `backfillDocumentSearchText` fed the stored blob back
      in as record text — every run appended another copy of the extracted
      block plaintext (some rows reached ~20 copies, inflating reading times
      and making the page reader re-narrate the article after finishing).
      Dedupe is now approximate containment (punctuation-insensitive word
      5-gram coverage), the backfill strips legacy compounded copies via
      `repairCompoundedSearchText` (so re-running it is a fixed point), the
      prod rows were repaired (~194M → ~170M chars), and narration/reading
      time (`articleReadingText`) now prefers structured `contentJson`
      extraction over the `textContent` search blob.
- [x] Handle resolution: AT Proto handle/domain → publication preview for the Add
      modal. `searchApi.resolvePublicationByHandle` resolves handle→DID, reads the
      read-model first, then falls back to listing the author's repo from their PDS
      (and kicks off tap tracking) for not-yet-indexed publications.

## 6. UI — port screens to TanStack Start + hip-ui

Build each on hip-ui components + StyleX tokens (no raw HTML/inline styles).

- [x] App shell: desktop persistent left sidebar; mobile top bar + bottom tab nav; Following list.
- [x] **Home** — masthead (date + unread count), featured lead, latest unread rows, right rail (Trending articles + You might follow).
- [x] **Latest** — chronological list, segmented Unread / Subscriptions / All-network filter with counts (Unread = unread docs from subs, Subscriptions = all docs from subs, All = whole network).
- [x] **Discover** — Recommended / Followed-by-people-you-follow / Trending / All (chips, sort, grid⇄list toggle).
- [x] **Search** — editorial field, live results split into Publications + Articles. Route `/search` with URL `?q=`; paginated search APIs with full counts; load more (publications) + infinite scroll (articles); reuses `PubDirectoryRow` + `ArticleRow`.
- [x] **Search result snippets** — `ts_headline` excerpts in `searchArticles` /
      `searchPublications`; highlighted `<mark>` terms in `ArticleRow` and
      `PubDirectoryRow` on `/search`.
- [x] **Article** (reading view) — ~680px measure, drop-cap, pull quotes, hero, sticky bar (back/byline/follow/save/share), reading-progress bar, footer pub card + "More from {publication}". Route `/a/$did/$rkey` (`_layout.a.$did.$rkey.tsx`); feed/profile cards link here; `publicationApi.getArticle` returns core content + stale-while-revalidate `commentCount`; below-the-fold rails (`moreFrom`, `readersAlsoFollow`) and discussion load client-side via `getArticleExtras` + `commentsApi.getDocumentComments`. Save toggle writes `site.standard.graph.recommend`; like counts on cards + article byline.
- [x] **Article discussion** — Bluesky comment section on documents: Constellation backlink discovery for external + app quote-share URLs, direct replies to the author's `bskyPostRef` (excluded from the list itself), hydrated via public AppView, facet-rendered commentary, reply counts linking to bsky threads (`commentsApi.getDocumentComments`).
- [x] **Article discussion — margin.at** — merge `at.margin.note` / `at.margin.annotation` / `at.margin.highlight` and `network.cosmik.card` NOTE cards on the document's canonical URL into the same Discussion feed via Constellation (`at.margin.*` at `.target.source`, cosmik at `.url` / `.content.url`); hydrate from author PDS + Bluesky/margin profile; quote-style cards for `TextQuoteSelector` passages; reply counts via `at.margin.reply`; margin notes link to margin.at; cosmik NOTE cards link to Semble (`semble.so/url?id=…`); cosmik URL bookmarks excluded from counts.
- [x] **Article discussion — Constellation expansion** — widen Bluesky link paths (`embed.media.external`, alternate facet shape); below-fold **Cited in** rail plus **Related reading** merged with bidirectional `network.cosmik.connection` graph edges (`.target` + `.source`); `pnpm scan:discussion-sources` for ongoing `/links/all` discovery. (Skyreader shares evaluated and excluded from Discussion — full-article HTML reshare does not fit the comment-card model.)
- [x] **Page reader (Listen)** — on-device TTS for the reading view via `kokoro-js` (lazy-loaded on first use; `src/lib/page-reader/*`). Top-bar "Listen" button reads the whole article; selection toolbar adds "Read from here". The transport is a floating action bar (`PageReaderBar`) docked above the bottom nav on every route — same position on desktop and mobile — with status/time, title, back-15s, accent play/pause, speed menu, close, and a thin draggable seek track; the article keeps its own scroll-progress bar (`PageReaderProvider` + `PageReaderBar`).
- [x] **Publication profile** — banner + inline header (avatar/topic/name/desc/stats/Copy DID/Follow),
      recent writing (infinite scroll via `publicationApi.getPublicationDocuments` offset
      pagination), right rail (About + DID + readers-also-follow). Route `/p/$did/$rkey`
      (`_layout.p.$did.$rkey.tsx`); sidebar Following rows + cards link here instead of the
      external publication URL. The "followed by people you follow" social-proof line is tracked in
      §8 (post-v1 Tier 1).
- [x] **Add / Follow modal** — Search field + publication rows (no tabs); uses `searchPublications` API; trending suggestions when empty.
- [x] Global follow toggle reflects everywhere instantly (optimistic).
- [x] Theme picker (light / dark / system) + editorial dark tokens + Shiki `standard-reader-dark`.
- [x] Theme tokens / dark mode parity with prototype (remaining hardcoded surfaces).
- [x] **"Open on original site" preference** — user-menu toggle that bypasses the in-app reader:
      document links (feed/search cards, "More from", embedded standard.site post cards) open the
      article's canonical URL in a new tab (marking it read), and `/a/$did/$rkey` redirects to the
      publication site. Cookie `standard-reader-open-links` for everyone + `user.open_links_externally`
      when signed in (`drizzle/0011_*`); articles without a canonical URL fall back to the reader
      (`#/lib/open-links`, `useOpenLinks`, `OpenLinksMenuItem`).
- [x] **Reader profile** — browse the signed-in user's likes (`site.standard.graph.recommend` records via `readerApi.getLikes`); `/likes` infinite scroll (20 per page, IntersectionObserver sentinel).
- [x] **Publication lists (sidebar folders)** — named, ordered lists of publications
      (one level deep, a publication can be in several lists): folder-plus button in the
      Subscriptions header creates one, each list header has an edit (pencil) button opening
      `ListEditModal` (name + description fields, drag-to-reorder ListBox with per-row remove,
      react-aria autocomplete over the remaining subscriptions). List groups render above the
      flat "All" list (desktop sidebar only).
- [x] **Shareable list pages** — every list has a public route `/l/$did/$rkey` (hero with
      name/description/owner handle, **Articles** tab with a paginated feed across member
      publications + **Publications** tab with ranked member rows and follow buttons, social meta).
      Owners get Edit and Delete buttons (delete confirms, then returns home); other signed-in
      readers get **Add list / Remove list**, which
      writes/deletes an `app.standard-reader.listSave` record — saved lists then render as
      extra sidebar groups (attributed `name · @owner`, label links to the list page).
- [x] **Saved lists act as virtual subscriptions** — feeds, the sidebar, unread counts, and
      mark-all-read operate on the reader's _effective_ follow set (subscriptions ∪ saved-list
      publications) via `effectiveFollowUris` in `src/server/reader/saved-lists.ts`; saved
      lists are resolved from the PDSes with a 60s per-reader cache (busted on save/unsave),
      and recommendation rails anchor on / exclude the effective set so list members aren't
      re-suggested. No `site.standard.graph.subscription` records are written.
- [x] **Per-page OG cards** — satori-rendered Open Graph images for the main routes (Today, Discover, Latest, Saved, Search, About, Sign in) in the site-card editorial style, served from `/api/og/page/$slug` (`src/server/og/page-card.tsx`); copy lives in `PAGE_OG_CARDS` and each route's `head` emits full social meta via `pageSocialMeta` (`src/lib/site-metadata.ts`). Article quote shares and the site-wide card already had their own OG endpoints.
- [x] **Article + publication OG cards** — publication-themed satori cards for plain article links
      (`/api/og/article?did&rkey`, `src/server/og/article-card.tsx`: kicker, headline, description,
      pub icon/handle footer, date + reading time, cover image side panel when present) and for
      publication profiles (`/api/og/publication?did&rkey`, `src/server/og/publication-card.tsx`:
      icon, topic kicker, name, description, @handle + readers/posts footer). Both reuse the quote
      card's theme resolution (`resolveQuoteOgColors`, WCAG-guarded). `/a/...` (non-quote) and
      `/p/...` route `head`s now emit full social meta via `siteSocialMeta` +
      `articleOgImageUrl`/`publicationOgImageUrl`. `loadOgImage` fetches original blobs first
      (png/jpeg pass through, alpha preserved) and falls back to the Bluesky CDN `@png` variant
      for formats satori can't parse (webp blobs previously 500'd quote cards too).
- [x] **List OG cards** — editorial-style satori cards for shared publication lists
      (`/api/og/list?did&rkey`, `src/server/og/list-card.tsx`: "Publication list" kicker, name,
      description, overlapping row of up to 6 member icons + "+N" bubble, by @owner +
      publication-count footer). List record comes from the PDS (`fetchPublicList`); member
      icons/owner handle hydrate from the read model. `/l/...` route `head` emits the card via
      `listOgImageUrl`; cached more briefly than article cards since lists are editable.
- [x] **Collection OG cards** — publication-themed satori cards for magazine collection links
      (`/api/og/collection?did&rkey`, `src/server/og/collection-card.tsx`: theme colors,
      publication kicker, collection title, editorial/description, "In this issue" TOC, feature
      count). `/collection/...` route `head` emits the card via `collectionOgImageUrl` +
      collection-specific title/description.
- [x] **standard.site discovery hints** — `/p/...` emits
      `<link rel="site.standard.publication" href="at://…">` and `/a/...` emits
      `rel="site.standard.document"` (+ the publication hint when the document belongs to one),
      per https://standard.site/docs/verification/#discovery-hint (hints only; verification
      stays with the publisher's `.well-known`).

## 7. Discovery engine (network-powered)

- [x] **Recommended for you** — blends co-subscription, co-recommend (`publication_corecommends`), and likes from co-readers.
- [x] **Followed by people you follow** — co-subscriptions + likes from co-readers.
- [x] **Trending publications / Trending articles** — cron-precomputed normalized scores (decay,
      velocity, z-score blend, Constellation backlinks, distinct recommenders excl. self); 4-day
      recency gate; per-publication + per-author diversity caps on rail reads.
- [x] **Cold start** — popularity fallback (`trending_score` incl. likes) excluding the trending set (rails stay distinct).
- [x] **Readers also follow** — co-subscription + co-recommend affinity on publication profiles.

---

## 8. Post-v1 — wire up (Tier 1)

Backend/API exists; UI or copy is missing.

- [x] **Paste handle in Add publication modal** — wired `searchApi.resolvePublicationByHandle`
      into [`add-publication-modal.tsx`](src/components/reader/add-publication-modal.tsx) via
      handle-like input detection in the unified search field (1.1A; no separate tabs).
- [x] **Publication profile — “Followed by …” social proof** — compact line under the header on
      [`_layout.p.$did.$rkey.tsx`](src/routes/_layout.p.$did.$rkey.tsx) via
      `publicationFollowedByCoReaders` + `publicationApi.getPublicationSocialProof` (Bluesky
      follows you follow who also subscribe/like; auth-only).
- [x] **About page** — replace placeholder in [`_layout.about.tsx`](src/routes/_layout.about.tsx)
      with product copy (what Standard Reader is, AT Proto ownership, link to standard.site docs,
      privacy/data model). OG metadata already in [`site-metadata.ts`](src/lib/site-metadata.ts).
- [x] **Privacy policy + site footer** — [`/_layout/privacy`](src/routes/_layout.privacy.tsx) with
      [`PrivacyView`](src/components/reader/privacy-view.tsx); minimal [`SiteFooter`](src/components/site-footer.tsx)
      on layout pages and legal links on [`/login`](src/routes/login.tsx).

## 9. Post-v1 — reader polish (Tier 2)

- [x] **Reading typography preferences** — font size / measure (and optional sans body) on the
      article wrapper; cookie + optional `user` column (same pattern as [`open-links.ts`](src/lib/open-links.ts));
      menu item alongside [`OpenLinksMenuItem`](src/components/OpenLinksMenuItem.tsx)
      (`ReadingTypographySubMenu`, `useReadingTypography`, `drizzle/0012_*`).
- [x] **PWA install readiness** — Phase A: PNG icons (192/512), `apple-touch-icon`, expanded
      [`manifest.json`](public/manifest.json) + head tags in [`__root.tsx`](src/routes/__root.tsx).
      Regenerate via `pnpm icons:generate`. _Open decision:_ Phase B service worker for asset
      caching only (not offline articles).
- [x] **Content rendering gaps** — PCKT gallery renderer (`blog.pckt.block.gallery`); prod scan
      found 54 documents — implemented grid/list/carousel/masonry layouts via
      [`pckt-gallery.tsx`](src/components/reader/content/renderers/pckt-gallery.tsx).
- [x] **`at.markpub.markdown`** — full [Markpub.at](https://markpub.at/) support: dedicated
      renderer (`src/lib/markpub/*`, [`markpub-content.tsx`](src/components/reader/content/renderers/markpub-content.tsx)),
      flavor/extensions, facet/lens preprocessing, ingest-time `text.textBlob` fetch
      (`src/server/markpub/resolve.ts`).
- [x] **Discover — “Not following” filter** — toggle on [`_layout.discover.tsx`](src/routes/_layout.discover.tsx)
      All publications section to hide effective follow set ([`saved-lists.ts`](src/server/reader/saved-lists.ts)).

## 10. Post-v1 — save-for-later (Tier 3)

**Decision:** `app.standard-reader.bookmark` lexicon in the reader’s repo (not likes, not app-DB-only,
not offline body cache). Route slug **`/saved`**.

- [x] **Lexicon** — [`lexicons/app/standard-reader/bookmark.json`](lexicons/app/standard-reader/bookmark.json)
      (`subject` document at-uri + `createdAt`; deterministic rkey via `subjectRkey`). Publish via
      `pnpm lex:lint` + `pnpm atproto:publish-lexicons`.
- [x] **Write path** — `COLLECTION.bookmark`, `putBookmarkRecord` / `deleteBookmarkRecord` in
      [`repo-records.ts`](src/server/atproto/repo-records.ts); OAuth scope in
      [`scope.ts`](src/integrations/auth/scope.ts) (re-login required); `readerApi` save/unsave/list/status
      in [`api-reader.functions.ts`](src/integrations/tanstack-query/api-reader.functions.ts) with
      optimistic updates.
- [x] **Read-model + ingest** — `bookmarks` table (mirror [`reads`](src/db/schema/personal.ts)); tap
      collection filter + ingest handler + delete; `reader` track-reason on first write.
- [x] **UI** — `/saved` queue (separate from `/likes`); distinct save toggle on article
      bar + feed cards; user-menu link; empty state copy; infinite scroll (20 per page). Update [`APP_VISION.md`](APP_VISION.md) §5
      when landing.
- [x] **Reading history** — `/history` queue backed by existing
      `app.standard-reader.read` / `reads` table (no new lexicon); `readerApi.getReadingHistory` + user-menu link + empty state; infinite scroll (20 per page). Update [`APP_VISION.md`](APP_VISION.md) when landing.
- [x] **Track reading history setting** — user-menu toggle (cookie + `user.track_reading_history`);
      when off: no `markRead` writes, zero unread counts/dots, hidden Unread tab + Reading history link.

## 11. Post-v1 — bigger bets (Tier 4)

After Tier 1–3, as appetite allows:

- [x] **Author view** — `/u/$did` lists all publications from one DID (identity in
      [`profiles`](src/db/schema/profiles.ts)); linked from publication profiles, lists, and article bylines.
      Sifa Resume chip when `id.sifa.profile.self` exists on the author's PDS.
- [x] **Related articles** — “Related reading” rail on article footer (`relatedArticles` in
      `getArticleExtras`: tag overlap + co-read blend, excludes same publication).
- [x] **Share publication / list** — `ShareMenu` on `/p/` and `/l/` (copy link + compose-to-bsky).
- [x] **Subscribe embed** — `ShareMenu` embed option on `/p/`; `/embed/subscribe/$did/$rkey`
      iframe card + `/subscribe/$did/$rkey` flow (subscription-only OAuth scope, auto-follow,
      themed success screen).

## 12. Browser extension (WXT)

Full-featured MV3 extension in [`extension/`](extension/) — popup, page overlay, context menu,
Bluesky badges, options page. Backend routes under [`src/routes/api/extension/`](src/routes/api/extension/).

- [x] **Workspace scaffold** — `pnpm-workspace.yaml`, WXT + React + StyleX + hip-ui aliases,
      root scripts (`extension:dev`, `extension:build`, `extension:zip`), CI build step.
- [x] **Shared link normalization** — [`src/lib/link-target-variants.ts`](src/lib/link-target-variants.ts).
- [x] **Resolve server** — [`src/server/extension/resolve-page-url.server.ts`](src/server/extension/resolve-page-url.server.ts)
      (SR links, `at://`, canonical URL, publication homepage).
- [x] **API routes** — `/api/extension/{session,resolve,bookmark,follow,recommend}`.
- [x] **Connected landing** — [`/extension/connected`](src/routes/extension.connected.tsx) after OAuth.
- [x] **Extension client** — background message router, hip-ui popup, unified content script
      (page overlay + Bluesky badges), context menus, toolbar badge, options page.
- [x] **Extension privacy URL** — [`/privacy/extension`](src/routes/_layout.privacy.extension.tsx) with
      [`ExtensionPrivacyView`](src/components/reader/extension-privacy-view.tsx); cross-linked from site privacy policy.
- [ ] **Manual QA** — run checklist in [`extension/README.md`](extension/README.md) (dev + prod).
- [ ] **Chrome Web Store publish** — follow [`extension/store/DEPLOY.md`](extension/store/DEPLOY.md) (prod API, privacy URL, QA, screenshots, upload).

## 13. AppView XRPC (public API)

Shipped catalog of `app.standard-reader.*` query/procedure lexicons on `/xrpc`, backed by the
Neon read-model. Auth follows AT Proto standard (DPoP + `getSession`, PDS proxy JWT) — no session
cookies on `/xrpc`. Live developer docs at [`/docs/api`](/docs/api).

- [x] **Lexicon defs + query/procedure schemas** — `lexicons/app/standard-reader/` (46 files);
      `pnpm lex:lint` passes (warnings only on unlimited-string).
- [x] **XRPC router** — `/xrpc/$` catch-all, handler registry, AT Proto error responses, CORS.
- [x] **Standard AT Proto auth** — `src/server/xrpc/auth.ts` (service JWT + access token getSession).
- [x] **Shared handlers** — `src/server/xrpc/handlers/`; publication header + mark-read extracted
      to `src/server/reader/publication-header.ts` and `mark-documents-read.ts`.
- [x] **Service DID** — `/.well-known/did.json` with `#standard_reader_appview`; OAuth protected
      resource metadata.
- [x] **Tier 1 queries** — resolve, search, publication/document/directory views.
- [x] **Tier 2 feeds** — latest/trending/tag/author/list/document-context with cursor pagination.
- [x] **Tier 3–4** — personalized reads + write procedures with scope enforcement.
- [x] **API docs page** — `/docs/api` catalog, in-process live examples, footer link.
- [x] **Lexicon docs page** — `/docs/lexicons` reference for all `app.standard-reader.*` schemas.
- [x] **XRPC test suite** — unit tests for registry, params, dispatch, and handlers
      (`src/server/xrpc/*.test.ts`); optional DB integration via
      `XRPC_INTEGRATION_TEST=1 pnpm test`.
- [ ] **Publish lexicons to network** — `pnpm atproto:publish-lexicons` when `_lexicon.*` DNS ready.
- [ ] **Production smoke test** — curl Tier 1 endpoints on `standard-reader.app` after deploy.

## 14. Labelers (moderation)

Standard AT Proto labels: subscribe to labelers, see/blur/hide their labels while reading.

- [x] **Lexicons** — vendored `com.atproto.label.{defs,queryLabels,subscribeLabels}`; app-owned
      `app.standard-reader.labeler.{service,defs,getServices}`, `labelerSubscription`,
      `getLabelers`, `getLabeler`, `getLabels`.
- [x] **Subscriptions** — `app.standard-reader.labelerSubscription` repo record (deterministic
      rkey, per-label visibility prefs), read-model mirror (`labeler_subscriptions`), tap filter,
      subscribe/unsubscribe procedures.
- [x] **Discovery** — resolve a labeler by DID/handle (DID doc → `#atproto_labeler` →
      descriptor); nothing hardcoded.
- [x] **Settings → Labelers** — `/settings/labelers` (add by handle/DID, list subscriptions) +
      `/settings/labelers/$did` (info, subscribe, per-label hide/blur toggles, labeled documents).
- [x] **Reader display** — badge + content warning on labeled documents per the reader's prefs.
- [x] **claudeslop** — standalone reference labeler (`services/claudeslop/`): Jetstream → heuristic
      AI-writing detector → signed labels (SQLite) → `queryLabels` + `subscribeLabels`.
- [ ] **Feed-level hiding** — filter `hide`-labeled documents out of feeds (currently surfaced
      only on the article page).
- [ ] **Signature verification** — verify label `sig` against the labeler's `#atproto_label` key
      when displaying (claudeslop signs; the app trusts the TLS endpoint for now).
- [ ] **subscribeLabels ingestion** — consume the labeler firehose into the read-model instead of
      live `queryLabels` per page, for lower latency.
- [ ] **Deploy claudeslop** — Railway service + persistent SQLite volume; publish its did:web.

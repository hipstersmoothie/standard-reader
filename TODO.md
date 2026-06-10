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
  - [x] `app.standard-reader.list` (publication list / sidebar folder: `name` + optional
        `description` + ordered `publications` at-uris + `createdAt`, tid rkey) and
        `app.standard-reader.listSave` (another reader's list added to this app: `list`
        at-uri + `createdAt`, deterministic rkey). Not mirrored into Neon — read/written
        directly against the owning repo (`listCollectionRecords`/`putListRecord`/
        `putListSaveRecord` in `repo-records.ts`, `listApi` in `api-lists.functions.ts`;
        public list pages fetch via unauthenticated `getRecord` on the owner's PDS).
        OAuth scope includes both collections, so sessions created before this change
        need a re-login to write lists.
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
- [x] **Article** (reading view) — ~680px measure, drop-cap, pull quotes, hero, sticky bar (back/byline/follow/save/share), reading-progress bar, footer pub card + "More from {publication}". Route `/a/$did/$rkey` (`_layout.a.$did.$rkey.tsx`); feed/profile cards link here; `publicationApi.getArticle` returns core content + Constellation comment count; below-the-fold rails (`moreFrom`, `readersAlsoFollow`) and discussion load client-side via `getArticleExtras` + `commentsApi.getDocumentComments`. Save toggle writes `site.standard.graph.recommend`; like counts on cards + article byline.
- [x] **Article discussion** — Bluesky comment section on documents: Constellation backlink discovery for external + app quote-share URLs, direct replies to the author's `bskyPostRef` (excluded from the list itself), hydrated via public AppView, facet-rendered commentary, reply counts linking to bsky threads (`commentsApi.getDocumentComments`).
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
- [x] **Reader profile** — browse the signed-in user's likes (`site.standard.graph.recommend` records via `readerApi.getLikes`).
- [x] **Publication lists (sidebar folders)** — named, ordered lists of publications
      (one level deep, a publication can be in several lists): folder-plus button in the
      Subscriptions header creates one, each list header has an edit (pencil) button opening
      `ListEditModal` (name + description fields, drag-to-reorder ListBox with per-row remove,
      react-aria autocomplete over the remaining subscriptions). List groups render above the
      flat "All" list (desktop sidebar only).
- [x] **Shareable list pages** — every list has a public route `/l/$did/$rkey` (hero with
      name/description/owner handle, ranked publication rows with follow buttons, social meta).
      Owners get an Edit button; other signed-in readers get **Add list / Remove list**, which
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
      `publicationFollowedByCoReaders` + `publicationApi.getPublicationSocialProof` (co-reader
      follow + like blend; auth-only).
- [ ] **About page** — replace placeholder in [`_layout.about.tsx`](src/routes/_layout.about.tsx)
      with product copy (what Standard Reader is, AT Proto ownership, link to standard.site docs,
      privacy/data model). OG metadata already in [`site-metadata.ts`](src/lib/site-metadata.ts).

## 9. Post-v1 — reader polish (Tier 2)

- [ ] **Keyboard shortcuts** — [TanStack Hotkeys](https://tanstack.com/hotkeys/latest)
      (`@tanstack/react-hotkeys`): `HotkeysProvider`, centralized `useHotkeys` in a new module,
      `ignoreInputs`, route scopes. v1 map: `/` + optional `Mod+K` → search; `j`/`k` + `Enter` on
      feed rows; `Shift+?` help dialog (hip-ui `Kbd` + `formatForDisplay`); `Escape` closes overlays.
      Touch: [`app-shell.tsx`](src/components/reader/app-shell.tsx), [`cards.tsx`](src/components/reader/cards.tsx),
      [`_layout.search.tsx`](src/routes/_layout.search.tsx).
- [ ] **Reading typography preferences** — font size / measure (and optional sans body) on the
      article wrapper; cookie + optional `user` column (same pattern as [`open-links.ts`](src/lib/open-links.ts));
      menu item alongside [`OpenLinksMenuItem`](src/components/OpenLinksMenuItem.tsx).
- [ ] **PWA install readiness** — Phase A: PNG icons (192/512), `apple-touch-icon`, expand
      [`manifest.json`](public/manifest.json). _Open decision:_ Phase B service worker for asset
      caching only (not offline articles).
- [ ] **Content rendering gaps** — PCKT gallery stub (`blog.pckt.block.gallery` in
      [`scan-unsupported-blocks.ts`](src/lib/content/scan-unsupported-blocks.ts)); run
      `pnpm scan:unsupported-blocks` against prod to prioritize; implement renderer when justified.
- [ ] **Discover — “Not following” filter** — toggle on [`_layout.discover.tsx`](src/routes/_layout.discover.tsx)
      All publications section to hide effective follow set ([`saved-lists.ts`](src/server/reader/saved-lists.ts)).

## 10. Post-v1 — save-for-later (Tier 3)

**Decision:** `app.standard-reader.bookmark` lexicon in the reader’s repo (not likes, not app-DB-only,
not offline body cache). _Open decision:_ route slug `/saved` vs `/bookmarks`.

- [ ] **Lexicon** — [`lexicons/app/standard-reader/bookmark.json`](lexicons/app/standard-reader/bookmark.json)
      (`subject` document at-uri + `createdAt`; deterministic rkey via `subjectRkey`). Publish via
      `pnpm lex:lint` + `pnpm atproto:publish-lexicons`.
- [ ] **Write path** — `COLLECTION.bookmark`, `putBookmarkRecord` / `deleteBookmarkRecord` in
      [`repo-records.ts`](src/server/atproto/repo-records.ts); OAuth scope in
      [`scope.ts`](src/integrations/auth/scope.ts) (re-login required); `readerApi` save/unsave/list/status
      in [`api-reader.functions.ts`](src/integrations/tanstack-query/api-reader.functions.ts) with
      optimistic updates.
- [ ] **Read-model + ingest** — `bookmarks` table (mirror [`reads`](src/db/schema/personal.ts)); tap
      collection filter + ingest handler + delete; `reader` track-reason on first write.
- [ ] **UI** — private `/saved` queue (separate from public `/likes`); distinct save toggle on article
      bar + feed cards; user-menu link; empty state copy. Update [`APP_VISION.md`](APP_VISION.md) §5
      when landing.

## 11. Post-v1 — bigger bets (Tier 4)

After Tier 1–3, as appetite allows:

- [ ] **Author view** — all publications from one DID (identity in [`profiles`](src/db/schema/publications.ts)).
- [ ] **Related articles** — content similarity (tags, co-read) beyond “More from {publication}”.
- [ ] **Share publication / list** — copy link + compose-to-bsky; OG cards exist for `/p/` and `/l/`.


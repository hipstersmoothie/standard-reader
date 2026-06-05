# Standard Reader — TODO

Derived from [`APP_VISION.md`](./APP_VISION.md). Organized toward the **v1 milestone**, then later
work. Check items off as they land.

---

## 0. Foundation & infra

- [x] Confirm TanStack Start + hip-ui + StyleX baseline runs (`pnpm dev`, `pnpm build`, `pnpm lint`, `pnpm typecheck`).
- [x] Set up env management (`.env` for `DATABASE_URL`, AT Proto OAuth secrets, tap config) + `.env.example`.
- [x] Confirm Neon project + connection (`src/db/index.ts`) and Drizzle migration flow (`drizzle.config.ts`, `drizzle/`).
- [x] Decide deployment target (Node server output) and wire CI for lint/format/typecheck/build (`.github/workflows/ci.yml`).

## 1. Data ingestion — tap → Neon

- [ ] Stand up the **tap instance** to backfill all `standard.site` data from the network.
- [ ] Keep the read-model in sync (ongoing firehose/cursor, not just one-shot backfill).
- [ ] Operational basics: cursor persistence, retry/backoff, observability/logging.

## 2. Read-model schema (Drizzle)

- [ ] Replace `demo_users` placeholder with real tables.
- [ ] `publications` (DID, handle, name, description, avatar/banner, topic, stats).
- [ ] `articles` (uri, publication ref, title, body/content, hero image, featured flag, published-at).
- [ ] `authors` / profiles.
- [ ] `follows` (subscription graph: follower DID → publication) — for social proof + recommendations.
- [ ] Derived/aggregate fields or tables for **trending** and **recommendations** (counts, velocity, co-subscription).
- [ ] Indexes for feed, directory sort (Readers / Active / A–Z), and search.
- [ ] Generate + run migrations.

## 3. Auth — AT Proto / Bluesky OAuth

- [ ] Implement OAuth sign-in flow (handle/PDS resolution, callback, session).
- [ ] Persist session; expose current user **DID** to server functions + UI.
- [ ] Sign-out + session refresh handling.
- [ ] Guard personal views (Home/Latest unread, bookmarks) on auth state.

## 4. Lexicons & writes (records = source of truth)

- [ ] Define app-owned lexicons under `app.standard-reader`:
  - [ ] `app.standard-reader.bookmark`
  - [ ] `app.standard-reader.readState`
- [ ] Reuse `standard.site` follow lexicon for subscriptions (confirm shape).
- [ ] Write path: create/delete records in the user's repo for follow / bookmark / readState.
- [ ] Optimistic cache update on write; reconcile from repo/firehose.

## 5. Data layer (server functions)

- [ ] Feed queries: Home (featured lead + latest unread + rails), Latest (All / Unread + counts).
- [ ] Directory queries: All publications (topic chips, sort, pagination) for Discover.
- [ ] Publication profile query (header, recent writing, readers-also-follow).
- [ ] Article query (content + mark-read on open).
- [ ] Search: publications + articles split.
- [ ] Handle resolution: AT Proto handle/domain → publication preview (for Add modal).

## 6. Discovery engine (network-powered)

- [ ] **Recommended for you** — collaborative filtering over the follow graph (co-subscription).
- [ ] **Followed by people you follow** — social-graph query.
- [ ] **Trending publications / Trending now** — recent activity (new articles + follow velocity, rolling window).
- [ ] **Cold start** fallback to overall popularity when user has no follows.

## 7. UI — port screens to TanStack Start + hip-ui

Build each on hip-ui components + StyleX tokens (no raw HTML/inline styles).

- [ ] App shell: desktop persistent left sidebar; mobile top bar + bottom tab nav; Following list.
- [ ] **Home** — masthead (date + unread count), featured lead, latest unread rows, right rail (Trending + You might follow).
- [ ] **Latest** — chronological list, segmented All/Unread filter with counts.
- [ ] **Discover** — Recommended / Followed-by-people-you-follow / Trending / All (chips, sort, grid⇄list toggle).
- [ ] **Search** — editorial field, live results split into Publications + Articles.
- [ ] **Article** (reading view) — ~680px measure, drop-cap, pull quotes, hero, sticky bar (back/byline/follow/save/share), reading-progress bar, footer pub card + "More from {publication}".
- [ ] **Publication profile** — banner + inline header (avatar/topic/name/desc/stats/Copy DID/Follow), recent writing, right rail (About + DID + readers-also-follow), social proof line.
- [ ] **Add / Follow modal** — Browse / Paste a handle (resolve → preview → follow) / Search tabs.
- [ ] Global follow toggle reflects everywhere instantly (optimistic).
- [ ] Theme tokens / dark mode parity with prototype.

## 8. Routing & state

- [ ] URL-backed routes for home / latest / discover / search / article / publication (TanStack Router).
- [ ] Real back/forward + shareable/deep links.
- [ ] Replace prototype's in-memory view stack.

## 9. v1 polish & QA

- [ ] Loading / empty / error states for all data-backed views.
- [ ] Responsive checks (desktop + mobile breakpoints).
- [ ] Accessibility pass (react-aria props, keyboard nav, focus).
- [ ] Vitest coverage on data-layer + key components.
- [ ] Lint/format/typecheck/build all green.

---

## Later (post-v1)

- [ ] Recommendation / trending tuning and quality.
- [ ] Higher-quality full-text search.
- [ ] Offline / save-for-later.
- [ ] Notifications.
- [ ] Multi-account.

## Non-goals (for now)

- Read-first client: **no** commenting, posting, or authoring publications in-app.

# Standard Reader — App Vision

> A warm, editorial reader for **standard site publications** on the AT Protocol.
> Resembles a classic RSS reader (Goon / Reeder family) but built around _discovery_ —
> helping people find the publications they aren't following yet.

---

## 1. Concept

Standard Reader reads **standard site publications** distributed over the **AT Protocol** (the
network behind Bluesky). Instead of polling RSS/Atom feeds, a "publication" is a set of
signed records in an author-controlled repository, described by a shared lexicon. Any
reader that understands the schema can render any publication — so a **directory of all
known publications is just a query, not a walled garden.**

That property is the whole product thesis:

- **Ownership and reach stop being a tradeoff.** Authors own their repo; readers index it.
- **Discovery is a public good.** Because every publication speaks the same protocol, the
  app can show _every_ publication the network knows about and help you find new ones.

We make the "directory is just a query" idea literal: a **tap instance backfills all
`standard.site` data off the network into a Neon Postgres read-model**, so the app can browse,
rank, and recommend across the _entire_ known network instantly — while the canonical records
still live in each author's (and each reader's) repo.

### Core differentiator

A first-class **Discovery** experience: a browsable directory of every known publication
with recommendations, social proof, trending, and topic browsing — not just a list of
things you already subscribe to.

---

## 2. Audience & platform

- **Audience:** readers who want a calm, text-first home for long-form writing, plus a
  way to keep discovering new voices.
- **Platform:** responsive web — desktop (persistent left sidebar) and mobile (top bar +
  bottom tab nav). Same codebase, same components.

---

## 3. Information architecture

```
Sidebar / bottom-nav
├── Home        — your day: featured lead + latest unread from follows + rails
├── Latest      — full chronological list from your follows (All / Unread filter)
├── Discover    — the directory (THE differentiator)
├── Search      — publications, handles, topics, headlines
└── + Add publication  (modal)

Following list (sidebar) — quick links to followed publications

Detail screens
├── Article (reading view)
└── Publication profile
```

---

## 4. Screens & behaviors

### Home (default landing)

- Masthead with date + unread count.
- **Featured lead** article (full-width), then **Latest unread** rows.
- Right rail: **Trending articles** (ranked compact list) + **You might follow** (recommended pubs).
- "View all latest" → Latest view.

### Latest

- Everything recent from followed pubs, newest first.
- Segmented filter: **All** vs **Unread** with counts.

### Discover (the directory)

Sections, top to bottom:

1. **Recommended for you** — tuned to your follows (horizontal scroll of pub cards).
2. **Followed by people you follow** — social proof.
3. **Trending publications** — most active this week (ranked rows).
4. **All publications** — full directory with:
   - topic chips (All + 8 topics),
   - sort (Readers / Active / A–Z),
   - grid ⇄ list toggle.

### Search

- Big editorial search field; live results split into **Publications** and **Articles**.

### Article (reading view)

- Centered measure (~680px), drop-cap, pull quotes, hero image (if featured).
- Sticky top bar: back, byline, follow, save (bookmark), share; reading-progress bar.
- Footer: publication card + follow; "More from {publication}".
- **Discussion:** Bluesky posts linking the article (external URL or app quote shares), read-only — reply counts link out to bsky threads.
- Opening an article marks it read.

### Publication profile

- Banner + **inline header** (avatar, topic, name, description, stats, Copy DID, Follow).
- Recent writing (featured lead + rows).
- Right rail: About + DID + "Readers also follow".
- Social proof line ("Followed by …") when applicable.

### Add / Follow (modal)

Three tabs:

- **Browse** — popular across the network.
- **Paste a handle** — resolve an AT Proto handle/domain (e.g. `stdout.dev`) → preview card → follow.
- **Search** — search the directory by name/topic.

---

## 5. State model & data ownership

The user's personal state is **owned by the user, cached by us.** Records in repos are the
source of truth; Neon holds a derived view for speed and cross-network querying.

- **Auth:** sign in with **AT Proto / Bluesky OAuth**. Personal state is keyed to the user's
  **DID** and syncs across devices.
- **Subscriptions (follows):** reuse `standard.site`'s `site.standard.graph.subscription` record.
  Toggling follow is global and reflects everywhere (sidebar, cards, feed, profile) instantly; the
  write goes to the user's repo, the cache updates optimistically.
- **Bookmarks:** an `app.standard-reader.bookmark` record per saved article (save toggle in reader).
- **Read / unread:** an `app.standard-reader.read` record per article; opening an article
  marks it read.
- **Routing:** URL-backed routes (TanStack Router) for every view — home / latest / discover /
  search / article / publication — with real back/forward navigation and shareable links.
  _(The original prototype used an in-memory view stack; the port moves to real URLs.)_

### Data shapes (source of truth)

- **From `standard.site` lexicons** (reuse everything we can):
  - `site.standard.publication` — a publication (`url`, `name`, `description`, `icon` blob,
    `basicTheme`, `preferences.showInDiscover`). _In the UI we call these "publications"._
  - `site.standard.document` — an **article** (`site` → publication, `title`, `path`,
    `content`/`textContent`, `coverImage` blob = hero, `tags`, `contributors`, `publishedAt`).
    _"Article" is the product/UI term; the record is a "document"._
  - `site.standard.graph.subscription` — a **subscription** (`publication` at-uri). These are
    standard.site subscriptions, **not** Bluesky follows. _UI term: "follow"._
  - `site.standard.graph.recommend` — a per-document endorsement (`document` at-uri); a signal
    for trending/recommendations.
  - **Author profiles are _not_ a standard.site lexicon** — a publication's author is just its
    repo DID. We backfill identity/profile data (handle, display name, avatar, banner, bio) from
    the AT Proto identity layer + Bluesky `app.bsky.actor.profile`.
  - Note: there's **no** "featured" flag or "topic" in the lexicons — both are app-derived
    (`topic` = a publication's most frequent document tag; Discover chips = top-N topics).
- **App-owned lexicons** under the `app.standard-reader` namespace (JSON in `lexicons/`):
  - `app.standard-reader.bookmark` — a saved article (`subject` = document at-uri).
  - `app.standard-reader.read` — an article marked read (`subject` = document at-uri).

---

## 6. Data & backend architecture

```
AT Proto network (standard.site publications, profiles, follows)
        │
        ▼
   tap instance  ──WebSocket + acks──▶ ingest worker ──backfill / keep-in-sync──▶  Neon Postgres (read-model / cache)
                                                      │  Drizzle ORM
                                                      ▼
                              TanStack Start server functions
                                                      │
                                                      ▼
                                   React UI (hip-ui + StyleX)
   user writes (follow / bookmark / readState) ──▶ user's AT Proto repo
                                                      └─▶ cache updated optimistically
```

- **Ingestion:** a **tap instance** (`bluesky-social/indigo` cmd/tap; see `tap/`) backfills all
  `standard.site` data from the network and keeps it current. A separate ingest worker
  (`pnpm ingest:dev`) connects to tap's acknowledged WebSocket channel, maps records to rows
  idempotently, and expands tap's tracked-repo set along the graph via `/repos/add`. tap + the
  worker are the single ingestion path for both backfill and live sync (locally and in prod); the
  product app server does not process the firehose.
- **Read-model:** **Neon Postgres** in dev/prod (a local Postgres for testing — the DB client in
  `src/db/index.ts` picks the driver from the connection string), managed with **Drizzle**
  (`src/db/schema/`), powers feeds, the
  directory, search (GIN `tsvector`), recommendations, and trending. Derived aggregates
  (`publication_stats`, `publication_cosubscriptions`) are recomputed on a schedule. It is a
  cache — never the source of truth.
- **Writes:** user actions (follow, bookmark, read state) are written as records to the user's repo
  and reflected back into the cache.

### Discovery engine (network-powered)

Recommendations and trending are computed from the indexed social/subscription graph, not
hand-tuned lists:

- **Recommended for you** — collaborative filtering over the follow graph: people who follow the
  pubs _you_ follow also follow these. Subscribing to a publication is a strong taste signal for
  similar publications.
- **Followed by people you follow** — direct social-graph query across your follows' follows.
- **Trending publications / Trending now** — ranked by recent network activity (new articles +
  follow velocity over a rolling window; exact window/weights are tunable).
- **Cold start (no follows yet)** — fall back to high-readership publications
  _outside_ the current trending set so Recommended stays distinct from Trending.

---

## 7. Scope & milestones

### v1 (first milestone)

- AT Proto / Bluesky **OAuth login**.
- Real publications & articles served from the **Neon read-model** (tap backfill).
- **Home, Latest, Discover, Search, Article, Publication** screens ported to TanStack Start + hip-ui.
- **Follows, bookmarks, and read-state** written back as records (and cached).
- **URL-backed routing** for every view.
- Network-powered recommendations & trending (initial heuristics, tunable).

### Later

- Recommendation / trending tuning and quality work.
- Higher-quality full-text search.
- Offline / save-for-later.
- Notifications.
- Multi-account.

### Non-goals (for now)

- A **read-first client**: no in-app posting or authoring publications. Discussion is surfaced read-only from Bluesky (link shares + quote shares); threads open on bsky.

---

## 8. Tech notes

Standard Reader is a **port of an earlier no-build prototype** into this TanStack Start codebase.

### Target stack (this repo)

- **Framework:** TanStack Start + TanStack Router (file-based routing), React 19, Vite.
- **Design system:** hip-ui (copy-and-own, react-aria) in `src/design-system/`.
- **Styling:** StyleX (`@stylexjs/stylex`) with design-system tokens; no Tailwind.
- **Data:** Neon Postgres + Drizzle (`src/db/`), fed by a tap instance; access via server functions.
- **Auth:** AT Proto / Bluesky OAuth.

### Origin prototype (being ported)

- Single-page **React 18 + Babel-in-browser**, no build step.
- Entry `Postcard.html` → `data.js`, `icons.jsx`, `components.jsx`, `views.jsx`,
  `views-detail.jsx`, `app.jsx`, plus `styles.css` + `components.css` and `tweaks-panel.jsx`,
  with a `screens/` reference folder.
- Component scope shared via `window` assignment at the end of each JSX file.
- Theming via CSS custom properties on `:root` / `[data-theme]` — carried over to StyleX tokens.

> **Naming:** working title is **Standard Reader**. Open to alternatives.

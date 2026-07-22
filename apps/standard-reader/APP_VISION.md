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
  bottom tab nav). Same codebase, same components. **Browser extension** (WXT, MV3) as a
  capture + bridge client for save/follow while browsing.

---

## 3. Information architecture

```
Sidebar / bottom-nav
├── Home        — your day: featured lead + latest unread from follows + rails
├── Latest      — chronological list (Unread / Subscriptions / All-network tabs)
├── Saved       — save queue (signed-in only; count badge when non-empty)
├── Discover    — the directory (THE differentiator)
├── Search      — publications, handles, topics, headlines
└── + Add publication  (modal)

Following list (sidebar) — quick links to followed publications

Detail screens
├── Article (reading view)
├── Publication profile
├── Author profile (`/u/$did` — all publications from one DID)
├── Tag directory (`/tag/$tag` — articles and publications for that tag)
└── Reader profile (saved / liked articles)
```

---

## 4. Screens & behaviors

### Home (default landing)

- Masthead with date + unread count.
- **Featured lead** article (full-width), then **Latest unread** rows.
- Right rail: **Trending articles** (ranked compact list) + **You might follow** (recommended pubs).
- "View all latest" → Latest view.

### Latest

- Chronological list, newest first.
- Posts with a `publishedAt` still in the future are hidden from chronological
  feeds (Home latest rows, Latest, publication recents, trending) until that
  time passes; direct article URLs still work.
- Segmented filter with counts: **Unread** (unread docs from subscriptions),
  **Subscriptions** (all docs from subscriptions, the default), and **All**
  (the whole network — discover-eligible publications).
- Signed-out readers see the network-wide **All** list (no tabs) with a
  log-in CTA.

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
- Result cards show **query-aware excerpts** (`ts_headline` snippets with highlighted
  matches in titles and descriptions/bodies).

### Tag directory

- Route `/tag/$tag`; linked from topic chips on article cards, publication cards, and
  article kickers.
- **Articles** tab: chronological feed of indexed, published articles carrying the tag
  (case-insensitive) on discover-eligible publications.
- **Publications** tab: discover-eligible publications with at least one such document,
  with per-publication **tagged-post counts**, Most posts / Readers / Active / A–Z sort,
  and grid ⇄ list toggle.

### Article (reading view)

- Centered measure (~680px), drop-cap, pull quotes, hero image (if featured).
- **Content formats:** first-class renderers for `pub.leaflet.content`, `blog.pckt.content`,
  `app.offprint.content`, and `site.standard.content.markdown`, plus third-party unions
  (HTML-in-record, block-based editors, markdown-in-record). **`at.markpub.markdown`**
  ([Markpub.at](https://markpub.at/)) is fully supported: GFM vs CommonMark flavor,
  declared extensions (LaTeX via KaTeX, YAML front matter), ingest-time `text.textBlob`
  resolution, and facet/lens preprocessing (`baseFormatting` headers/strong/idify,
  `baseBlocks` front matter and horizontal rules). Leaflet image galleries use CSS
  `grid-lanes` where supported with plain CSS Grid fallback elsewhere; Leaflet galleries and
  single-image blocks share the reader lightbox, with image alt text surfaced inside the
  lightbox.
- Sticky top bar: back, byline, follow, like, share; reading-progress bar.
- **Listen (page reader):** a top-bar "Listen" button reads the article aloud
  using on-device TTS (`kokoro-js`, lazy-loaded on first use). It narrates the
  title, description, byline, then body — including embedded Bluesky posts
  (author + content, fetched from the public AppView and inlined at their
  position) and image alt text when the content format provides it. By default
  (**Auto**), voice is inferred from the author's
  name/handle via a tiny on-device zero-shot classifier
  (`@huggingface/transformers`, lazy-loaded); signed-in users can pick a fixed
  Kokoro American English voice from the account menu (with overall quality
  grades from [hexgrad/Kokoro-82M VOICES.md](https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md)).
  A passage can also be played from the selection toolbar
  ("Read from here"). The player lives in the app shell (not the article), so
  playback **persists across navigation**: a single floating action bar —
  modelled on the prototype's `AudioBar` — docks just above the bottom navigation
  on every route, in the same position on desktop and mobile. It shows status +
  elapsed/total time, the article title (linking back to the document), a
  back-15s button, an accent play/pause, a playback-speed menu, a close button,
  and a thin draggable seek track (forward-seek rebases synthesis). The
  article's own sticky chrome keeps its scroll-progress bar. While playing, the
  current word is highlighted in place (CSS Custom Highlight API) and kept in
  view by default — manual scrolling unlocks follow mode until the user taps
  "Follow along" on the player bar. The engine's narration sentences are aligned word-by-word to the
  rendered DOM, then the active word is derived from each sentence's audio
  position by distributing the sentence's duration across its characters (Kokoro
  exposes no per-word timestamps in JS, so this is the standard chunk-duration
  approximation). Speed is applied at synthesis time via Kokoro's `speed` option so it
  stays pitch-preserving (changing speed re-synthesizes from the current
  sentence).
- Footer: publication card + follow; "More from {publication}"; **Related reading** (cross-publication
  articles by shared tags and co-read, plus Margin graph connections — one "Across the network" rail via `getArticleExtras`).
- **Discussion:** Bluesky posts linking the article (external URL, embed media links, and app quote shares), plus direct replies to the author's linked announcement post (`bskyPostRef`), read-only — reply counts link out to bsky threads. The announcement post itself is not listed as a comment. **margin.at** notes (`at.margin.note` / `at.margin.annotation` / `at.margin.highlight`) on the article's canonical URL are merged into the same feed via Constellation backlink discovery; passage-anchored notes render like Bluesky quote posts (blockquote + commentary) and link out to margin.at. **`network.cosmik.card` NOTE cards** (Semble) are merged the same way but link out to the Semble activity page for the bookmarked URL (`semble.so/url?id=…`); cosmik URL bookmarks are excluded from counts. Below Discussion, **Cited in** lists other indexed articles whose body links to this URL (`site.standard.document` / `pub.leaflet.document` facet paths via Constellation). **Across the network → Related reading** merges co-read/tag-related articles with bidirectional `network.cosmik.connection` graph edges (`.target` and `.source` via Constellation; Semble-linked peers appear first with a connection label). Article-card `commentCount` badges use **stale-while-revalidate**: responses return the cached count (0 on first hit) immediately and refresh Constellation totals in the background. `pnpm scan:discussion-sources` probes Constellation `/links/all` across indexed URLs to surface unhandled `collection:path` pairs.
- Opening an article marks it read.
- **Open on original site (preference):** a user-menu toggle (cookie for
  everyone; `user.open_links_externally` when signed in). When on, document
  links across the app open the article's canonical URL on its publication
  site in a new tab (marking it read) instead of the in-app reader, and
  `/a/$did/$rkey` itself redirects to the publication site. Articles without
  a canonical URL fall back to the in-app reader.
- **Reading typography (preference):** settings page + user-menu control for body
  text size, column measure, and body font (serif, sans, or a custom Google Font
  from a searchable catalog). Applied on the article wrapper; cookie for
  everyone; `user.reading_typography` when signed in (`fontSize:measure:bodyFont`
  encoding, with optional `:customFont` when body font is custom).

### Publication profile

- Banner + **inline header** (avatar, topic, name, description, stats, Share, Follow).
- **Share** menu: copy `/p/$did/$rkey` link + compose-to-Bluesky (OG card on `/p/`) +
  **Embed subscribe** (iframe snippet for the publication site — themed button opens
  `/subscribe/$did/$rkey`, OAuth with subscription-only scope, auto-follow, themed success).
  Unsigned-out readers hit `/login/subscribe/$did/$rkey` — a publication-themed
  login page (no Standard Reader chrome, no saved handles) that drives the
  subscription-only OAuth scope and returns to the auto-follow success screen.
- Recent writing (featured lead + rows).
- Right rail: About + DID + "Readers also follow".
- Social proof line ("Followed by …") when applicable — Bluesky accounts you
  follow who also subscribe to or like the publication.
- Owner `@handle` links to the **author profile** (`/u/$did`). **Resume** chip
  (links to sifa.id, loaded after paint) when the owner has a Sifa profile.

### Author profile

- Route `/u/$did` — all `site.standard.publication` records owned by one DID.
- Identity from the read-model `profiles` row (handle, display name, avatar, bio),
  with Bluesky public API + DID-doc fallbacks when fields are missing.
- Header: avatar, display name, `@handle`, linkified bio (URLs + `@handles`,
  preserved newlines), aggregate stats (publications, posts, readers, following,
  likes), a **Resume** chip (links to sifa.id, loaded after paint) when the author
  has an `id.sifa.profile.self` record on their PDS, Share, and "View on Bluesky"
  when a handle is known.
- **All publications** directory (sorted by recent activity); infinite scroll.
- **Subscriptions** — publications they follow (`site.standard.graph.subscription`).
- **Liked articles** — their network likes (`site.standard.graph.recommend`).
- Linked from publication profiles, list pages, and article bylines.

### Reader profile (reading history)

- Signed-in reader's **reading history** (`app.standard-reader.read`), newest first — every
  article opened while signed in.
- Route `/history`; linked from the user menu. Requires auth (redirects to login).

### Reader profile (saved for later)

- Signed-in reader's **save queue** (`app.standard-reader.bookmark`), newest first.
- Route `/saved`; linked from the sidebar (with saved count badge). Requires auth (redirects to login).

### Reader profile (liked articles)

- Signed-in reader's **liked articles** (`site.standard.graph.recommend`), newest first.
- Route `/likes`; linked from the user menu. Requires auth (redirects to login).

### Add / Follow (modal)

Single search field with two modes (detected from input):

- **Browse** — trending publications when the field is empty.
- **Search** — full-text directory search by name or topic.
- **Paste a handle** — when input looks like an AT Proto handle, domain, or DID
  (e.g. `@stdout.dev`, `stdout.dev`), resolve via `resolvePublicationByHandle` →
  preview card(s) → follow (including publications not yet in the index, fetched
  live from the author's PDS).

### ATStore review prompt

- **One-time returning-reader toast** — signed-in readers with an older account see
  a small CTA toast asking whether they like Standard Reader and want to leave an
  ATStore review. Clicking **Review** or dismissing the toast records that the
  prompt was seen so it never shows again for that reader.
- **Review modal** — captures a 1–5 star rating plus optional review text.
- **Progressive auth on create** — the ATStore reviewer scope is **not** part of
  the default Standard Reader login. It is requested only if the reader clicks
  **Create** without already having the ATStore review permission.
- **Separate review OAuth client** — the ATStore review upgrade uses its own
  OAuth client metadata + callback path so the app's default login client
  metadata remains unchanged while the one-off review flow can still request the
  extra ATStore scope.
- **Post-auth completion** — after OAuth returns, the app publishes the ATStore
  review and redirects to a standalone thank-you page with a button back to the
  page where the review flow started.

### Feedback (userinput.app)

- **Feedback board** — bug reports, feature requests, and questions for Standard
  Reader are hosted on [userinput.app](https://userinput.app) as
  `app.userinput.discussion` records in each reader's own AT Protocol repo,
  pinned to a dedicated Standard Reader feedback space. The `/feedback` route
  lists all discussions grouped by tag (Bugs / Feature requests / Questions).
  The read path is two-step: (1) query the constellation AppView
  (`constellation.microcosm.blue`) via `blue.microcosm.links.getBacklinks` for
  backlink _references_ to our space record (source =
  `app.userinput.discussion:space.uri`), then (2) fetch each discussion record
  via `fetchRepoRecordWithFallback` (Slingshot cache → author PDS). Author
  profiles are batch-hydrated via `app.bsky.actor.getProfiles` on the public
  Bluesky API — no local DB mirror (third-party collection, per the read-model
  rules in `AGENTS.md` §3(c)).
- **Submit Feedback button** — a header/sidebar button opens a dialog where the
  reader picks a category (bug / feature / question) and writes a title +
  optional details. On **Create**, the record is written to the reader's repo.
- **Progressive granular scope** — `app.userinput.discussion` and
  `app.userinput.upvote` are **not** part of the default login's permission-set
  tiers (they're third-party lexicons with no permission-sets of their own).
  Instead the default OAuth client metadata advertises granular
  `repo?collection=app.userinput.discussion` and
  `repo?collection=app.userinput.upvote` scopes, and the first **Create** (or
  **Upvote**) triggers a progressive upgrade (`upgradeToUserinputFeedback`)
  that sets `user.userinputFeedbackEnabled = true`, revokes the current
  session, and re-authorizes on the **default** client with **both** userinput
  scopes added to the reader's existing base scopes. A server-stashed
  `feedback_draft` row (or `upvote_draft` row for upvotes) carries the pending
  intent through the OAuth round-trip; the `/feedback/return` landing page
  consumes the draft once and auto-creates the record, then shows a
  thank-you / upvoted / expired / error state.
- **In-app upvoting** — each discussion card's upvote pill is a real button.
  Clicking it writes an `app.userinput.upvote` record to the voter's repo at
  the **same rkey as the subject discussion** (the lexicon uses `key: "any"` so
  each reader holds at most one upvote per discussion — re-upvoting is an
  idempotent replace). The subject strongRef's cid is re-resolved server-side
  at upvote time via Slingshot/PDS so it's fresh. If the reader lacks the
  upvote scope, the upvote intent is stashed as an `upvote_draft` row and the
  same `upgradeToUserinputFeedback` flow runs; `/feedback/return?upvote=<id>`
  consumes it and creates the record. The card optimistically marks the
  discussion as upvoted (and bumps the count by one) immediately, then
  reconciles with the network count on settle.
- **Grant persistence** — mirroring the `collectionsAuthoringEnabled` pattern,
  the `userinputFeedbackEnabled` flag persists the opt-in so subsequent logins
  silently request both userinput scopes again (the `authorize` server fn reads
  both the flag and `hasUserinputFeedbackScope(account.scope)`). Readers only
  grant once.

---

## 5. State model & data ownership

The user's personal state is **owned by the user, cached by us.** Records in repos are the
source of truth; Neon holds a derived view for speed and cross-network querying.

- **Auth:** sign in with **AT Proto / Bluesky OAuth**. Personal state is keyed to the user's
  **DID** and syncs across devices.
- **Subscriptions (follows):** reuse `standard.site`'s `site.standard.graph.subscription` record.
  Toggling follow is global and reflects everywhere (sidebar, cards, feed, profile) instantly; the
  write goes to the user's repo, the cache updates optimistically.
- **Likes:** reuse `standard.site`'s `site.standard.graph.recommend` record per liked article
  (heart toggle in reader).
- **Save for later:** an `app.standard-reader.bookmark` record per saved article; a queue at
  `/saved`, distinct from likes.
- **Read / unread:** an `app.standard-reader.read` record per article; opening an article
  marks it read. **Reading history** at `/history` lists these newest-first.
- **Public by default:** reads, bookmarks, likes, follows, and lists are all public AT Proto
  records in the user's repo (like Bluesky likes or follows). `/history` and `/saved` are
  signed-in convenience views — not privacy boundaries.
- **Track reading history (setting):** on by default; when off, the app does not write
  `app.standard-reader.read` records, hides unread dots/counts/filters, and omits the
  Reading history menu link. Persisted in a cookie (all readers) and on `user.track_reading_history`
  when signed in.
- **Publication lists (sidebar folders):** `app.standard-reader.list` records — a named, ordered,
  shareable list of publications (one level deep; a publication may live in several lists).
  Managed from the sidebar (new-list button in the Subscriptions header; per-list edit modal with
  reorder / remove / add). Every list is also a public page at `/l/$did/$rkey` — like a Bluesky
  user list, but for publications — with a **Share** menu (copy link + compose-to-Bluesky; OG card
  on `/l/`). The page has two tabs: **Articles** (newest-first feed across all member publications,
  paginated) and **Publications** (the ranked member directory). Other readers can **add it to their
  app** via an
  `app.standard-reader.listSave` record (saved lists render as extra sidebar groups). **Saving a
  list acts like following its publications**: feeds, the sidebar, and unread counts operate on
  the reader's _effective_ follow set (subscriptions ∪ saved-list publications, computed in
  `src/server/reader/saved-lists.ts` with a short-TTL per-reader cache) — no individual
  `site.standard.graph.subscription` records are written. Both `list` and `listSave` records are
  **mirrored into Neon** (`lists` + `list_saves` tables) by the tap ingester so the shell snapshot
  never blocks on PDS I/O. A backfill from the PDS runs on first access when no rows exist yet.
- **Routing:** URL-backed routes (TanStack Router) for every view — home / latest / discover /
  search / article / publication — with real back/forward navigation and shareable links.
  _(The original prototype used an in-memory view stack; the port moves to real URLs.)_
- **ATStore review prompt state:** the one-time toast dismissal lives on
  `user.atstore_review_prompt_dismissed`, so once a reader dismisses the prompt
  (or clicks Review) it stays suppressed across devices and sessions.

### OAuth scopes

Sign-in requests granular AT Proto OAuth permission scopes as `include:` references to
**permission-set lexicons** (per [atproto.com/guides/permission-sets](https://atproto.com/guides/permission-sets)).
A permission set can only reference resources under its own NSID namespace, so the design
splits each capability tier across a set we publish (`app.standard-reader.auth*`) and the
upstream `site.standard.auth*` sets (published by standard.site — see
[standard.site/docs/permissions](https://standard.site/docs/permissions/)):

| Tier                                | App-owned set (we publish)                      | site.standard set (we reference)         | Covers                                                                               |
| ----------------------------------- | ----------------------------------------------- | ---------------------------------------- | ------------------------------------------------------------------------------------ |
| **Basic** (default sign-in)         | `include:app.standard-reader.authBasicFeatures` | `include:site.standard.authSocial`       | bookmark, read, list, listSave, labelerSubscription + follows + likes                |
| **Collections authoring** (upgrade) | `+ include:app.standard-reader.authCollections` | swap to `include:site.standard.authFull` | collection, collectionsPublication, publicationTheme + publication + document writes |
| **Subscribe embed**                 | —                                               | `include:site.standard.authSocial`       | subscription write (also covers recommend)                                           |

`blob:*/*` (image upload) is requested as a granular scope alongside the basic tier — it
cannot live inside a permission set. The OAuth client metadata `scope` field declares the
union of all three tiers so any may be requested at authorize time.

**ATStore reviews** use a separate, progressive ATStore reviewer authorization flow.
That external scope is requested only from the review modal's **Create** action and is
never part of the app's default login UX. The upgrade runs through a dedicated
review-only OAuth client metadata/callback path rather than widening the default
client metadata scope. Granted scopes may come back either as `include:` sets or
expanded `repo:` tokens, so permission checks must accept both formats.

**userinput.app feedback** takes a different approach: `app.userinput.discussion`
and `app.userinput.upvote` have no permission-set lexicons, so the default OAuth
client advertises granular `repo?collection=app.userinput.discussion` and
`repo?collection=app.userinput.upvote` scopes alongside the permission-set
tiers. The first **Create** in the feedback dialog (or **Upvote** on a card)
triggers `upgradeToUserinputFeedback`, which re-authorizes on the default
client (not a separate flavor) with both granular scopes appended to the
reader's existing base scopes. The opt-in persists on
`user.userinputFeedbackEnabled` so future logins silently re-request both —
readers only grant once.

**Progressive scope upgrade:** the collections tier is opt-in. When a reader opens
`/collections/new` or `/collections/edit/$rkey` without the collections scope, a shared
`CollectionsUpgradeGate` (`AlertDialog`) prompts them to upgrade. `auth.upgradeToCollections`
sets `user.collectionsAuthoringEnabled = true`, revokes the current OAuth session, and
re-authorizes fresh with the collections tier; the callback returns to the collections editor.

Two signals track the upgrade, with distinct roles:

- **`user.collectionsAuthoringEnabled`** (opt-in flag) — set optimistically in
  `upgradeToCollections` _before_ the re-auth completes. Persists the upgrade so subsequent
  logins silently request the collections tier automatically.
- **`account.scope`** (granted scope, snapshotted on every callback from
  `oauthSession.getTokenInfo().scope`) — the source of truth for "the reader has actually
  accepted the collections tier." `hasCollectionsScope()` in
  `src/integrations/auth/scope.ts` detects the collections tier in either the `include:` set
  form (`include:app.standard-reader.authCollections` + `include:site.standard.authFull`) or
  the PDS-expanded granular `repo?collection=...` form.

Both signals drive the **authorize flow**: on re-login the authorize handler resolves the reader's
DID (from the `did` parameter when threaded from the handle autocomplete, otherwise from the
indexed `profiles.handle` column — covers the saved-handles flow on `/login`, which only stores
`handle`) and reads both the flag and `hasCollectionsScope()` on the existing `account.scope`. If
either is true, the collections tier is requested again so the grant is preserved rather than
silently downgraded to basic. (Without the granted-scope check, a reader who previously granted
the collections tier but whose flag was never set — e.g. they granted via an earlier scope set —
would be downgraded on every re-login.)

The **UI gates** on `account.scope` only (via `hasCollectionsScope()`), not the flag:
`CollectionsUpgradeGate` blocks `/collections/new` and `/collections/edit/$rkey`, and a
`CollectionsUpgradeOverlay` on `/collections` auto-opens for readers with existing collections
but a missing/stale grant (consent revoked on the PDS, flag set but re-auth never completed).
Readers with no collections see the empty state and only hit the dialog when they click
"New series" (intent to author).

Per [OAuth Patterns](https://atproto.com/guides/oauth-patterns): BFF scope upgrades revoke +
re-auth because `prompt: consent` re-consent isn't reliable across PDS providers. See
`src/integrations/auth/scope.ts` and `src/integrations/tanstack-query/api-auth.functions.ts`.

### Data shapes (source of truth)

- **From `standard.site` lexicons** (reuse everything we can):
  - `site.standard.publication` — a publication (`url`, `name`, `description`, `icon` blob,
    `basicTheme`, `preferences.showInDiscover`). _In the UI we call these "publications"._
  - `site.standard.document` — an **article** (`site` → publication at-uri **or** an `https://`
    URL for a "loose document" with no publication record, `title`, `path`, `content`/`textContent`,
    `coverImage` blob = hero, `tags`, `contributors`, `publishedAt`). When `site` is an `https://`
    URL the document is "loose" — `publication_uri` is null and the author is the repo DID (e.g.
    Leaflet-hosted posts). Loose documents surface everywhere publication-bound documents do
    (feeds, Trending, tags, search, author profiles) and byline the author via `/u/$did`.
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
  - `app.standard-reader.read` — an article marked read (`subject` = document at-uri).
  - `app.standard-reader.bookmark` — an article saved for later (`subject` = document at-uri +
    `createdAt`; deterministic rkey via `subjectRkey`).
  - `app.standard-reader.list` — a publication list (`name` + optional `description` + ordered
    `publications` at-uris of `site.standard.publication` records + `createdAt`; tid rkey).
  - `app.standard-reader.listSave` — another reader's list saved into this app (`list` at-uri +
    `createdAt`; deterministic rkey so save/unsave/status address one record).
  - `app.standard-reader.collection` — curated magazine manifest for a
    `site.standard.document` (same rkey sidecar: editorial, colophon, ordered items).
    Editorial body, colophon, and per-item notes are stored as `at.markpub.markdown`.
    The document's `links` array includes an inverse
    `app.standard-reader.collection#documentLink` entry; both records are written
    atomically via `com.atproto.repo.applyWrites` so the URIs are known before publish.
  - `app.standard-reader.collectionsPublication` — marks a
    `site.standard.publication` as a collections series (same rkey sidecar).
    Mirrored into the read-model as `publications.collections_publication`
    (bool) so the `/collections` read path stays DB-only (the tap ingester
    upserts/clears it; write fns eagerly set it for read-after-write
    consistency, with a PDS backfill on cold start).
  - `app.standard-reader.publicationTheme` — Google Font names for a collections
    publication (same rkey sidecar; colors stay on `basicTheme`).

### AppView XRPC (public API)

Third-party AT clients can query the indexed read-model without running tap. Standard Reader
serves **`app.standard-reader.*` query and procedure lexicons** at `/xrpc/...` on
`standard-reader.app`:

- **Public queries (Tier 1–2):** directory, search, feeds, URL resolution — no auth.
- **Personalized reads (Tier 3):** home feed, recommendations, reader-state queues — standard
  AT Proto auth (DPoP + `getSession`, or PDS proxy JWT); Tier 3b accepts optional `did` for
  public reader-state lookups.
- **Write procedures (Tier 4):** follow, like, read, bookmark, list CRUD — auth required; writes
  go to the user's PDS via `com.atproto.repo.*` (same path as the web app).
- **Repo records** (`read`, `bookmark`, `list`, `listSave`) remain in each reader's PDS; the
  AppView indexes them for fast queries but does not own personal state.
- **Service discovery:** `did:web:standard-reader.app` with `#standard_reader_appview` → `/xrpc`;
  `/.well-known/oauth-protected-resource` for OAuth clients.
- **Developer docs:** live API examples at [`/docs/api`](/docs/api); published lexicon schemas at [`/docs/lexicons`](/docs/lexicons).

Implementation: shared handler layer in `src/server/xrpc/handlers/`; TanStack server functions
and extension HTTP routes call the same underlying logic. `/xrpc` uses AT Proto auth only — no
HttpOnly session cookies.

### Labels & moderation (labelers)

Standard Reader speaks the standard AT Proto label protocol, so readers can subscribe to
**labelers** (moderation services) exactly as they would in Bluesky:

- **A labeler is just a DID.** We discover it the standard way — resolve the DID document, find
  its `#atproto_labeler` service, and read its descriptor + label-value definitions. Nothing is
  hardcoded; the first-party `claudeslop` labeler (below) is discovered like any third party.
- **Subscriptions are repo records** (`app.standard-reader.labeler.subscription`, V2; legacy
  `app.standard-reader.labelerSubscription` — nested under the `labeler` NSID group so a single
  `_lexicon.labeler.standard-reader.app` DNS record covers `labeler.defs`, `labeler.service`, and
  `labeler.subscription`). Deterministic rkey per labeler; lives in the reader's own PDS — owned by
  them, mirrored into the read-model. New writes target V2; reads accept both until per-reader
  migration completes (the lazy migration on the labeler write path rewrites old records). Each
  record also carries per-label visibility prefs (`ignore` / `warn`=blur / `hide`).
- **Reading labels** uses `com.atproto.label.queryLabels` against each subscribed labeler; the
  reader sees a badge + content warning on labeled documents per their prefs. Settings →
  Labelers manages subscriptions and per-label toggles, and lists a labeler's labeled documents.
- **claudeslop** is our example labeler: a standalone service (`services/claudeslop/`) that
  consumes Jetstream, scores documents for AI-written prose, signs labels, and serves
  `queryLabels` + `subscribeLabels` — a minimal reference implementation of the labeler API.

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
   user writes (follow / like / readState) ──▶ user's AT Proto repo
                                                      └─▶ cache updated optimistically
```

- **Ingestion:** **tap instances** (`bluesky-social/indigo` cmd/tap; see `tap/`) backfill all
  `standard.site` data from the network and keep it current. The primary tap signals on
  `site.standard.publication` to discover publishers; a second `tap-labeler` instance signals on
  `app.standard-reader.labeler.service`; and a third `tap-docs` instance signals on
  `site.standard.document` so repos that publish "loose documents" (no publication record — e.g.
  Leaflet-hosted) get tracked + backfilled. A separate ingest worker (`pnpm ingest:dev`) connects
  to each tap's acknowledged WebSocket channel, maps records to rows idempotently, and expands
  tap's tracked-repo set along the graph via `/repos/add`. tap + the worker are the single
  ingestion path for both backfill and live sync (locally and in prod); the product app server
  does not process the firehose.
- **Read-model:** **Neon Postgres** in dev/prod (a local Postgres for testing — the DB client in
  `src/db/index.ts` picks the driver from the connection string), managed with **Drizzle**
  (`src/db/schema/`), powers feeds, the
  directory, search (GIN `tsvector`), recommendations, and trending. Derived aggregates
  (`publication_stats`, `publication_cosubscriptions`) are recomputed on a schedule. It is a
  cache — never the source of truth.
- **Writes:** user actions (follow, like, read state) are written as records to the user's repo
  and reflected back into the cache.

### Discovery engine (network-powered)

Recommendations and trending are computed from the indexed social/subscription graph, not
hand-tuned lists:

- **Recommended for you** — collaborative filtering over the follow graph: people who follow the
  pubs _you_ follow also follow these. Subscribing to a publication is a strong taste signal for
  similar publications.
- **Followed by people you follow** — direct social-graph query across your follows' follows.
- **Trending publications / Trending articles** — precomputed on the recompute cron and cached on
  rows (`publication_stats.trending_score`, `documents.trending_score`). Signals: distinct
  in-app recommends (self-recommends excluded), subscriptions, new documents, Constellation Bluesky
  backlink counts + velocity, half-life freshness/decay, and z-score normalization. Articles must be
  published within the last **4 days**, meet a minimum distinct-recommender floor, and pass
  per-publication + per-author diversity caps at read time. Rail reads are cheap indexed queries
  only — no scoring per request.
- **Cold start (no follows yet)** — fall back to high-readership publications
  _outside_ the current trending set so Recommended stays distinct from Trending.

---

## 7. Scope & milestones

### v1 (first milestone)

- AT Proto / Bluesky **OAuth login**.
- Real publications & articles served from the **Neon read-model** (tap backfill).
- **Home, Latest, Discover, Search, Article, Publication** screens ported to TanStack Start + hip-ui.
- **Follows, likes, save-for-later, and read-state** written back as records (and cached).
- **URL-backed routing** for every view.
- Network-powered recommendations & trending (initial heuristics, tunable).

### Later

- Recommendation / trending tuning and quality work.
- Higher-quality full-text search.
- Offline / save-for-later body cache (save queue via `app.standard-reader.bookmark` is shipped).

### Non-goals (for now)

- A **read-first client**: no in-app posting or authoring publications. Discussion is surfaced read-only from Bluesky (link shares + quote shares) and margin.at (web annotations); threads open on bsky or margin.at.

---

## 8. Tech notes

Standard Reader is a **port of an earlier no-build prototype** into this TanStack Start codebase.

### Target stack (this repo)

- **Framework:** TanStack Start + TanStack Router (file-based routing), React 19, Vite.
- **Design system:** hip-ui (copy-and-own, react-aria) in `src/design-system/`.
- **Styling:** StyleX (`@stylexjs/stylex`) with design-system tokens; no Tailwind.
- **Data:** Neon Postgres + Drizzle (`src/db/`), fed by a tap instance; access via server functions
  and the public AppView XRPC surface at `/xrpc/app.standard-reader.*` (see [`/docs/api`](/docs/api) and [`/docs/lexicons`](/docs/lexicons)).
- **Auth:** AT Proto / Bluesky OAuth.
- **Observability:** Server functions emit `observe()` events to Honeycomb; client route transitions
  emit `nav.transition` via `telemetryApi.recordClientEvent`. Shell/sidebar queries use a 5-minute
  stale window and block child navigations only on a cold cache.
- **Browser extension:** pnpm workspace package [`extension/`](extension/) built with WXT + hip-ui
  (shared `#/*` → `src/design-system/`). Auth via HttpOnly session cookie; background worker calls
  `/api/extension/*` on the web app. Surfaces: popup, page overlay, context menu, Bluesky link
  badges (bsky.app and its `social-app` forks — currently also Witchsky and Mu), options page,
  toolbar badge. See [`extension/store/README.md`](extension/store/README.md) for Chrome Web Store
  publish notes.

### Browser extension architecture

```
Web page / bsky.app                Extension (WXT MV3)
        │                                   │
        │  content script (overlay/badges)  │
        │ ───────── sendMessage ──────────► │ background worker
        │                                   │  Cookie: standard-reader-auth.session_token
        │                                   ▼
        │                          TanStack Start /api/extension/*
        │                          (session, resolve, bookmark, follow)
        ▼                                   │
   Neon read-model ◄──── same ingest ───────┘
```

- **Resolve:** canonical URL → document/publication (`src/server/extension/resolve-page-url.server.ts`).
- **Writes:** bookmark + follow reuse existing repo-record + ingest handlers.
- **Login completion:** `/extension/connected` landing tab after OAuth redirect.

### Origin prototype (being ported)

- Single-page **React 18 + Babel-in-browser**, no build step.
- Entry `Postcard.html` → `data.js`, `icons.jsx`, `components.jsx`, `views.jsx`,
  `views-detail.jsx`, `app.jsx`, plus `styles.css` + `components.css` and `tweaks-panel.jsx`,
  with a `screens/` reference folder.
- Component scope shared via `window` assignment at the end of each JSX file.
- Theming via CSS custom properties on `:root` / `[data-theme]` — carried over to StyleX tokens.

> **Naming:** working title is **Standard Reader**. Open to alternatives.

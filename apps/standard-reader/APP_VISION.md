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
  bottom tab nav). The mobile top bar scrolls away with the page and slides back in on any
  scroll up, so reading gets the full screen without losing the way out. Same codebase,
  same components. **Browser extension** (WXT, MV3) as a capture + bridge client for
  save/follow while browsing.

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
    └── "Subscriptions" heading links to /subscriptions (the manage view)

Detail screens
├── Article (reading view)
├── Publication profile
├── Author profile (`/u/$did` — all publications from one DID)
├── Tag directory (`/tag/$tag` — articles and publications for that tag)
├── Subscriptions (`/subscriptions` — manage everything you follow)
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
- **Articles** tab: indexed, published articles carrying the tag (case-insensitive) on
  discover-eligible publications, with a **Recent / Trending / Most popular** sort select
  sitting in the tab row. Trending ranks by the precomputed `documents.trending_score`;
  Most popular ranks by all-time likes then Bluesky backlinks. Both rank rather than
  filter — score ties fall back to newest-first, so the list stays paginable on a
  low-traffic tag.
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
  `baseBlocks` front matter and horizontal rules). **`site.mochott.article`**
  ([mochott](https://mochott.site)) is fully supported: mochott's `site.standard.document` carries no
  body at all — it lives in a `site.mochott.article` at the same rkey — so that collection is
  delivered by the tap and indexed onto the document row as its content (sidecar-style, like
  `app.standard-reader.collection`, with a repo fetch as the catch-up path), then rendered from its
  TipTap tree by `renderer-core`.
  Leaflet's `pub.leaflet.blocks.html` — the author's own HTML — renders in a
  sandboxed `srcdoc` iframe at the height the block asks for, matching what the lexicon
  specifies. The sandbox grants scripts only: `allow-same-origin` on a `srcdoc` frame would
  run the author's markup in the reader's own origin.
  Leaflet image galleries use CSS
  `grid-lanes` where supported with plain CSS Grid fallback elsewhere. Every rendered image in
  a document body — Leaflet galleries and single-image blocks, PCKT image and gallery blocks,
  structured image grids/carousels, and markdown images — opens the shared reader lightbox, with
  image alt text surfaced inside the lightbox and prev/next navigation across a gallery's images.
  Magazine editions are the one exception: they bind their own lightbox to the rendered `<img>`
  elements.
- **Bluesky web-client links resolve to their records.** `bsky.app` and the clients forked from
  its `social-app` codebase — Witchsky, Mu, deer.social, Blacksky — share one URL grammar and
  address the same AT Protocol records, so a link to any of them is a link to the _record_, not
  to a third-party page. **Embeds are branded with the client the link came from** — its name beside
  the record kind, and its own `theme-color` run through the same Radix scale generator the
  magazine palette uses, so the border tint and brand text stay contrast-safe in light and dark
  (never the raw hex). A client with no published brand color is branded by name only. The
  client table lives in
  [`lib/atproto/bsky-clients.ts`](src/lib/atproto/bsky-clients.ts) and is shared with the
  extension's manifest generation; adding a fork there lights it up everywhere at once. Inline
  profile links become mention chips routed to `/u/$did`; a link-card block (Leaflet
  `website`, PCKT `website`, ProseMirror `embed`) whose target is a post becomes a native post
  embed, and a profile / feed / list / starter-pack link becomes an entity card hydrated from
  the public AppView. When a record can't be resolved — deleted, blocked, AppView down — the
  ordinary link card stands in, so a dead reference never leaves a hole in the article.
- Sticky top bar: back, byline, follow, like, share; reading-progress bar. On mobile it
  pins below the shell's top bar whenever that one is revealed, so the two stack instead
  of overlapping.
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

- **Appearance (preference):** the theme control is light / dark / system /
  **custom**. `custom` opens a palette picker: eight curated pairs — a Radix
  accent with the gray Radix pairs it with (Almanac, Meadow, Press, Ink in light;
  Almanac Night, Archive, Tide, Ember in dark) — plus the reader's own accent +
  paper. A palette states its own scheme rather than following the OS: the paper
  color decides light vs dark, and the shell pins `color-scheme` to it (which is
  also what resolves `light-dark()` inside the Radix scales). Curated palettes are
  static `createTheme`s over the vendored scales; the reader's own two colors go
  through the same generator that paints publication themes, under an `--sr-*`
  prefix, so ink, borders and every step in between are derived rather than asked
  for. One deliberate difference from the publication path: a reader's stated
  accent is **never substituted**. A publication whose accent can't clear 3:1
  against its page gets that accent replaced by the page's ink, so a stranger's
  site can't grey out our chrome; a reader theming their own app keeps exactly
  the color they picked (choosing a primary color and being handed grey is a
  worse answer), and the panel scores the generated ramp and warns instead.

  Alongside the palette, four dials that apply in **every** theme mode because
  none of them is color: interface font (editorial / sans / any Google family),
  text size (XS–XL, 13→22px of interface text, in even ~10–20% steps so no one
  step reads as a jump), roundness (sharp / soft /
  default), and density (compact / default / relaxed). Text size scales the **root
  font size**, so every rem in the app follows it — type, spacing, radii, control
  boxes, the sidebar and the content shells — rather than only the tokens we
  remembered to route through a multiplier; breakpoints are unaffected, since
  media queries resolve against the initial font size. Roundness and density are
  multipliers on the radius and spacing token scales, applied on the **root
  element** — the semantic scales are declared as `--gap-md: var(--spacing-2)` at
  `:root`, and a custom property resolves on the element that declares it, so an
  override further down the tree moves padding that reads a spacing token
  directly while every gap keeps the value it already computed. Density
  deliberately stops
  at the spacing _between_ things and leaves control geometry alone, because a
  scale that stretched a switch's track but not its height distorts it. So a
  single setting moves the chrome _and_ the article body — the Reading controls
  above then override the article on top of that baseline. Cookie for everyone;
  `user.appearance` when signed in (`null` = all defaults), seeded through
  `getShellBootstrap` so the first paint is already themed.

- **Use publication themes (preference):** settings-page toggle (Appearance) that
  repaints `/p/$did/$rkey` and `/a/$did/$rkey` in the publication's own
  `site.standard.theme.basic` colors. The four flat colors are expanded into full
  light + dark UI/accent scales (`publicationThemeScaleVars`) that the
  `publicationUi` / `publicationPrimary` StyleX themes read to override the
  design-system `uiColor` / `primaryColor` tokens — the same machinery the themed
  subscribe login already used. A route opts in by returning `publicationTheme`
  from its loader; the app shell reads it off the deepest match and wraps the
  content column **and the site footer**, so the publication's colors run to the
  bottom of the page. The sidebar and mobile bar stay Standard Reader chrome.
  Signed-in only (`user.use_publication_theme`, `null` = off); publications with
  no colors of their own always keep the editorial theme.

- **Feed presentation (preferences):** two settings-page dials under **Feed**,
  both signed-in only and both seeded through `getShellBootstrap` so the first
  paint is already correct. **Hide recommend and comment counts**
  (`user.hide_feed_metrics`, `null` = shown) suppresses the engagement tallies
  wherever they read as a metric — article cards, result rows, the article
  byline, mention hover cards, and the count on the end-of-article Recommend
  button. The Recommend action itself is never hidden; the number is. The gate
  lives in `LikeCount` / `CommentCount` / `ArticleEngagement`
  (`#/components/reader/primitives`), and every call site that draws a separator
  dot around them reads the same `useFeedMetricsVisible()` so the dot leaves with
  the counts. **Loading more** (`user.feed_pagination`, `null` = `infinite`)
  chooses between infinite scroll and an explicit **Load more** button. Every
  paginated list in the app renders one shared `FeedLoadMore`
  (`#/components/reader/feed-load-more`) in place of a bare sentinel `div`: in
  `infinite` mode it is the IntersectionObserver probe, in `button` mode it is
  the button and nothing is observed. Call sites keep their own loading and
  end-of-list markup.
- **Publisher-native themes.** `site.standard.theme.basic` is the interop
  baseline (four opaque colors, light only), but records also carry the
  publishing platform's own theme under `theme`, discriminated by `$type`.
  Ingest keeps it in `publications.theme_json` as `nativeTheme`, and
  `resolvePublicationTheme` (`#/lib/publication-theme-source`) narrows it:
  **Leaflet** (`pub.leaflet.publication#theme`) paints a page over a canvas, so
  `pageBackground` composited over `backgroundColor` — not `basicTheme.background`,
  which mirrors the canvas — is the surface the reader actually sees;
  **PCKT** (`blog.pckt.theme`) and **Offprint** (`app.offprint.theme`, a
  DaisyUI-shaped `base100`/`baseContent`/`primary` palette whose `colorScheme`
  says which mode it is) can supply a real **dark** palette, which we use verbatim
  instead of deriving one by darkening their light colors. Unknown `$type`s fall
  back to `basicTheme`, so a new platform degrades rather than losing its colors.
  Publishers who state **neutral scale steps** (Offprint `base200`/`base300`,
  PCKT `surfaceHover`) get them pinned onto the matching token — `component1`,
  `component2`, `border1` — with the steps between anchors interpolated, instead
  of the whole ramp being derived by darkening the background. A theme states one
  background, so it is **routed to the mode its own luminance matches** — a dark
  publication supplies the dark page, and the mode they didn't author is
  **synthesized by mirroring their colour through OKLCH** (`invertLightness`):
  hue preserved, lightness moved to the other end (0.975 / 0.17, matching the
  app's own editorial backgrounds), chroma damped because the same chroma reads
  far more saturated at high lightness. A warm near-black page becomes warm cream
  rather than generic near-white, and the ink is mirrored from their text colour
  instead of dropping to flat black. Without this routing, a dark background
  painted a dark page for a reader in light mode _and_ produced a ramp derived by
  darkening near-black, collapsing every step into the same colour. **Fonts** are read
  the same way (`#/lib/publication-fonts`): each platform's key format is resolved
  against the Google Fonts catalog by normalized key, loaded via a scoped
  stylesheet link, and layered over the editorial stack so anything that doesn't
  resolve leaves the reader's own typography in place. Overlays (hover cards,
  menus, dialogs) are re-pointed into the themed container with react-aria's
  `UNSAFE_PortalProvider` so they inherit the palette instead of portalling to
  `document.body` and reverting to app tokens.

### Serial publications (books & comics)

A publisher who sets `preferences.prevNextDirection = "ltr"` on their
`site.standard.publication` is saying the publication **reads forwards from its first post**
rather than newest-first — a serial. That one flag is the whole signal; the lexicon has no
field for what _kind_ of serial it is, so the kind is app-derived (`recomputeSerialKinds`, in
the hourly sweep): a publication whose recent posts each render at least one image and carry
only a short note of prose is a **comic**, anything else a **book**. Both are mirrored on the
read-model row (`publications.prev_next_direction`, `publications.serial_kind`) and travel to
the UI as `PublicationCard.serial` (see `#/lib/publication/serial`).

Both are filled **on demand** as well as by the sweep. The tap only writes
`prev_next_direction` when a publication record is created or updated, so a publication indexed
before the column existed would stay dark until its author happened to edit it. A NULL there
therefore means "never mirrored", not "ordinary blog" — `upsertPublication` stores the lexicon
default `"rtl"` for a record that states nothing, which is what keeps the two apart — and
`ensurePublicationSerial` (`#/server/reader/series`) reads the record from the PDS once, writes
what it says, and derives the kind on the spot if it turns out to be a serial. Standard
`backfillXFromRepo` behaviour: one PDS read per publication, ever, then the DB serves it.

**Both columns count as unresolved, not just the direction** (`needsSerialResolution`,
`#/lib/publication/serial`). A row reading `"ltr"` with no `serial_kind` is a serial the sweep
hasn't judged yet, and `resolveSerialPublication` renders it as a **book** — the right thing to
draw, and the wrong thing to stop asking about, because everything a comic gets hangs off
`serial.kind`: the shelf of covers, the redirect into the page-flip reader. The two read paths
that surface those (`selectPublicationHeader` and `getArticle`) resolve on demand whenever either
column is missing, so a comic can't sit reading as a book until the next hourly sweep. An ordinary
blog (`"rtl"`) is resolved whatever its kind says, which keeps this off the common path.
`pnpm backfill:serial` warms them all up front so no reader pays that first read. It scopes itself
to the publications that could answer — `prevNextDirection` is Leaflet's field, so only Leaflet
publications still holding a NULL are visited — reads their records from Slingshot rather than
resolving and paging each publisher's PDS, and writes back one bulk `UPDATE` per direction instead
of re-upserting whole rows to set one column.

What changes for a serial:

- **The archive still leads with the latest post.** A serial reads forwards, but its archive is
  read far more often to see what is new than to find where the work begins, so every
  publication — serial or not — lists newest-first (`defaultArchiveOrder`,
  `#/lib/publication/archive-order`). A reader who does want to start at the beginning flips it
  from the publication menu; the override is a per-publication cookie, resolved server-side
  inside `getPublicationDocuments`, so the client never has to know the order to ask for the
  right page and the SSR'd HTML is already in it.
- **A comic's archive is a shelf of covers, not a list of pages.** A comic posts one page per
  document, so its archive is dozens of near-identical rows — `FITV #1 Cover`, `FITV #1, Pg. 1`.
  Titles almost always carry series, issue and page, so `selectComicShelf`
  (`#/server/reader/comic`) parses the issue number out of them (`#/lib/comic/issue-title`),
  collapses consecutive pages back into the issues they came from, and shows each issue's cover
  art — the reader browses issues instead of scrolling pages. It is a naming convention, not a
  lexicon field, so it is treated as a guess: fewer than 70% of titles parsing, or everything
  landing in one group, leaves `grouped: false` and the ordinary archive list stands. The
  read/unread filters keep the list too — those are per-page views, and a shelf shows whole
  issues.
- **An issue is unread while any of its pages is**, and its cover opens on the first page the
  reader hasn't seen. Read state is per document, and a comic's documents are its pages, so the
  shelf asks for the reader's unread URIs across the whole publication (`selectUnreadDocumentUris`
  — the same query the archive's unread filter and "mark all as read" run) and hands each issue
  the pages it still owes them. The cover wears the ordinary unread dot and links to
  `?page=<first unread>`, so picking a comic back up is one click from the shelf rather than a
  hunt through the page counter. `read` records reach the read model through the firehose, so a
  reader who has just walked those pages is ahead of the server: the shelf's answer is corrected
  in the client from the same read caches every other unread dot uses
  (`#/lib/comic/shelf-progress`).
- **Comics open in the comic reader** (`/comic/$did/$rkey`) — a fixed dark theater that flips
  through the issue's pages one at a time. The pages _are_ the images the body renders, in
  reading order (`#/lib/document/images`), so nothing is authored specially for it. Arrow keys /
  space / Page keys, `Home` / `End`, tap-zones and swipe all page; the current page lives in the
  URL (page turns replace the history entry, so Back leaves the reader). Past the last page is
  an end card with the next issue. The floating chrome **stays until the reader turns their first
  page** — on arrival the bars are the introduction, and a countdown running under it takes that
  away from anyone reading at their own pace — and only then starts stepping aside on an idle beat. The article route redirects a comic issue here unless
  `?view=reader` — which is also the "Read the notes" escape, because a comic's prose commentary
  belongs to the reading view, not the theater.
  The top bar carries a **full-screen toggle** (`f`, or the button at its end) that puts the
  theater itself full screen, so the browser's own furniture leaves the art alone
  (`#/components/comic/use-fullscreen`). The button appears only where the browser says it will
  actually do it (`fullscreenEnabled`, either spelling), which on **iPhone is never**: iOS reserves
  full screen for `<video>`, WebKit's bug for element full screen (206854) has been open since
  2020, the prefixed request was closed `WONTFIX` in favour of it, and the Safari 27 beta still
  doesn't have it. An inert button there reads as a broken reader rather than as a platform limit,
  so it is dropped — the iPhone answer to full screen is the home-screen install the app already
  supports (`display: standalone`, `apple-mobile-web-app-capable`, `viewport-fit=cover`, which is
  why the theater's bars pad with `env(safe-area-inset-*)`). None of this is iPhone-specific in the
  code: the flag also covers an iframe without `allowfullscreen`, and when Safari ships the API the
  control appears with no release from us. The WebKit-prefixed spelling is tried when the standard
  one is absent (iPadOS below 16.4), and the icon's state follows `fullscreenchange`, since Escape,
  F11 and the OS all exit without asking the app.
- **A page's note reads over the page.** Comic posts often publish a line or two beside the art —
  a caption, a process note, a word about next week — and in the theater that writing had nowhere
  to go but the reading view, a navigation away from the page it was written about. The top bar's
  note button lays it over the art instead (`#/components/comic/comic-page-note`): a translucent
  dark scrim, the prose in the theater's own type, and a "Read the full post" escape to the
  reading view. The note travels on the page (`ComicPage.note`), extracted in the chunk query that
  already opens the body, and is the body's plaintext **minus the pages' own alt text** — the
  extractors narrate image blocks by their alt, which describes the page the reader is already
  looking at (`#/lib/comic/page-note`). Most pages carry none, so the control is disabled rather
  than absent: a bar that reshuffled on every page turn is worse than a quiet button. The overlay
  is a React Aria modal portalled **into the theater**, not `document.body`, so it survives full
  screen.
- **Books get "Up next"** under the article: the following chapter, or a note that the reader has
  caught up. Position ("3 of 12") and neighbours come from `getSeriesContext`
  (`#/server/reader/series`), loaded client-side after the article paints like the other
  below-the-fold rails. "Next" here means the chronologically _later_ post — the opposite of an
  ordinary blog's prev/next, which walks backwards into the archive.

Misclassification is never a trap: the comic reader always links to the reading view, and a
comic issue with no pages falls back to it outright.

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

### Subscriptions (manage view)

- Route `/subscriptions`, reached from the sidebar's "Subscriptions" heading. Requires auth
  (redirects to login).
- One **sortable, multi-selectable table** of everything the reader follows — publications
  (`site.standard.graph.subscription`) _and_ people (`app.standard-reader.graph.follow`) in a
  single list, matching how the sidebar groups them. A sortable `Type` column is how you group
  the table by kind.
- Columns: Name (avatar + handle), Type, Unread, Last post, Articles, Followers, Topic, and the
  reader's own Lists the subject belongs to. Every column sorts; rows missing a value for the
  sorted column always sink to the bottom rather than reading as "smallest". Client-side filter
  by name / handle / topic.
- **Bulk actions on a selection**: add to one of the reader's lists, or unsubscribe/unfollow
  (confirmation names both counts, since unfollowing a person also tears down the subscriptions
  that follow created). The selection controls take the result count's place in the filter row
  rather than adding a bar, so selecting never shifts the table under the cursor. Deliberately
  **no bulk mark-as-read** — one selection could mean thousands of `read` records written to the
  reader's repo; `/latest` owns marking things read.
- **Data**: rows come free from the shell's `["feed", "sidebar"]` cache plus `["reader",
"lists"]`. The page's only added query is per-person publishing stats
  (`subscriptions.getPeopleStats` — grouped aggregates over `documents` and `user_follows`),
  kept out of `loadSidebarData` so the cost lands on the page that needs it.
- **Virtualized** (react-aria `Virtualizer` + `TableLayout`) against the _page_ scroll, not an
  inner scrollport — the reader keeps one scrollbar, and a 200-subscription library renders ~25
  rows. Row heights are **fixed**, not measured: rows are uniform (both text lines are
  single-line-with-ellipsis, so height comes from tokened line-heights), and skipping
  react-aria's per-row `ResizeObserver` roughly halves the main-thread cost of a fast scroll.
- **Responsive**: four column tiers sized to what the content column actually gets (the desktop
  sidebar takes 264px of it). The narrowest tier keeps one column: name and handle lead, the
  last-post date and unread count move to the row's trailing edge, and the columns it drops
  stay sortable through a sort control in the toolbar.

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

### Reader guide (`/guide`)

The **non-technical** documentation, deliberately separate from the developer docs at
`/docs/*`. Eight task-shaped pages under `/guide` — Welcome, Getting started, Reading an
article, Finding things to read, Keeping track, Making it yours, Beyond the app, Your account
and data — written for someone who only wants to read, with no AT Protocol vocabulary and
every feature named the way the UI names it.

- **Own route tree.** `src/routes/_guide-layout.tsx` + `_guide-layout.guide.*.tsx`, with its
  own topbar (`GuideTopbar`) tagged "Reader guide". It reuses the docs shell's layout and
  prose styles (`docsStyles`) and scroll-spy so both doc sets share one rhythm, but it never
  renders `DOCS_AREAS` — the developer docs are a sibling, reachable from a cross-link in
  each topbar, not a section of the guide.
- **One source of truth for structure.** `src/lib/guide/navigation.ts` declares the pages
  (`GUIDE_AREAS`) and every heading on them (`GUIDE_SECTIONS`). The sidebar, the "On this
  page" rail, the mobile jump select, the scroll-spy, and the prev/next footer all read it,
  so a page cannot drift from its own table of contents.
- **Screenshots are generated, not pasted.** `src/lib/guide/screenshots.ts` declares every
  picture (route, auth mode, viewport, light/dark, optional pre-capture interactions);
  `pnpm guide:shots` (`screenshots.config.ts` + `screenshots/capture.spec.ts`) drives a real
  browser through the list and writes `public/guide/*.png`. Captures wait on the same
  `aria-busy` ready signal the perf suite measures against, and signed-in shots reuse the perf
  suite's session bootstrap. `<GuideFigure>` reads the same manifest for the image's intrinsic
  size, requires alt text, and degrades to its caption when a shot has not been captured yet.
- **Discoverable.** Linked from the site footer, the signed-in account menu, the About page,
  and the developer docs topbar. Every guide page ends with a link to `/feedback`.

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
- **Sidebar personalization:** `app.standard-reader.sidebarPref` — a per-reader singleton (rkey
  `self`, mirrored into `sidebar_prefs`) holding collapsed groups (`collapsed`), the sort mode
  (`subscriptionSort`), the reader's manual top-level tree arrangement (`treeOrder` — list-group
  at-uris interleaved with ungrouped publication at-uris / person DIDs; supersedes the legacy
  `listOrder`-only field, kept as a fallback for readers who haven't touched the tree yet), and —
  via the **Customize sidebar** toggle in Settings — which primary nav items are hidden
  (`customizeNav` gates the `hiddenNav` id set). The customizable items are the top nav links only
  (Home, Latest, Saved for later, Collections, Discover, Search); Subscriptions and its list groups
  are never hideable. When the toggle is off, every nav item shows regardless of `hiddenNav`.
  Hidden items drop from both the desktop sidebar and the mobile bottom-nav.
- **Subscriptions tree (desktop sidebar + mobile sheet):** the sidebar's Subscriptions section is one
  drag-and-drop tree, one level deep, built directly on react-aria-components' headless
  `Tree`/`TreeItem`/`TreeItemContent` + `useDragAndDrop` — not the `design-system/tree` wrapper,
  since its level-based indent/chevron-spacer styling would change the sidebar's existing flush
  row look — rather than a separate flat list plus list-group sections. List groups and ungrouped
  publications/people are siblings at the top level; each list's own members are its children,
  rendered with the same row style regardless of nesting depth (no indent — both the group header
  row and a member row use the identical `columnGap` after the drag handle, so a nested member's
  avatar and its group's name start at the same x-position). The header's overflow menu (`⋮`)
  holds a **Sort** submenu (**Default** — the reader's manual `treeOrder` arrangement, or
  natural/stored order, untouched, and the actual default value; **Recent activity** —
  publications (`lastDocumentAt`) and people (`followedAt`) genuinely interleaved into one
  combined most-recent-first ranking; **A–Z**; **Most unread** — same interleaving, ranked by name
  / unread count, applied to both a list group's own members and the groups themselves), plus a
  **Reorder subscriptions…** toggle, **New list**, and **Collapse/Expand all**. Dragging is never
  implicitly on: **Reorder subscriptions…** is a local (unpersisted) toggle the reader must
  explicitly turn on — it relabels to **Done reordering** while active, and the overflow trigger
  itself swaps from the settings gear to a checkmark (pressing it directly exits reorder mode) —
  and it's disabled (and auto-reset off) whenever sort isn't **Default**, since an automatic sort
  computes its own arrangement and a drag wouldn't stick. Drag handles only render while reordering
  is genuinely on: react-aria-components' own per-item `allowsDragging` render prop reflects only
  whether drag hooks exist at all, not `useDragAndDrop`'s `isDisabled`, so the tree computes its
  own `dragEnabled` flag instead of trusting that prop. While reordering is on, dragging in the
  tree supports every rearrangement: reorder lists, reorder members within a list, move a member
  between two lists, move a member into or out of a list, and reorder members relative to lists at
  the top level — persisted via `treeOrder` (for top-level position) and a `setListMembers`
  mutation (full publications/users array replace, for a list's own membership/order), with a
  custom drag preview pill, a drop-target line indicator between rows, and a highlighted list row
  while it's a valid "drop into" target (`useDragAndDrop`'s `renderDragPreview` /
  `renderDropIndicator` / the `data-drop-target` attribute react-aria-components sets on the
  target `TreeItem`). Cross-kind (publication vs. person) order **within** one list isn't
  separately persisted — each kind keeps its own relative order, the same limitation
  `ListEditModal`'s member editor already has. Saved lists (owned by another reader) are read-only
  containers in the tree — only their own top-level position is draggable, not their membership.
  Mobile's `SubscriptionsSheet` drawer has the same tree, sort, and reorder capability as the
  desktop sidebar — the tree's data-building (`useSubscriptionsTree`) and rendering
  (`SubscriptionsTree`) are shared code, not a reimplementation: the desktop sidebar computes the
  tree once and passes the same `topNodes`/`groupNodes`/`dragAndDropHooks` down to the sheet, which
  mounts its own `<Tree>` from that identical data/config (react-aria's `dragAndDropHooks` is a
  stateless hook-factory bag, so it's safe for two separate `<Tree>` instances to share one), and
  `reorderMode` itself is one shared, unpersisted toggle in `AppShell` rather than a per-surface
  copy — only one of the two `<Tree>` mounts is ever visible/interactive at a given viewport width.
  The old accordion-style `Disclosure` list groups and flat publication/person rows the sheet used
  before are gone. The fully-sortable `/subscriptions` directory table is unaffected.
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
    `basicTheme`, `preferences.showInDiscover`, `preferences.prevNextDirection`). _In the UI we
    call these "publications"._ `prevNextDirection` is the publisher's prev/next reading
    direction: the lexicon default `"rtl"` is an ordinary reverse-chronological blog, while
    `"ltr"` declares that the publication **reads forwards from its first post** — a serial.
    See "Serial publications (books & comics)" below.
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
    (`topic` = a publication's most frequent document tag; Discover chips = top-N topics). A
    serial's **kind** (comic vs book) is app-derived the same way — the lexicon says a
    publication reads forwards, not what it is.
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

**Credential shapes the AppView accepts.** `Authorization` is validated one of two ways
(`src/server/xrpc/auth.ts`); the in-app MCP server is a third, in-process path (`via: "internal"`)
that presents no credential to itself at all:

- **PDS service proxy** (`atproto-proxy: did:web:standard-reader.app#standard_reader_appview`) —
  the PDS mints a service JWT signed by the reader's repo key. Best for reads. It cannot serve
  writes: a service JWT gives the AppView the reader's identity but no credential to write to
  their repo with, so Tier 4 procedures reject it.
- **Direct token** (`Authorization: Bearer|DPoP <token>`) — the AppView forwards the token to
  `com.atproto.server.getSession` on the issuer PDS. Because it cannot forge a DPoP proof, this
  only authenticates **bearer** tokens, i.e. app-password sessions. `getSession` omits `scopes`
  for those (the token grants unrestricted repo access), which the scope check treats as
  "nothing to enforce" rather than "no scopes granted".

So a third-party CLI or agent that needs writes authenticates with an app password; a browser
app that holds its own DPoP key uses OAuth and talks to the PDS directly.

### Remote MCP server (`/mcp`)

`standard-reader.app/mcp` is a [Model Context Protocol](https://modelcontextprotocol.io) server,
so any MCP client (Claude, Cursor, …) can search and read the network and act on a reader's
behalf — bookmark, like, follow, mark read, curate lists. It is a route on the web service, not a
package a user installs: they paste the URL into their client and authorize it.

- **In-process, not over HTTP to ourselves.** Tools resolve the method in the same
  `XRPC_REGISTRY` that `/xrpc` dispatches through and call its handler directly
  (`src/server/mcp/xrpc.ts`). Same handlers, same read-model context, same auth rules — one less
  network hop, and no token to mint for ourselves.
- **~50 methods → 15 tools.** Grouped by intent, not endpoint (`search`, `resolve`,
  `get_article`, `get_publication`, `get_author`, `get_feed`, `get_lists`, `get_library`,
  `get_status`, `bookmark`, `like`, `mark_read`, `follow`, `manage_list`, `whoami`). A model picks
  better from a short list of intents than a long list of endpoints. Labeler endpoints are
  deliberately excluded — moderation config belongs in settings, not a tool list.
- **Stateless transport.** `WebStandardStreamableHTTPServerTransport` with no session id and
  buffered JSON replies, built per request. Identity lives in the presented token, so any instance
  behind the load balancer can serve any request.
- **Responses are trimmed** (renderable body, search markup) unless explicitly requested, and
  AT-URI / DID arguments are validated before they reach a handler.

#### MCP OAuth (`src/server/mcp/oauth/`)

Standard Reader is its own OAuth 2.1 **authorization server for MCP clients**. It is not an AT
Protocol authorization server — the reader's PDS stays that. What it issues are tokens that let a
client act _through_ Standard Reader as a reader who already signed in here.

- **Discovery.** An unauthenticated `POST /mcp` answers `401` with
  `WWW-Authenticate: … resource_metadata="…/.well-known/oauth-protected-resource/mcp"`. That
  document (RFC 9728) points at the authorization server, whose metadata (RFC 8414) lives at
  `/.well-known/oauth-authorization-server`.
- **Registration is open** (RFC 7591, `POST /api/mcp/register`) — that is what makes "paste the
  URL into your client" work. It grants nothing on its own: every token still needs a reader to
  sign in and approve that specific client at `/mcp/authorize`.
- **PKCE `S256` is mandatory**, public and confidential clients alike; there is no implicit flow.
  Redirect URIs are exact-matched against what the client registered, and `resource` (RFC 8707)
  must name this MCP server, so a token minted for someone else's server can't be replayed here.
- **Two scopes**, shown in plain language on the consent screen: `mcp:read` (the reader's library
  and anything public) and `mcp:write` (bookmark, like, follow, read state, lists).
- **Secrets are only ever stored hashed** — client secrets, authorization codes, access and
  refresh tokens are all SHA-256 and looked up by hash. Codes are deleted as they are read and
  refresh tokens rotate, so a replay finds nothing.
- **Acting for the reader.** A validated token resolves to a `user` row; the tools then restore
  that reader's own AT Proto OAuth session (`restoreAuthenticatedClient`) and pass it to the XRPC
  handlers as `via: "internal"`. Writes go to the reader's own repo with their own grant, so the
  PDS remains the authority on what they actually permitted. If their session has lapsed, tools
  say so and point them at signing in again rather than failing opaquely.
- **Readers stay in control.** Settings → Connected apps lists every live grant — which client,
  whether it can write, when it was last used — with a Disconnect button that revokes the grant
  and every token descended from it.

### Rate limiting

Both public HTTP surfaces are throttled from one policy module
(`src/server/rate-limit-policy.ts`), so the budgets live in one place and read as a set:

- **`/xrpc`** — a coarse per-IP guard runs _before_ any work, because authenticating a request
  costs a `getSession` round trip to the issuer PDS; then a per-caller budget keyed on the
  authenticated DID (falling back to IP), with procedures an order of magnitude tighter than
  queries because each one fans out to the caller's PDS.
- **`/mcp`** — per-IP before the token lookup, then per-grant, so one connector can't spend
  another reader's budget by sharing an egress address.
- **OAuth endpoints** — token and revocation per IP; dynamic registration tightest of all, being
  unauthenticated by design and a row write per call.

Every response carries `RateLimit-*`; 429s add `Retry-After`, and both are CORS-exposed so browser
clients can pace themselves rather than discovering the ceiling by hitting it. The limiter is
in-memory per replica (`src/server/rate-limit.ts`) — with N replicas the effective ceiling is N×,
which is fine for abuse control and avoids putting a shared counter on every request.

### Labels & moderation (labelers)

Standard Reader speaks the standard AT Proto label protocol, so readers can subscribe to
**labelers** (moderation services) exactly as they would in Bluesky:

- **A labeler is just a DID, and there is one way in.** A labeler advertises
  `#atproto_labeler` in its DID document and publishes an `app.bsky.labeler.service`
  record describing its label values. That is the standard AT Protocol declaration; we resolve it on
  first sight and backfill it, after which reads are pure DB.
- **We don't run labelers.** We used to ship two (`claudeslop`, scoring AI-ish prose, and a bot
  labeler), plus an `app.standard-reader.labeler.service` descriptor record that existed only because
  a `did:web` has no repo and so cannot publish the standard declaration. All of it is gone. A
  labeler can already label any content on the network, so running our own bought nothing the
  network doesn't provide, and the custom descriptor was a deviation other clients would have had to
  learn. The one signal we actually used — an account declaring itself a bot — was already in the
  profile record we index (`labels`, a `com.atproto.label.defs#selfLabels` entry), so we read it
  there and show a small bot mark on the profile and on that account's feed rows. A labeler that
  re-published the account's own statement as a signed label was a network round trip to learn
  something we had in hand.
- **Every labeler on the network, not just ours.** The directory lists the whole network with no
  relevance filter — readers bring their moderation setup with them, so a labeler that has never
  touched a standard.site document is still theirs to see and manage. A labeler declares itself by
  publishing one `app.bsky.labeler.service` record, so the complete set is "every repo holding a
  record in that collection", which relays answer via `com.atproto.sync.listReposByCollection`
  (~537 repos, ~460 of which still resolve to a live service). A timer in the ingest worker scans
  for those, resolves the ones we don't hold, and upserts them, so the directory read stays a plain
  DB query. That index is **not** authoritative — it only covers repos its relay carries, and real
  labelers are missing from it — so discovery is additive: it seeds the directory in bulk while
  subscribing or looking a labeler up still backfills on demand. Subscribe and unsubscribe live on
  the directory cards, and a reader's own labelers sort to the top.
- **Listing the network is not polling the network.** Being in the directory does not mean we ask a
  labeler for labels; that is driven by subscriptions. The label sync runs every two minutes, so
  scoping it to the whole table would mean hundreds of requests per minute to other operators'
  label servers for labels nobody here asked to see. It covers labelers with at least one live
  subscription, plus our own.
- **Hundreds of rows means server-side search.** Those labelers declare ~15k label values between
  them — over 3 MB of definition JSON — so the directory pages in SQL and a card is sent only the
  couple of label names it renders plus a total. Search (name, handle, description, DID, and
  declared label identifiers) runs in Postgres, debounced from the client; one page is ~13 kB.
- **Handles, not DIDs.** A card shows `@handle`, resolved from the DID document's `alsoKnownAs` and
  stored alongside the row. did:web labelers — ours — declare no `alsoKnownAs`, but for them the
  DID _is_ the host, so it's derived at render. The DID remains the fallback so the identifier is
  never lost.
- **Your Bluesky moderation comes with you.** Bluesky keeps subscribed labelers in account
  preferences rather than repo records, so we read `app.bsky.actor.getPreferences` and recreate
  their setup here — labelers plus each label's visibility. They do nothing; they log in and it's
  already there. The read is **one-way**: we never call `putPreferences`, because it replaces the
  whole preferences blob and a partial-scope read-modify-write would silently drop settings we
  couldn't see. So unsubscribing in Standard Reader is local and never edits anyone's Bluesky
  moderation, and the port runs exactly once so those local choices are never overwritten.
- **Porting never blocks a login.** Each ported labeler costs a DID-document fetch, two repo reads
  and a PDS write, which put tens of seconds on the sign-in path when it ran inline in the OAuth
  callback. The import is scheduled fire-and-forget instead — kicked off by the callback and
  re-triggered by the signed-in shell read, so a reader whose import hasn't finished (or whose
  session predates the preferences scope) still gets it without another login. Nothing a reader
  waits on ever awaits a labeler backfill.
- **Muting is per-app.** Porting someone's Bluesky setup wholesale means importing labelers they
  may want _there_ but not _here_ — a vanity or novelty labeler is fun on a feed and noise in a
  reader. So a subscription can be muted (`enabled: false`) rather than dropped: the subscription
  and its per-label preferences stay exactly as they are, and only label resolution skips it, so
  unmuting restores what they had instead of starting from defaults. Absent means enabled, so no
  existing subscription is affected. It reads as a **switch** labelled "Muted" — a switch names the
  state it shows, where a button would name an action.
- **Subscribing writes real preferences.** A new subscription stores an explicit visibility for every
  label the labeler declares, defaulting to `warn`. Storing nothing and falling back at render time
  meant the UI showed preferences that existed nowhere in the reader's repo, and let a labeler
  change how an existing subscription behaved just by editing its own `defaultSetting`. `warn` is
  the reversible middle: `hide` would make documents vanish with no explanation, and `ignore` would
  make a fresh subscription look broken. The Bluesky import obeys the same rule, so a ported labeler
  and a hand-subscribed one differ only where Bluesky actually recorded a choice.
- **Preference changes are optimistic.** Each one is a PDS write, so the control moves immediately
  and the write's response is the authoritative state — nothing is refetched. Only document label
  treatment is invalidated, because a visibility preference changes neither the labeler nor its place
  in the directory. Waiting on the round trip and refetching around it made the page feel frozen for
  about a second per click.
- **Labels apply to documents _or_ to accounts.** Ours score prose, so they label documents;
  labelers on the wider network label accounts (pub-search's `bulk-generated` marks a publisher
  whose documents are generated from a data source, not composed by an author). Both subject kinds
  are stored in `document_labels` and resolved together: a card is matched against its own URI
  _and_ its author's DID, so an account label badges every one of that account's rows, shows on the
  author and publication headers, and honors a reader's `hide` pref across the feeds.
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
- **Labels are verified on receipt**, per the [label spec](https://atproto.com/specs/label). The
  periodic sync checks each label's `sig` against the signing key the labeler publishes as
  `#atproto_label` in its DID document, and only verified labels reach the read-model — so every
  request path serves labels we have already authenticated. A mismatch triggers one DID
  re-resolution (the key-rotation case) before the label is dropped.
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
  Leaflet-hosted) get tracked + backfilled. A fourth **`tap-bridge`** instance carries bridged
  repos and signals on nothing — see "Bridged repos" below. A separate ingest worker
  (`pnpm ingest:dev`) connects to each tap's acknowledged WebSocket channel, maps records to rows
  idempotently, and expands tap's tracked-repo set along the graph via `/repos/add`. tap + the
  worker are the single ingestion path for both backfill and live sync (locally and in prod); the
  product app server does not process the firehose.
- **Bridged repos have their own lane.** [Bridgy Fed](https://fed.brid.gy) mirrors the wider web
  into AT Proto: `*.web.brid.gy` is a site Bridgy discovered (tens of thousands of them, thousands
  of posts each, no publisher intent), and `*.ap.brid.gy` is an ActivityPub blog whose author chose
  to bridge. Both are welcome, but pointing that bulk at the primary tap put every publisher and
  reader behind bridge backfills _inside tap's resyncer queue_ — and that queue is per tap
  instance. So `ensureTracked` routes any `*.brid.gy` repo to `TAP_BRIDGE_API_URL`
  (`#/lib/atproto/bridged-repo`, `#/server/ingest/tap-client`); a bridge backfill can then only
  delay other bridged repos. With no bridge lane configured the bulk web bridge is turned away
  instead — configuring the isolated tap is what turns Bridgy fully on, rather than a second
  switch. Isolation is per-tap and per-channel (each channel has its own in-flight budget); the
  ingest **process and Neon pool are still shared**, so a dedicated bridge worker is the next step
  if write pressure matters.
- **The read-model repairs itself against the PDS.** tap can advance its cursor past a commit whose
  record never reaches us — no error, no dead letter, and "no events" is indistinguishable from "no
  changes" from the read-model's side. So the reconcile sweep no longer trusts the stream: for
  every tracked repo it compares `com.atproto.sync.getLatestCommit` against
  `tracked_repos.last_seen_rev` and re-applies anything missing (`repairRepoIfAdvanced` in
  `#/server/ingest/repo-sync`). Two gates keep it affordable — an unchanged head costs one request
  and stops, and only records whose CID differs from the mirrored row are written. Repaired records
  replay through `handleRecord`, the same dispatcher tap feeds, so a repaired row and a live one
  are written by identical code. The sweep covers **every** tracked repo, not just publishers:
  restricting it to `publication`/`document` is what once left readers' reads and subscriptions
  with no safety net at all.
- **Read-model:** **Neon Postgres** in dev/prod (a local Postgres for testing — the DB client in
  `src/db/index.ts` picks the driver from the connection string), managed with **Drizzle**
  (`src/db/schema/`), powers feeds, the
  directory, search (GIN `tsvector`), recommendations, and trending. Derived aggregates
  (`publication_stats`, `publication_cosubscriptions`, `publications.topic`,
  `publications.serial_kind`, `discover_topic_counts`, `network_stats`) are recomputed on a
  schedule. It is a cache — never the source of truth.
  - **Network-wide aggregates never run on the request path.** A count over the whole corpus is
    an unbounded scan no index can serve, and at ~1.4M documents / 2.2GB it also evicts the
    buffer cache the feed queries depend on. `discover_topic_counts` (Discover topic chips) and
    `network_stats` (the Latest "All" badge) exist so those reads are single-row lookups; the
    sweep already walks these tables, so maintaining them is near-free marginal work. Add a
    scalar here rather than counting live.
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
- **No bulk web-bridge mirrors in Recommended** — Discover's Recommended rail (signed-in _and_
  cold start) excludes `*.web.brid.gy` publications. Those sites were discovered and mirrored by
  Bridgy Fed, not published here on purpose, and they are a quarter of the discover-eligible
  corpus — recommending them reads as noise. They stay fully reachable everywhere else: the
  directory, search, trending, follows, and their own pages. Filtered in SQL, so the rail still
  fills to its limit.

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
  - The `standard-reader` **CLI** (see §8) does write to an author's repo, but it is a separate
    binary an author runs against their own account — not an in-app authoring surface. The reading
    client stays read-first.

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
- **Browser extension:** pnpm workspace package [`apps/extension/`](../extension/) built with WXT + hip-ui
  (shared `#/*` → `src/design-system/`). Auth via HttpOnly session cookie; background worker calls
  `/api/extension/*` on the web app. Surfaces: popup, page overlay, context menu, Bluesky link
  badges (bsky.app and its `social-app` forks — currently also Witchsky and Mu), options page,
  toolbar badge. See [`apps/extension/store/README.md`](../extension/store/README.md) for Chrome Web Store
  publish notes.

### Format conversion (`@standard-reader/converter` + the `standard-reader` CLI)

The reader already normalizes every content format into one render tree so it can _display_ any
document. The same tree run backwards lets a document be **re-emitted into a different format** —
so an author is not locked into whichever tool first wrote their posts.

```
  any source format ──► buildRenderTree() ──► DocumentTree ──┬─► renderers  (react, vue, lit, …)
  (leaflet · pckt · offprint · markpub ·      renderer-core  └─► emitters   (leaflet · offprint ·
   markdown · prosemirror · blocknote · …)                                    pckt · markpub)
```

- **[`packages/converter`](packages/converter)** — `convertDocumentContent()` takes a document's
  `content` union and a target, and returns the new payload _plus a per-block issue list_. Sources
  are anything `renderer-core` parses; targets are the four formats carrying most of the network's
  long-form writing.
- **[`packages/cli`](packages/cli)** — the `standard-reader` binary: `formats` (capability matrix),
  `list` (survey a repo), `convert` (rewrite records via `putRecord`), and `login` / `logout` /
  `whoami`.

Sign-in is **AT Protocol OAuth**, not an app password. `login` opens a browser, the user authorizes
on their own PDS, and the redirect lands on a loopback listener that exists only for the duration of
the flow — no credential passes through the CLI. Because a CLI cannot hold a secret, it registers as
a _loopback public client_: `client_id` is the `http://localhost?…` form the spec reserves for
exactly this case, with `token_endpoint_auth_method: none` and DPoP-bound tokens. The `client_id`
embeds the redirect URI, so the port bound at login is persisted with the session and replayed on
every refresh — a different port is a different client. The granted scope is
`atproto repo?collection=site.standard.document&action=update` and nothing else: the one collection
the tool rewrites, update only. App passwords still work for CI, and win when passed explicitly.

Two design points shape everything else:

- **Loss is reported, never guessed at.** The formats do not describe the same set of things — pckt
  has tables and Leaflet does not; Leaflet has footnotes and nobody else does; Offprint list items
  hold one line, so nesting has nowhere to go. Issues are graded `lossy` (the words survive, the
  presentation changes) vs `unsupported` (the block is not in the output). A
  [capability matrix](packages/converter/src/capabilities.ts) is the single source of truth for
  which is which, and a test asserts the emitters agree with it — a warning can never disagree with
  what actually got written.
- **The author decides per record.** The CLI shows what a conversion costs and asks about each
  record that would lose something, so opting out of one article does not abandon the run. Records
  that would lose content are skipped by default when there is no terminal to ask in; originals are
  backed up before any overwrite; and every write is pinned with `swapRecord` to the CID it was
  converted from.

Images move by **blob reference** — a converted record points at the same blob in the same repo,
with no re-upload. Markpub is the exception (markdown cannot address a repo blob), so blob-backed
images become CDN URLs and the swap is reported.

### One renderer for every format

The reader does not special-case markdown any more. `site.standard.content.markdown`, the
markdown-in-record third-party lexicons, and Markpub all render through
[`@standard-reader/renderer-react`](packages/renderer-react) like Leaflet, pckt and Offprint do —
`renderer-core` parses, the app supplies the components. A markdown heading and a Leaflet heading
are the same component with the same styles, and a fix to either lands in both.

Getting there meant teaching `renderer-core`'s markdown parser everything the app's old
react-markdown stack displayed: nested lists, callouts, GFM footnotes, display math, inline images,
and raw HTML. Raw HTML is a block node the renderers deliberately render as _nothing_ by default —
deciding what markup is safe belongs to the host with its own sanitizer, not to a
framework-agnostic library, so the app supplies an `Html` component backed by the schema the
markdown pipeline always used.

react-markdown remains for two things that are not document markdown: HTML-in-record documents
(WordPress, Ghost, Known, Gutenberg-as-HTML), which need an HTML pipeline rather than a markdown
one, and small in-app strings such as a collection colophon.

**One block vocabulary, too.** The app used to keep a second copy of `StructuredRenderableBlock`
and of every parser that produces it. The copies drifted — core grew nested list items, image
captions, raw-HTML blocks and callout metadata that the app's copy never received — so a document
core could parse could not be handed to an app consumer. The types and parsers now live only in
`renderer-core`; the app re-exports them, and `structuredFormatBlocks` delegates to core's dispatch.
The app still walks blocks itself for the third-party block formats (`StructuredBlockView`); folding
that last path into `renderer-react` is the remaining step.

### Record meta tags (`at:`)

Every page we serve says, in its `<head>`, which AT Protocol records it is built from — the
convention the Atmosphere converged on in 2026. These sit **alongside**, not instead of, the
`<link rel="site.standard.*">` discovery hints: the rels are part of the site.standard spec and
plenty of clients read only those, while the meta tags carry intent the rels can't express.
Article, publication and collection pages emit both.

| Tag            | Means                               | Example on `/a/$did/$rkey`        |
| -------------- | ----------------------------------- | --------------------------------- |
| `at:canonical` | the records the page is made of     | the `site.standard.document`      |
| `at:alternate` | records the page merely shows       | its publication, its Bluesky post |
| `at:author`    | the identity that wrote the content | the document's repo DID           |

Where they come from and why they're not route `head.meta`:

- A route declares its records by returning an **`atMeta`** key from its loader
  (`WithAtMeta` in `src/lib/at-meta-tags.ts`). `AtRecordMeta` reads the deepest match that has
  one and renders the tags as raw elements in `RootDocument`'s `<head>`.
- They **can't** be route `head.meta` entries: TanStack dedupes head meta by `name`, and these
  names repeat — an article carries two `at:alternate` tags. Same reason `theme-color` is a raw
  tag. `src/components/at-record-meta.ssr.test.ts` renders a router through the shell to keep
  that property from regressing silently.
- Covered routes: `/a/…` (document + publication + Bluesky post), `/p/…`, `/l/…`,
  `/collection/…`, and `/u/…` — the profile page declares **no canonical**, since it is a
  directory of someone's publications with their Bluesky profile draped over it and stands up
  fine without that record.
- We do **not** emit `at:me`. That tag asserts the page belongs to the identity, and every
  record we render belongs to someone else; it's the right tag for a platform serving an
  author's own site, not for a reader.

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
  When the URL isn't indexed, fall back to the page's own record hints: the `at:canonical` /
  `at:alternate` meta tags first, then the older `<link rel="site.standard.*">` tags
  (`src/lib/discovery-hints.ts`). Our own pages emit both — see "Record meta tags" below.
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

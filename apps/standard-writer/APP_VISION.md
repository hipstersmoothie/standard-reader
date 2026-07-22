# Standard Writer — App Vision

> A calm, editorial **authoring** app for **standard.site publications** on the AT Protocol.
> The writing companion to [Standard Reader](../standard-reader/APP_VISION.md): where Reader is
> a read-first client, Writer is where you _compose and publish_ — into a repo you own.

---

## 1. Concept

Standard Reader is deliberately **read-only** (its explicit non-goal: "no in-app posting or
authoring publications" — see [Standard Reader §7](../standard-reader/APP_VISION.md)). Standard
Writer is the other half of that story: the place a person actually writes.

A publication on standard.site is not a feed on someone else's server — it's a set of signed
records in the **author's own AT Proto repository**, described by the shared `standard.site`
lexicon. That means authoring is just **writing records to your repo**: no platform to be
de-platformed from, no export to beg for, and any reader that speaks the schema (Standard
Reader, or anyone else) can render what you publish the moment it lands on the network.

That property is the product thesis:

- **You own the press.** The canonical article lives in your repo, signed by your DID. Standard
  Writer is a client that helps you produce those records — it is not the home of your work.
- **Publishing is a protocol action, not a lock-in.** The same `site.standard.document` you
  write here is the one Standard Reader indexes, the one another author can quote, and the one
  you can take to any other standard.site-aware tool.

### Core differentiator

A **warm, focused writing surface** — a block editor that feels like a modern document editor
but serializes losslessly to portable, standard **`at.markpub.markdown`** — married to
**one-click publish into your own repo**. No CMS, no database of your drafts held hostage; the
document is the record.

---

## 2. Audience & platform

- **Audience:** writers publishing long-form work to standard.site — the same people whose
  publications Standard Reader surfaces. Newsletter authors, essayists, and anyone who wants a
  calm place to write that they fully own.
- **Platform:** responsive web, same codebase and same **shared design system** as Standard
  Reader (`@standard-reader/design-system`). Desktop-first (writing is a lean-in activity), but
  the editor and chrome are built from the same theme-aware, StyleX components as the reader.

---

## 3. The editor (shared with the design system)

Standard Writer's heart is the **`RichTextEditor`** exported from
`@standard-reader/design-system/rich-text-editor` — a **Lexical**-powered block editor that both
apps share. Building it in the design system (rather than in this app) means the reader and the
writer render and produce the same content model, and improvements land in both at once.

What the editor provides today:

- **Block-based composition** with Markdown input shortcuts (`#`, `-`, `>`, ``` ``` ```, …) _and_
  a formatting **toolbar** for people who don't think in Markdown.
- **Gutter "+" block menu** — a Notion/Medium-style affordance on the left margin for inserting
  blocks (add-below on non-empty blocks).
- **Rich nodes** beyond prose: **images** and **math** (LaTeX rendered via KaTeX).
- **`at.markpub.markdown` as the wire format.** Everything the editor produces serializes to a
  portable [Markpub](https://markpub.at/) record (`MarkpubRecord`: GFM/CommonMark flavor +
  declared extensions like `latex`). This is the same format Standard Reader's article renderer
  already treats as first-class — so what you write is exactly what readers see.

The current app (`src/App.tsx`) is a **thin scaffold**: a single editor instance over a starter
document with a live `at.markpub.markdown` output pane. It exists to exercise the shared editor;
the sections below are the direction, not yet the reality.

---

## 4. Information architecture (direction)

```
├── Write        — the editor: the default surface, one document at a time
├── Drafts       — in-progress documents not yet published (stored in our DB)
├── Publications — the publications you own; create/edit them, pick where a document lands
└── Publish      — metadata + destination + optional announce, then write records to your repo
```

Standard Writer is a **full authoring home** for a standard.site writer — compose, keep drafts,
manage your publications, and publish (and re-edit) documents — but it is deliberately _not_ a
CMS with its own analytics or distribution. Its job is to turn writing into well-formed
`site.standard.document` / `site.standard.publication` records in the author's repo; reading,
discovery, and stats all live in Standard Reader and across the network.

---

## 5. Screens & behaviors (direction)

### Write (default surface)

- Full-height editor on a centered measure, warm paper, minimal chrome — the Almanac palette
  and typography tokens shared with the reader.
- Autosave to draft (see §6): the body is `at.markpub.markdown`, saved continuously to our DB.
- Title, optional cover image, tags, and contributors captured as document metadata (mapping to
  `site.standard.document` fields).

### Drafts

- A list of your in-progress, not-yet-published documents, newest-first.
- Drafts are **private working state stored in our database** (see §6), keyed to your DID and
  synced across devices — they are _not_ public repo records until you publish.
- Open a draft to resume editing; delete drafts you abandon.

### Publish

- Choose a **destination publication** (one you own) or publish as a **loose document**
  (`site` = an `https://` URL, no publication record — the same "loose document" shape Standard
  Reader already renders and bylines via `/u/$did`).
- Set `path`, `publishedAt` (including scheduled-future publish, which Reader hides from
  chronological feeds until the time passes), `title`, `tags`, `contributors`, and a cover image
  (uploaded as a blob).
- **Publish writes records to your PDS** via `com.atproto.repo.*` — the document (and, for a new
  publication, the `site.standard.publication`) land in your repo, and the draft is cleared.
  Standard Reader's tap ingester picks them up off the network like any other publication.
- **Optional announce post** — after a successful publish, offer to compose a **Bluesky post**
  linking the article. This is opt-in per publish (not automatic), and it feeds Standard Reader's
  discussion / backlink surfaces so the piece is discoverable in-network.

### Manage publications

- List the `site.standard.publication` records you own; create/edit publication identity
  (name, description, icon, basic theme, discover visibility).

### Edit published

- Re-open an already-published `site.standard.document` from your repo, edit, and re-publish
  (rewrite the record). The repo record stays the source of truth; Reader re-ingests the update.

---

## 6. State model & data ownership

Same principle as Standard Reader, from the authoring side: **records in your repo are the
source of truth.** Standard Writer writes them; it does not own them.

- **Auth:** sign in with **AT Proto / Bluesky OAuth** — the same identity as Standard Reader.
  Authoring requires write scope on the standard.site collections.
- **Documents:** `site.standard.document` — the article (`site` → publication at-uri _or_ an
  `https://` URL for a loose document, `title`, `path`, `content`/`textContent`, `coverImage`
  blob, `tags`, `contributors`, `publishedAt`). Body content is authored as
  `at.markpub.markdown`.
- **Publications:** `site.standard.publication` — the masthead (`url`, `name`, `description`,
  `icon` blob, `basicTheme`, `preferences.showInDiscover`).
- **No new _published_ lexicons of its own (for now).** Writer reuses the existing
  `standard.site` lexicons so anything it publishes is immediately legible to Standard Reader and
  the wider network. The _published_ artifact is always a standard.site record in your repo.

### Drafts are the one exception: DB-owned, not a repo record

Unlike Standard Reader — where Postgres is a **pure read-model cache** of records that live in
repos — Standard Writer keeps **drafts in our own database** (Neon Postgres), keyed to the
author's DID. Drafts are private, mutable, pre-publication working state; they are deliberately
_not_ AT Proto records yet. The moment you publish, the draft becomes a real
`site.standard.document` in your repo (owned by you) and the DB draft is cleared. So the
"own the press" guarantee holds for everything published; the DB only ever holds unfinished work
you haven't committed to the network. (This means the Writer app needs a small server + DB layer
of its own, unlike the current thin SPA scaffold — see §8.)

### OAuth scopes

Publishing needs write access to the standard.site authoring collections
(`site.standard.publication` + `site.standard.document`), plus `blob:*/*` for image/cover
upload — the same authoring tier Standard Reader requests for its collections feature
(`include:site.standard.authFull`). Sign-in requests these as AT Proto OAuth permission scopes;
see [Standard Reader §5 "OAuth scopes"](../standard-reader/APP_VISION.md) for how the app-owned
and upstream permission sets compose.

---

## 7. Relationship to Standard Reader

Standard Writer and Standard Reader are **two apps, one network, one design system**:

- **Shared design system** — both consume `@standard-reader/design-system` (StyleX tokens,
  typography, the `RichTextEditor`). The editor lives there precisely so authoring and rendering
  never drift.
- **Shared lexicons** — Writer produces exactly the `site.standard.*` records Reader indexes.
- **Complementary roles** — Reader is discovery + reading (read-only); Writer is composition +
  publishing. The handoff is the network: publish in Writer → ingested by tap → surfaced in
  Reader for everyone.

---

## 8. Tech notes

### Stack (this app)

- **Framework:** React 19 + Vite today (a thin SPA scaffold). Because drafts live server-side (§6)
  and publishing needs OAuth + PDS writes, v1 grows a **server + DB layer** — most likely
  **TanStack Start** (as Standard Reader uses) with server functions, rather than staying a pure
  SPA.
- **Design system:** `@standard-reader/design-system` (shared, copy-and-own, react-aria).
- **Editor:** Lexical, via the shared `RichTextEditor`; serializes to `at.markpub.markdown`.
- **Styling:** StyleX (`@stylexjs/stylex`) with the shared design-system tokens; no Tailwind.
- **Data:** **Neon Postgres** for drafts (its own `drafts` table keyed to DID), via Drizzle —
  the app's only owned state; everything published lives in the author's repo.
- **Auth (planned):** AT Proto / Bluesky OAuth (same identity as Standard Reader).
- **Writes (planned):** `com.atproto.repo.*` to the author's PDS — the same write path Standard
  Reader uses for its record writes; plus `app.bsky.feed.post` for the optional announce.

### Monorepo layout

```
apps/
  standard-reader/   — the reader (read-first client)
  standard-writer/   — this app (authoring companion)
packages/
  design-system/     — shared StyleX design system + Lexical RichTextEditor
```

---

## 9. Scope & milestones

### Now (scaffold)

- A single-document editor demo over the shared `RichTextEditor`, with a live
  `at.markpub.markdown` output pane. Proves the shared editor and design-system integration.

### v1 — full authoring surface

The goal for v1 is a complete authoring home, not a minimal loop:

- **AT Proto / Bluesky OAuth login** (same identity as Standard Reader).
- **Server + DB layer** (TanStack Start + Neon/Drizzle) with a `drafts` table.
- **Compose → autosave draft → publish** a `site.standard.document` into the author's repo
  (loose document and publication-bound).
- **Drafts** list backed by our DB (resume, delete), synced across devices by DID.
- **Document metadata** (title, cover, tags, contributors, path, publishedAt, incl. scheduled).
- **Manage your publications** (create/edit `site.standard.publication`).
- **Edit already-published documents** (re-open from repo, edit, re-publish).
- **Optional announce post** to Bluesky on publish.

### Later

- Image handling, embeds, and richer block types as the shared editor grows.
- Collaboration / co-authoring, revision history.
- Draft sharing / preview links before publish.

### Non-goals (for now)

- A full CMS or analytics dashboard — reading, discovery, and stats live in Standard Reader.
- Holding _published_ work outside the author's repo — once published, the repo record is the
  source of truth (only unfinished drafts live in our DB).

> **Naming:** working title is **Standard Writer**, mirroring Standard Reader. Open to
> alternatives.

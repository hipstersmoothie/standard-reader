# Standard Writer — App Vision

> The home for the work you publish. Standard Reader is where people read; Standard Writer
> is where the person who wrote it sees how it landed, decides how it looks, and decides
> where else it goes.

---

## 1. Concept

A standard.site publication is not a feed on somebody's server — it is a set of signed records
in the author's own repo. That makes the reading side easy to build and, until now, left the
_writing_ side with nowhere to stand: no readership numbers, no page of your own, no mailing
list, nothing to paste on your site.

Standard Writer is that missing side. It owns nothing the author writes — every canonical record
still lives in their repo, and the app reads the same Neon read-model Standard Reader does. What
it adds is everything **around** the writing:

- **Analytics** — who reads a publication, how that changed, which posts landed.
- **Sites** — a page for the work with none of the reader's chrome, in one of four styles.
- **Newsletter** — connect a publication and each new post is mailed to its subscribers.
- **Embeds** — the subscribe and follow cards, ready to paste on a site the author already has.

The rule that keeps it honest: **Writer never becomes the home of the work.** Delete the account
and the publication, the posts, and the site's configuration are all still in the author's repo,
still readable by any client that speaks the lexicons.

---

## 2. Audience & platform

- **Audience:** people who publish to standard.site — the same publications Standard Reader
  surfaces. One person with one blog, and a small masthead with several.
- **Platform:** responsive web, sharing the design system (`@standard-reader/design-system`), the
  read-model schema (`@standard-reader/db`), and the publication palette
  (`@standard-reader/publication-theme`) with the reader. Desktop-first, because the screens are
  dashboards and editors.

---

## 3. Information architecture

```
├── Dashboard      — every publication you own, at a glance
├── Sites          — each site's style, colors, links, and (Pro) domain
└── /p/$pubId      — one publication
    ├── Overview   — subscribers, opens, clicks, growth, recent sends
    ├── Subscribers— the email list, imports, and per-person state
    ├── Sends      — one report per mailed post
    └── Settings   — newsletter connection, sender identity, disconnect
```

Everything is keyed off publications the signed-in DID **owns** (`publications.did == their DID`).
A newsletter is a feature you switch on per publication, not the price of appearing at all — the
sidebar lists everything you own and `newsletter_publications` decides only what gets _sent_.

---

## 4. Standalone sites

An author's or a publication's own page, with **none of Standard Reader's chrome**:
`/site/u/$did` and `/site/p/$did/$rkey`.

- **What each covers.** The author route is everything one account publishes, across every
  publication they write for — rows carry a kicker naming which. The publication route is one
  archive, and carries no kicker because every row would repeat the same word.
- **Four presentations**, chosen by the owner: **Broadsheet** (masthead, lead story, multi-column
  index), **Journal** (one quiet column of dated entries, separated by space rather than rules),
  **Gallery** (a portrait cover grid; posts with no cover become typographic tiles in the accent
  rather than holes), **Marquee** (a full-screen opening title, then selected work, then a compact
  index). `?style=` previews one without saving.
- **Colors.** A publication site inherits the publication's own theme; an author site has none to
  inherit, so it takes the colors they set or the default editorial palette. Either way the
  record's `theme` wins when stated. Both run through `@standard-reader/publication-theme`, the
  same generator the reader uses — so a derived dark mode and contrast-nudged accents come free,
  and a publisher who picked one accent sees one accent in both apps.
- **Always live.** Every account and every publication has a site whether or not it has been
  configured. The record only customizes one; nothing in the editor creates or destroys a page.
- **Paging is by URL.** A site's whole job is to be linked to and crawled, so every page of the
  archive has an address (`?offset=`) rather than appending into a list in memory.
- **Posts open in the reader.** Writer serves the site; Reader renders the article. A headline is
  an ordinary cross-deploy link to `VITE_READER_URL`.
- **Where the config lives.** `app.standard-reader.site` in the author's repo — the reader's
  ingester mirrors it into `sites`, and `@standard-reader/site-config` is the one normalizer both
  sides use, so a hostile or simply old record cannot put an unrenderable colour or a
  `javascript:` link onto a page we serve. The **custom domain is the exception**: it is our
  routing configuration, not a fact about the author's writing, so it lives only in the mirror.

---

## 5. Newsletter

Connecting a publication (**Add a newsletter**) writes a `newsletter_publications` row. That
opt-in is what everything downstream keys off: only connected publications are mailed, and only
they accept signups at `/subscribe/$pubId`. Disconnecting deletes the row but keeps the subscriber
list and past sends, so reconnecting resumes rather than restarting.

- **Subscribers** arrive by email signup (double opt-in, confirm link), CSV import, or a Bluesky
  account subscribing through the AT Protocol path. The author's own list is also mirrored into
  their repo as `app.standard-newsletter.subscriberList`.
- **Sending** is Resend, with bodies rendered by `@standard-reader/renderer-email` from the same
  headless renderer the reader uses — so an email and the on-site article are the same document.
- **Delivery events** (delivered, opened, clicked, bounced, complained, unsubscribed) come back by
  webhook into `newsletter_send_events`, and are the source of every rate the analytics show.

---

## 6. Pro

Standard Writer Pro exists to pay for the things that cost us money to run. Today that is exactly
one capability, and the code says so: `grep requirePro` is the complete list.

- **Custom domains** for a site (and, later, for a newsletter's links) — a hostname the author
  owns, so readers never see our address.

Everything else — every style, every colour, the newsletter itself, all the analytics — is free.

There is no payment provider wired up yet. `user.pro_since` is set by hand; when billing lands it
changes only what _writes_ that column, never what reads it. A domain is stored the moment it is
saved but routes nothing until `custom_domain_verified_at` is set, because anyone can type a
hostname they do not control.

---

## 7. Relationship to Standard Reader

| Concern                            | Lives in |
| ---------------------------------- | -------- |
| Reading, feeds, discovery          | Reader   |
| The article page                   | Reader   |
| Jetstream ingest → read-model      | Reader   |
| Migration generation               | Reader   |
| Analytics about your work          | Writer   |
| Standalone sites (public + editor) | Writer   |
| Newsletter subscribers & sends     | Writer   |
| Pro entitlement                    | Writer   |

They share one database and four packages: `@standard-reader/db` (schema),
`@standard-reader/design-system` (components + tokens), `@standard-reader/publication-theme`
(palette derivation), and `@standard-reader/site-config` (the site record's normalizers). The
reader links out to Writer via `VITE_WRITER_URL`; Writer links back via `VITE_READER_URL`.

---

## 8. Scope & non-goals

**In scope:** analytics, sites, newsletter, embeds, Pro domains.

**Not in scope (for now):**

- **Authoring.** There is a separate editor prototype (`claude/standard-writer-impl-5gqqpg`)
  built on the design system's Lexical editor. Folding it in is a real option — this app is the
  natural shell for it — but writing and publishing records is not what this app does today.
- **Being the canonical home.** No feature may depend on data that exists only here. The one
  exception is deliberate and small: subscriber emails and delivery events, which are ours because
  they are not the author's writing.

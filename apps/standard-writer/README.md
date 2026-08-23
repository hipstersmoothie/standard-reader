# Standard Writer

The home for the work you publish: readership analytics for your publications, a
standalone site for each of them with none of Standard Reader's chrome, embeds,
and a newsletter your posts are mailed to. A TanStack Start app that shares the
Standard Reader database and design system.

See [`APP_VISION.md`](./APP_VISION.md) for what it is and [`TODO.md`](./TODO.md)
for what is left.

- **Framework:** TanStack Start + TanStack Router (file-based routes), React 19,
  Vite 8, Nitro SSR — the same toolchain as `standard-reader`.
- **Styling:** StyleX + the shared `@standard-reader/design-system`.
- **Data:** the shared Standard Postgres (publications, documents, sites) plus
  four newsletter-owned tables (`newsletter_publications`,
  `newsletter_subscribers`, `newsletter_sends`, `newsletter_send_events`) — all
  defined in `@standard-reader/db`, migrated by the reader.
- **Email:** Resend, with bodies rendered by `@standard-reader/renderer-email`
  (React Email components driven by the shared headless renderer).

## Standalone sites

Every publication and every account has a site — `/site/p/$did/$rkey` and
`/site/u/$did` — whether or not anyone has customized one. **Sites** in the
sidebar picks the style, colors, tagline, masthead links, and (with Pro) a custom
domain; the configuration is written to the author's own repo as
`app.standard-reader.site` and mirrored back by the reader's ingester.

Posts on a site link into Standard Reader, so set `VITE_READER_URL` when running
it locally.

## Opt-in per publication (newsletter)

Owning a standard.site publication does **not** make it a newsletter. The author
connects one explicitly (**Add a newsletter**), which writes a
`newsletter_publications` row — that opt-in is what everything mailing keys off:

- the dispatcher only mails posts from connected publications,
- `/subscribe/$pubId` only accepts signups for connected publications.

Disconnecting deletes the row but keeps the subscriber list and past sends, so
reconnecting later resumes rather than starting over.

## Running the app

The app needs a `DATABASE_URL` — it reads all of its data from the Standard
Reader database and has no offline/sample mode; a failed query surfaces as an
error rather than serving placeholder numbers.

```bash
pnpm install
cp apps/standard-newsletter/.env.example apps/standard-newsletter/.env
# set DATABASE_URL in .env (shared reader dev DB or a Neon branch of it)
pnpm writer:dev                # http://127.0.0.1:3100
```

### Preparing data

Point `DATABASE_URL` at a database that already has publications — the shared
Standard Reader dev DB, or a [Neon](https://neon.tech) branch of it. The four
newsletter tables are created by the reader's migrations (it owns migration
generation for the shared schema):

```bash
# from the repo root, against the same DATABASE_URL
pnpm db:migrate
```

Sign in and **Add a newsletter** to connect one of your publications (nothing is
listed or mailed until you do). Then give it a subscriber list so the send path
has recipients:

```bash
pnpm writer:seed                       # lists available publication URIs
pnpm writer:seed at://did:plc:…/… 25   # seed 25 confirmed subscribers
```

Sign-in uses AT Protocol OAuth. On `localhost` the client runs in public mode
and needs no key; set `ATPROTO_PRIVATE_KEY_JWK` only for a deployed confidential
client.

## Sending

Sending needs `RESEND_API_KEY` and a **verified Resend domain** for
`NEWSLETTER_FROM`.

```bash
# Mail every published post that hasn't been sent yet (idempotent — safe on a
# schedule). This is the post→send trigger.
pnpm newsletter:dispatch

# Send one specific document by AT-URI.
pnpm newsletter:send
```

Delivery/open/click/bounce/unsubscribe events flow back in via the Resend
webhook at `POST /api/resend-webhook`. Configure the endpoint in the Resend
dashboard and set `RESEND_WEBHOOK_SECRET` to its `whsec_…` signing secret —
webhooks whose Svix signature doesn't verify are rejected.

## Subscribers & permissioned spaces

Subscribers can be stored as **AT Protocol permissioned data** (Proposal 0016) —
data the author owns and shares with the app — via
[HappyView](https://happyview.dev), an experimental 0016 AppView. It's optional:
with `HAPPYVIEW_*` unset the app runs email-only on the database.

- **Email (default):** the address goes to the author's own `subscriberList`
  space record; authors bulk-import from **Settings → Import email subscribers**.
- **Bluesky:** the subscriber signs in and writes their own
  `app.standard-newsletter.subscription` record into their space repo — they
  unsubscribe with the email link **or** by deleting the record (from
  `/subscribe/manage`).

Records are reconciled into the `newsletter_subscribers` mirror (the send read
model), so the send path is unchanged. **Note:** HappyView hosts space data in
its own DB, not the user's PDS — it isn't network-recoverable, so back up the
instance. Full setup and caveats: [`docs/happyview-runbook.md`](../../docs/happyview-runbook.md).

The record schemas live in [`lexicons/app/standard-newsletter/`](./lexicons/app/standard-newsletter)
(a new `app.standard-newsletter.*` authority; network publishing is deferred
until its `_lexicon` DNS is set up — HappyView doesn't require it).

## Environment variables

See [`.env.example`](./.env.example). Summary:

| Variable                  | Required for       | Notes                                                     |
| ------------------------- | ------------------ | --------------------------------------------------------- |
| `DATABASE_URL`            | everything         | Shared reader DB. Required — the app has no offline mode. |
| `DB_DRIVER`               | —                  | `neon` or `pg`; auto-detected from the host otherwise.    |
| `PUBLIC_URL`              | auth + links       | This app's public origin.                                 |
| `ATPROTO_PRIVATE_KEY_JWK` | deployed sign-in   | ES256 private JWK (JSON). Not needed on localhost.        |
| `RESEND_API_KEY`          | sending            | https://resend.com/api-keys                               |
| `RESEND_WEBHOOK_SECRET`   | delivery webhooks  | `whsec_…` from the Resend dashboard; unsigned ⇒ rejected. |
| `NEWSLETTER_FROM`         | sending            | From address on a **verified** Resend domain.             |
| `NEWSLETTER_FROM_NAME`    | sending            | Display name shown in the inbox.                          |
| `HAPPYVIEW_URL`           | permissioned lists | HappyView instance origin. Unset ⇒ email-only on the DB.  |
| `HAPPYVIEW_CLIENT_KEY`    | permissioned lists | `hvc_…` API client key (sent as `X-Client-Key`).          |
| `HAPPYVIEW_CLIENT_SECRET` | permissioned lists | `hvs_…` API client secret (server-to-server).             |

## Scripts

| Script                                   | What it does                                     |
| ---------------------------------------- | ------------------------------------------------ |
| `pnpm newsletter:dev`                    | Dev server on port 3100.                         |
| `pnpm newsletter:build`                  | Production build (client + SSR into `.output/`). |
| `pnpm newsletter:start`                  | Serve the production build.                      |
| `pnpm writer:seed`                       | Seed confirmed subscribers for a publication.    |
| `pnpm newsletter:dispatch`               | Post→send trigger: mail unsent published posts.  |
| `pnpm newsletter:send`                   | Send one document by AT-URI.                     |
| `pnpm --filter standard-newsletter test` | Vitest unit suite.                               |

## Deploy (Railway)

Two services, both at the repo root:

- [`railway.newsletter.json`](../../railway.newsletter.json) — the web service
  (`pnpm newsletter:build` / `pnpm newsletter:start`, health-checked at the
  OAuth metadata route). It does **not** run `db:migrate`; the reader's web
  service owns migrations on the shared DB, so the two never race.
- [`railway.newsletter-dispatch.json`](../../railway.newsletter-dispatch.json) —
  a cron service running the dispatch (post→send) trigger every 15 minutes.

Before a first real send: verify the Resend domain, set the env vars above on
both services, and confirm the reader deploy has migrated the newsletter tables.

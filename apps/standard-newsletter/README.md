# Standard Newsletter

Turn any standard.site publication into a newsletter: each post you publish is
mailed to that publication's subscribers, and you get the readership analytics.
A TanStack Start app that shares the Standard Reader database and design system.

- **Framework:** TanStack Start + TanStack Router (file-based routes), React 19,
  Vite 8, Nitro SSR — the same toolchain as `standard-reader`.
- **Styling:** StyleX + the shared `@standard-reader/design-system`.
- **Data:** the shared Standard Reader Postgres (publications, documents) plus
  three newsletter-owned tables (`newsletter_subscribers`, `newsletter_sends`,
  `newsletter_send_events`) defined in `@standard-reader/db`.
- **Email:** Resend, with bodies rendered by `@standard-reader/renderer-email`
  (React Email components driven by the shared headless renderer).

## Two run modes

The app is designed to run with **no credentials at all** so the UI is always
explorable:

| Mode        | Trigger                       | Behavior                                                                 |
| ----------- | ----------------------------- | ------------------------------------------------------------------------ |
| **demo**    | `DATABASE_URL` unset          | Every screen renders on bundled sample data; no auth, no sending.        |
| **live**    | `DATABASE_URL` set            | Screens read real publications scoped to the signed-in user; sending on. |

Once `DATABASE_URL` is set, a failed query **surfaces** instead of silently
falling back to sample numbers — sample data is a no-DB affordance, not an error
mask.

## Local development

```bash
pnpm install
cp apps/standard-newsletter/.env.example apps/standard-newsletter/.env
pnpm newsletter:dev            # http://127.0.0.1:3100
```

With an empty `.env` you get **demo mode** — good enough for UI work.

### Running against real data

Point `DATABASE_URL` at a database that already has publications — the shared
Standard Reader dev DB, or a [Neon](https://neon.tech) branch of it. The three
newsletter tables are created by the reader's migrations (it owns migration
generation for the shared schema):

```bash
# from the repo root, against the same DATABASE_URL
pnpm db:migrate
```

Then give a publication a subscriber list so the send path has recipients:

```bash
pnpm newsletter:seed                       # lists available publication URIs
pnpm newsletter:seed at://did:plc:…/… 25   # seed 25 confirmed subscribers
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

## Environment variables

See [`.env.example`](./.env.example). Summary:

| Variable                 | Required for      | Notes                                                        |
| ------------------------ | ----------------- | ----------------------------------------------------------- |
| `DATABASE_URL`           | live mode         | Shared reader DB. Unset ⇒ demo mode on sample data.         |
| `DB_DRIVER`              | —                 | `neon` or `pg`; auto-detected from the host otherwise.      |
| `PUBLIC_URL`             | auth + links      | This app's public origin.                                   |
| `ATPROTO_PRIVATE_KEY_JWK`| deployed sign-in  | ES256 private JWK (JSON). Not needed on localhost.          |
| `RESEND_API_KEY`         | sending           | https://resend.com/api-keys                                 |
| `RESEND_WEBHOOK_SECRET`  | delivery webhooks | `whsec_…` from the Resend dashboard; unsigned ⇒ rejected.   |
| `NEWSLETTER_FROM`        | sending           | From address on a **verified** Resend domain.               |
| `NEWSLETTER_FROM_NAME`   | sending           | Display name shown in the inbox.                            |

## Scripts

| Script                         | What it does                                             |
| ------------------------------ | -------------------------------------------------------- |
| `pnpm newsletter:dev`          | Dev server on port 3100.                                 |
| `pnpm newsletter:build`        | Production build (client + SSR into `.output/`).         |
| `pnpm newsletter:start`        | Serve the production build.                              |
| `pnpm newsletter:seed`         | Seed confirmed subscribers for a publication.            |
| `pnpm newsletter:dispatch`     | Post→send trigger: mail unsent published posts.          |
| `pnpm newsletter:send`         | Send one document by AT-URI.                             |
| `pnpm --filter standard-newsletter test` | Vitest unit suite.                            |

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

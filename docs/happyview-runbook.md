# HappyView permissioned-spaces runbook (Standard Newsletter)

Standard Newsletter stores subscriber lists as **permissioned data** — an AT
Protocol Proposal 0016 record the author owns and can share with apps — instead
of only rows in our database. Native permissioned data isn't live on PDSes yet,
so we run **[HappyView](https://happyview.dev)**, an experimental 0016 AppView,
as the interim backend. This runbook stands one up on Railway and points the
newsletter at it.

> **You (not the build sandbox) run this.** Railway needs credentials the cloud
> build environment doesn't have. Everything below is a manual, one-time bring-up.

## What you get

- One **space per publication** (the space DID is the author's DID). Email
  subscribers live in the author's own `subscriberList` record; Bluesky
  subscribers write their own `subscription` record they can delete to
  unsubscribe.
- The newsletter reads the space via a short-lived credential and mirrors it
  into Postgres (`newsletter_subscribers`) — the send path is unchanged.

### Know this before you rely on it

HappyView's "permissioned repos" are **hosted in HappyView's database, not in the
subscriber's real PDS**. Consequences:

- "Delete the record from your repo" happens through HappyView's XRPC (our
  manage page, or HappyView tooling) — the data isn't in the user's normal PDS.
- Space data is **not recoverable from the network**. If the Railway volume/DB is
  lost, the subscriber lists are gone. **Back the volume up.**
- It's still 0016-shaped, so when PDS-native permission data ships we can migrate
  with the same record schemas.

HappyView is **experimental** and changes fast — pin a version and expect churn
(`ats://`→`at://`, `owner_did`→`authority_did`, `getMemberGrant`→`getDelegationToken`).

## 1. Deploy HappyView on Railway

Use HappyView's one-click templates (they include the DB + volume):

- SQLite: `https://railway.com/deploy/happyview-2-sqlite-1`
- PostgreSQL: `https://railway.com/deploy/happyview-2-postgresql`

Pick **PostgreSQL** if you want multiple replicas or larger-than-memory working
sets; **SQLite** is fine to start (the template attaches a persistent volume —
required, since the container runs as root and writes the DB file there).

## 2. Configure the HappyView service

In the HappyView service **Variables**:

| Variable               | Value                                                              |
| ---------------------- | ----------------------------------------------------------------- |
| `PUBLIC_URL`           | The service's public domain (add one under Settings → Networking). Must match exactly. |
| `SESSION_SECRET`       | `openssl rand -base64 48` (≥ 64 chars recommended).               |
| `TOKEN_ENCRYPTION_KEY` | `openssl rand -base64 32` (exactly 32 bytes). **Spaces are silently disabled without this.** |
| `DATABASE_URL`         | Set by the template (SQLite file on the volume, or the Postgres URL). |

Notes:

- The DID-resolution var is **`PLC_URL`** (default `https://plc.directory`), _not_
  `PLC_DIRECTORY_URL`.
- App listens on `3000`; health check is `GET /health`.

Then:

1. Open the public URL and log in with Bluesky — **the first login is
   bootstrapped as super user**.
2. **Enable spaces:** Settings → set `feature.spaces_enabled` to `true` (or
   `PUT /admin/settings/feature.spaces_enabled {"value":"true"}` with an admin
   key). Spaces 404 with `FeatureDisabled` until this is on.

## 3. Create the newsletter's API client

Every XRPC call needs an `X-Client-Key`. In the dashboard (or
`POST /admin/api-clients` with an `hv_` admin key), create a client:

```json
{
  "name": "Standard Newsletter",
  "client_id_url": "https://<newsletter-domain>/api/auth/atproto/metadata.json",
  "client_uri": "https://<newsletter-domain>",
  "redirect_uris": ["https://<newsletter-domain>/api/auth/atproto/callback"],
  "scopes": "atproto"
}
```

Save the returned `hvc_...` (key) and `hvs_...` (secret — shown once).

## 4. Point the newsletter at HappyView

Set on the **newsletter** web + dispatch services (see `.env.example`):

```sh
HAPPYVIEW_URL=https://<happyview-domain>
HAPPYVIEW_CLIENT_KEY=hvc_...
HAPPYVIEW_CLIENT_SECRET=hvs_...
# optional; defaults to app.standard-newsletter.list
HAPPYVIEW_SPACE_TYPE=app.standard-newsletter.list
```

When these are unset the app runs exactly as before (email-only, DB-backed) —
the permissioned-space paths no-op.

## 5. Create a space per publication

Each publication needs a space (space DID = the author's DID, `skey` = the
publication rkey). Create it as the author (their atproto OAuth session), e.g.:

```
POST {HAPPYVIEW_URL}/xrpc/com.atproto.simplespace.createSpace
X-Client-Key: hvc_...
Authorization: DPoP <author access token>
DPoP: <proof>

{
  "type": "app.standard-newsletter.list",
  "skey": "<publication rkey>",
  "displayName": "<publication name> subscribers",
  "mintPolicy": "public",
  "appAccess": { "type": "allowList", "allowed": ["<newsletter client_id_url>"] }
}
```

- `mintPolicy: public` lets any Bluesky user create their per-user repo to
  subscribe (no invites — we avoid the v3-deprecated invite extension).
- `appAccess: allowList` locks writes to our client.
- The author is auto-added as a `write` member, so their `subscriberList` record
  and the cross-service read credential both work.

## 6. Verify end to end

1. Visit `/subscribe/<pubId>`, subscribe with an email → confirm from the inbox.
2. Subscribe again with **Bluesky** → check a `app.standard-newsletter.subscription`
   record appears in that user's space repo; the app mirrors a confirmed row.
3. In Settings, **Import email subscribers** for the publication → the author's
   `subscriberList` record updates.
4. Run `pnpm newsletter:dispatch` → both the email and Bluesky subscribers
   receive the post.
5. On `/subscribe/manage`, unsubscribe the Bluesky subscription → the record is
   deleted and the mirror flips to `unsubscribed`.

## Caveats

- **Experimental / moving target** — pin the HappyView version; prefer the
  `com.atproto.space.*` / `com.atproto.simplespace.*` endpoints over the
  `dev.happyview.space.*` aliases (removed at v3).
- **Credentials are un-scoped bearer tokens** (2h) — treat the space credential
  as a secret; revoke by removing the member.
- **Back up the volume/DB** — space data is not recoverable from the network.
- `listRecords` returns metadata only; we read via `listRepoOps` (values inlined)
  to avoid the N+1.

# Sessions, state, and BFF patterns

Once the flow completes, you own a session. This file covers state lifecycle, storage, refresh scheduling, revocation, and the three architectural patterns: **backend-for-frontend (BFF)**, **pure browser SPA**, **native**.

## Session state (what must persist)

Per authenticated user, the server-side session stores:

| Field | Why |
|---|---|
| `did` | Account identifier. Never changes. Use as primary key. |
| `handle` (cache) | Display only. Re-verify periodically. |
| `access_token` | Bearer token for PDS. Expires in minutes. |
| `refresh_token` | Swap for a new access token. Single-use. |
| `access_token_expires_at` | Absolute timestamp. Drives refresh scheduling. |
| `dpop_private_key` | Bound to tokens for life of session. Lose it = lose session. |
| `issuer` | AS issuer URL. Needed for refresh. |
| `pds_url` | Cached from DID document; re-fetch if expired. |
| `scope` | Echoed from token response. Gate features. |
| `as_dpop_nonce` | Latest nonce from AS. Update on every response. |
| `pds_dpop_nonce` | Latest nonce from PDS. Update on every response. |
| `created_at`, `last_active_at` | Session hygiene + UX. |

**Never put any of this in a cookie the browser can read.** Put an opaque session ID in an HttpOnly cookie; the row lives in your server DB.

## Pre-flow state (OAuth request)

During the PAR → callback window, you also persist per-attempt state keyed by `state`:

| Field | Why |
|---|---|
| `state` | Primary key. Single-use. |
| `nonce` | Local CSRF / session cookie correlate. |
| `pkce_verifier` | Needed for token exchange. |
| `dpop_private_key` | Needed for PAR + token exchange. |
| `issuer` | Match against `iss` in callback. |
| `authorization_server` | AS metadata URL for discovery. |
| `return_to` | Optional post-login redirect target. |
| `created_at`, `expires_at` | TTL ~10 minutes. |

Delete this row as soon as you start the token exchange — single-use prevents replay.

Clean up expired rows periodically. Both Rust and TS libraries ship a `clear_expired` hook; run it on a cron.

## The BFF (backend-for-frontend) pattern

Recommended for any app with a server. The browser never touches tokens.

```
┌────────────┐            ┌───────────┐              ┌──────────┐
│  Browser   │            │   BFF     │              │  AS/PDS  │
│            │            │  (yours)  │              │          │
└────┬───────┘            └─────┬─────┘              └─────┬────┘
     │                          │                          │
     │  click "Sign in"         │                          │
     ├─────────────────────────►│                          │
     │                          │ resolve, PAR             │
     │                          ├─────────────────────────►│
     │                          │◄─────────────────────────┤
     │  302 to AS authorize     │                          │
     │◄─────────────────────────┤                          │
     │                          │                          │
     │  (user approves on AS)                              │
     │                                                     │
     │  GET /oauth/callback?code=…&state=…&iss=…           │
     ├─────────────────────────►│                          │
     │                          │ token exchange           │
     │                          ├─────────────────────────►│
     │                          │◄─────────────────────────┤
     │                          │ store session, set cookie│
     │  302 to app  + cookie    │                          │
     │◄─────────────────────────┤                          │
     │                          │                          │
     │  GET /api/feed (cookie)  │                          │
     ├─────────────────────────►│                          │
     │                          │  xrpc/getAuthorFeed      │
     │                          │  (DPoP + bearer)         │
     │                          ├─────────────────────────►│
```

Properties:

- **Client type: confidential.** Backend signs client assertions.
- **Tokens: server-only.** Browser gets a session cookie; nothing more.
- **Session cookie:** opaque ID, `HttpOnly; Secure; SameSite=Lax; Path=/`. `Lax` not `Strict` so that the OAuth callback redirect from the AS can carry the cookie.
- **Refresh:** server-side background or lazy-on-request. Transparent to the browser.
- **API calls from browser:** `/api/*` on the BFF; the BFF translates to PDS XRPC calls with DPoP + bearer.

The BFF is the simplest pattern to reason about and the most robust to XSS and token theft.

## Pure browser SPA (public client)

No backend. Tokens live in the browser. Use when:

- You have no server at all.
- You're shipping a dev tool or demo where "no backend" is a feature.

Tradeoffs:

- **Client type: public.** No client assertion, no signing key.
- **Session ≤ 14 days.** Refresh tokens also cap at 14 days.
- **Token storage:** IndexedDB (not localStorage — access from workers, more private). The `@atproto/oauth-client-browser` library persists sessions to IndexedDB automatically.
- **XSS exposure:** any XSS on your origin gets the tokens. Lock down CSP.
- **Multi-tab sync:** `@atproto/oauth-client-browser` emits events (`'updated'`, `'deleted'`) for sibling tabs to react to refresh and logout.
- **DPoP key in browser:** generated via WebCrypto `crypto.subtle.generateKey`. Non-exportable preferred, but then you can't store it across reload — the library typically stores exportable keys in IndexedDB.

SPAs are legitimate but harder to get right. If you have a backend, use BFF.

## Native mobile

- **Client type: public** in almost all cases. A confidential client needs a server-resident signing key; distributing one inside the app bundle defeats the purpose.
- **Redirect URI: custom scheme** (`com.example.app:/callback`) or Apple Universal Link.
- **Token storage:** OS keystore — Keychain (iOS), Keystore (Android).
- **Consent-screen trust:** native clients can't prove ownership of the host the way a web client can; ASes treat them as public/untrusted and will not display `client_name`/`logo_uri` to users.

Native flows are public-client flows with different redirect plumbing. Session lifetimes are the same as web SPA.

## Hybrid (BFF-assisted mobile)

Common pragma: mobile app authenticates the user through the BFF instead of directly with the AS. The BFF acts as the confidential client; the mobile app has a session with the BFF, not with the AS. Tokens never leave the BFF.

Pros: longer sessions, less token handling in the client.

Cons: now your BFF is the AS from the app's perspective. Requires careful scope design on the BFF-to-AS hop. Not covered by the AT Proto profile directly — this is "your BFF is a regular API server".

## Refresh scheduling

Refresh when the access token is within ~5 minutes of expiry. Two styles:

- **Lazy**: check `access_token_expires_at` at request time; if close, refresh inline. Simple. Adds latency to user-facing requests.
- **Proactive background**: a timer wakes up before expiry and refreshes. Keeps request latency flat but needs per-session scheduling state.

The Smoke Signal reference BFF in Rust uses lazy refresh in middleware — check on every inbound request, refresh before dispatching. See `rust/sessions.md`.

## Concurrency: the refresh race

Two concurrent requests both see an expired access token, both attempt to refresh, both succeed. Now the server has issued two new refresh tokens but only the last one is valid. The other session copy is dead.

Mitigations:

- **Per-session mutex** around refresh. One in-flight refresh at a time.
- **Single-flight pattern** with result broadcast.
- Database row-level lock on the session row during refresh.

Concurrency footgun count: 1. This one bug has eaten weeks of engineer time across the AT Proto ecosystem.

## Logout

Two layers (see `flows.md` §G):

1. **Local logout** — delete session row, expire session cookie. Always do this.
2. **Server-side revocation** — POST `/oauth/revoke` with the refresh token. Optional; the AT Proto profile does not mandate that ASes implement it. Attempt and ignore 404/405.

Revoking the refresh token invalidates the whole session at the AS. Revoking only the access token leaves the refresh token usable — don't bother.

## Session cookie details

```
Set-Cookie: session=<opaque-id>;
  Domain=example.com;
  Path=/;
  HttpOnly;
  Secure;
  SameSite=Lax;
  Max-Age=31536000   # 1 year or whatever your policy is
```

- **`SameSite=Lax` is mandatory — `Strict` breaks OAuth.** The callback from the authorization server is a cross-origin top-level navigation. Browsers drop `SameSite=Strict` cookies on that hop, so your callback handler sees no session cookie, cannot correlate the PKCE verifier, and fails with "unknown state." `Lax` allows the cookie to ride a top-level navigation while still blocking iframe and XHR cross-origin sends. Set `Lax` explicitly — the browser default varies.
- `HttpOnly`: no JS access. The browser gets no visibility into tokens.
- `Secure`: HTTPS only.
- `Max-Age` / `Expires`: long (months to a year) is fine — the cookie is the session ID, not the token; revocation is DB-side.

Sign or encrypt the cookie value. Axum's `PrivateCookieJar`, `cookie-session` in Node, `gorilla/sessions` in Go all provide this.

**Two-cookie pattern** (optional):

- `session` — HttpOnly, carries the opaque session ID for DB lookup.
- `identity` — **not** HttpOnly, carries `{did, handle, pds}` for browser-side display. Read-only metadata; no secrets. Useful for UI rendering without round-tripping to the server.

Never put tokens in the identity cookie.

## Multi-account

A user who has logged into two DIDs has two sessions. Common approaches:

- **One session cookie, user selects.** Session row has `dids: [did1, did2]` + `active_did`. UI picks. Simplest for BFFs.
- **Cookie jar per DID.** Multiple session cookies, each with its own DB row. More state, more complexity.
- **Account-switcher URL scheme.** `/app/@alice.bsky.social/feed` vs `/app/@bob.bsky.social/feed` — URL carries the active DID, session cookie resolves to the full set.

The Rust `OAuthRequestStorage` trait and the TypeScript `SessionStore` interface both key by `sub` (the DID), so you can store multiple concurrent sessions under different DIDs without conflict.

## Key considerations

- **Rotate signing keys periodically** (confidential clients). See `client-metadata.md` §Key rotation.
- **Re-resolve the PDS** when the DID document TTL expires or on `invalid_token`. Accounts can migrate PDS.
- **Verify handle bidirectionally** on login and again periodically — handles can be transferred or invalidated (`handle.invalid`).
- **Log out aggressively on `invalid_grant`.** It means the session is dead at the AS. Don't retry; surface to user.
- **Never log tokens.** Not even redacted-last-N-chars. They're short-lived but while live they're the credential.

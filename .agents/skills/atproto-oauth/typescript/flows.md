# TypeScript — Flows

`NodeOAuthClient` and `BrowserOAuthClient` wrap the multi-step OAuth dance (discovery → PAR → authorize → callback → token exchange → refresh) into three methods: `authorize`, `callback`, `restore`. This file walks through each in both Node and Browser. For the wire-level content of each step, see `../shared/flows.md`.

## Node — Authorize (begin flow)

```ts
app.post('/oauth/login', async (req, res) => {
  const handle = req.body.handle              // 'alice.bsky.social'
  const url = await client.authorize(handle, {
    scope: 'atproto transition:generic',
    state: crypto.randomUUID(),               // opaque app-side value
  })
  res.redirect(url.toString())
})
```

Under the hood:

1. Resolves `handle` → DID → PDS → AS (uses the `handleResolver` you configured).
2. Generates PKCE verifier + challenge, nonce, DPoP keypair.
3. Mints a client assertion JWT (`private_key_jwt` with your `keyset[0]`).
4. POSTs PAR to the AS's `pushed_authorization_request_endpoint`. Handles DPoP nonce retry.
5. Writes pre-flow state to your `stateStore` keyed by the opaque `state` value.
6. Returns a `URL` to `{AS}/oauth/authorize?client_id=...&request_uri=urn:ietf:params:oauth:request_uri:...`.

Your only visible input is `handle` + `options`. Options worth passing:

- `scope` — space-separated string. Must start with `atproto`.
- `state` — opaque value the library threads through. You'll get it back in `callback`.
- `prompt` — `'login'` to force re-auth, `'consent'` to re-show consent.
- `ui_locales` — language hints.

## Node — Callback

```ts
app.get('/oauth/callback', async (req, res) => {
  const params = new URLSearchParams(req.url.split('?')[1])
  const { session, state } = await client.callback(params)
  // session.did      — verified DID (do NOT trust the redirect-back params for this)
  // session.handle   — current handle
  // session.aud      — intended audience (PDS URL)
  // state            — the opaque value from authorize()

  req.session.user_did = session.did         // HttpOnly cookie session
  res.redirect('/')
})
```

Under the hood:

1. Reads `state` + `iss` + `code` from the query string.
2. Looks up pre-flow state from your `stateStore`. Throws if not found / expired.
3. Verifies `iss` matches the AS from pre-flow state (prevents issuer-mixup).
4. POSTs the code to `token_endpoint` with PKCE verifier + fresh DPoP proof + client assertion.
5. Verifies `aud == PDS URL`, `sub` resolves to a DID whose document names the AS.
6. Writes session via `sessionStore.set(sub, sessionData)`.
7. Deletes the pre-flow state (single-use).
8. Returns `OAuthSession` (the live handle, not just data) + original `state`.

**What you get back:** the `session` is a live object. Call `session.getFetchHandler()` or construct `new Agent(session)` — you don't ferry raw tokens.

## Node — Restore (subsequent requests)

```ts
app.get('/api/feed', async (req, res) => {
  const did = req.session.user_did
  if (!did) return res.status(401).end()

  const session = await client.restore(did)   // auto-refreshes if needed
  const agent = new Agent(session)
  const { data } = await agent.app.bsky.feed.getTimeline()
  res.json(data)
})
```

Under the hood:

1. `sessionStore.get(did)` → stored session data.
2. If `expiresAt` within the refresh window (library default ~5 min), acquires `requestLock(did, fn)` and refreshes.
3. After refresh: `sessionStore.set(did, newData)`.
4. Returns an `OAuthSession` with a `fetchHandler` that auto-signs DPoP per request.

**`requestLock` is load-bearing.** Without it, two concurrent requests refresh in parallel, the first invalidates the refresh token for the second, the second's write lands last with a dead token, and the next request fails permanently. See `sessions.md` §refresh race.

## Node — Revoke / logout

```ts
app.post('/oauth/logout', async (req, res) => {
  const did = req.session.user_did
  if (did) {
    await client.revoke(did)          // best-effort POST to revocation_endpoint
    req.session.destroy(() => {})
  }
  res.redirect('/')
})
```

`client.revoke(did)` also deletes the session from `sessionStore`. Ignore any error — the AS's revocation endpoint is optional.

## Browser — Sign in

```ts
import { BrowserOAuthClient } from '@atproto/oauth-client-browser'

const client = await BrowserOAuthClient.load({
  clientId:        'https://spa.example.com/oauth-client-metadata.json',
  handleResolver:  'https://api.bsky.app',
})
```

`BrowserOAuthClient.load(...)` is async because it fetches `clientId` on initialization. Do it once at module load.

```ts
// When user clicks Sign in:
await client.signIn('alice.bsky.social', {
  scope:       'atproto transition:generic',
  prompt:      'login',
  ui_locales:  'en',
  state:       'opaque-app-state',
})
// ^ Never returns — window.location is replaced to the AS's authorize URL.
```

The library stores PKCE + DPoP state in IndexedDB before navigating.

## Browser — Init (on page load)

```ts
const result = await client.init()

if (!result) {
  // Not signed in. Show sign-in UI.
  return
}

if (result.session) {
  // Either restoring an existing session OR just completed a callback.
  const agent = new Agent(result.session)
  // result.state is the opaque string you passed to signIn (present only on callback)
}
```

`client.init()` does three things at once:

1. If `window.location.pathname === redirect path` and query has `code`+`state`, runs the callback exchange. Then replaces `history.state` to strip the query (so a refresh doesn't re-run the callback).
2. Otherwise, looks in IndexedDB for an existing session and restores it (auto-refreshes if close to expiry).
3. Returns `{ session, state? }` or `null`.

**Call `init()` once, on every page load, before any UI depends on auth.**

## Browser — Sign out

```ts
await client.signOut(did)
// Removes from IndexedDB + revokes at AS (best-effort).
// Sibling tabs receive the 'deleted' event.
```

## Browser — Cross-tab sync

```ts
client.addEventListener('updated', (e) => {
  // Session data changed (refresh, new session). Re-read data.
  const session = e.detail.session
})

client.addEventListener('deleted', (e) => {
  // Session removed (sign-out, or refresh failed irrecoverably).
  // Drop caches, show sign-in UI.
})
```

Uses `BroadcastChannel` internally. Don't cache session state in local variables — always read via the event or `client.restore()`.

## Error handling — what to catch

The three methods throw typed errors. Catch on the constructor, not the message.

```ts
import {
  OAuthResponseError,        // AS returned 4xx with structured body (e.g. access_denied)
  OAuthCallbackError,        // callback-specific: state unknown, code exchange failed
  TokenRefreshError,         // refresh failed permanently (invalid_grant etc.)
} from '@atproto/oauth-client-node'     // same names in -browser

try {
  await client.callback(params)
} catch (e) {
  if (e instanceof OAuthResponseError) {
    // e.error == 'access_denied' | 'invalid_request' | ...
    // e.errorDescription, e.status available
  } else if (e instanceof OAuthCallbackError) {
    // Usually: state is unknown (expired/replay) or PKCE mismatch
  }
  throw e
}
```

For refresh failures (stored session becomes dead), `restore()` throws `TokenRefreshError` — delete the session and prompt re-login.

## Common pitfalls

- **Trusting query-string DID over `session.did`.** `session.did` is the **verified** DID (from the AS's id-token `sub`, cross-checked against DID doc). Never read `did` from the URL.
- **Skipping `iss` check.** The library does this for you; don't write your own callback handler that bypasses it.
- **No `requestLock` on Node.** In a multi-process BFF, the default in-process lock doesn't cross instances. Use Redis (`ioredis` + `redlock`) or a Postgres advisory lock.
- **Running `client.init()` multiple times.** The callback exchange is single-use. Guard with a module-level boolean or ensure `init()` runs exactly once per page load.
- **Catching all errors as `Error`.** Loses the typed error structure; you can't distinguish "user cancelled" (`access_denied`) from "our request was malformed" (`invalid_request`).
- **Hard-coding the PDS or AS URL.** Resolution is mandatory — different users are on different PDSes, and PDSes can migrate. `handleResolver` exists precisely so you don't hard-code.

## See also

- `README.md` — package setup, full Node BFF sketch.
- `dpop.md` — how DPoP + nonce retry are handled internally.
- `sessions.md` — `StateStore` / `SessionStore` / `requestLock` contracts.
- `../shared/flows.md` — byte-level wire content for each step.
- `../shared/troubleshooting.md` — diagnosing the common callback failures.

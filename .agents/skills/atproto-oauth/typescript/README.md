# TypeScript — `@atproto/oauth-client-*` setup

The official TypeScript stack is three companion packages, one per runtime target:

| Package                          | Runs in      | Client type          | Use when…                                |
| -------------------------------- | ------------ | -------------------- | ---------------------------------------- |
| `@atproto/oauth-client-node`     | Node.js      | Confidential (BFF)   | You have a backend. **Default choice.**   |
| `@atproto/oauth-client-browser`  | Browser      | Public (SPA)         | No backend; SPA shipping tokens to the browser. |
| `@atproto/oauth-client`          | Any          | Base class           | Internal/shared use; rarely import directly. |

All three share types from `@atproto/oauth-types`. The implementations live in the `bluesky-social/atproto` monorepo under `packages/oauth/`.

## Install

### Node (confidential BFF)

```json
{
  "dependencies": {
    "@atproto/oauth-client-node": "^0.3",
    "@atproto/api": "^0.13"
  }
}
```

### Browser (public SPA)

```json
{
  "dependencies": {
    "@atproto/oauth-client-browser": "^0.3",
    "@atproto/api": "^0.13"
  }
}
```

Bundler: Vite or webpack with `browser` condition. The browser package uses `WebCrypto` + `IndexedDB`; no polyfills required on modern evergreen browsers.

## Public surface at a glance

### Node

```ts
import {
  NodeOAuthClient,
  NodeSavedState,
  NodeSavedSession,
  type StateStore,
  type SessionStore,
} from '@atproto/oauth-client-node'

// Key methods on NodeOAuthClient:
client.clientMetadata                // ClientMetadata — hand to /oauth-client-metadata.json
client.jwks                          // { keys: [...] } — hand to /jwks.json
client.authorize(handle, { scope, state })        // → URL to redirect to
client.callback(params)              // → { session, state }  after AS redirect
client.restore(did)                  // → OAuthSession | undefined (refreshes if needed)
client.revoke(did)                   // best-effort revoke at AS
```

### Browser

```ts
import { BrowserOAuthClient } from '@atproto/oauth-client-browser'

const client = await BrowserOAuthClient.load({ clientId, handleResolver })
client.signIn(handle, options)        // → never (page navigates to AS)
await client.init()                   // on page load → { session? } or null
client.addEventListener('updated', e => ...)
client.addEventListener('deleted', e => ...)
client.signOut(did)
```

## Typical wiring — Node BFF

```ts
import express from 'express'
import { NodeOAuthClient } from '@atproto/oauth-client-node'
import { JoseKey } from '@atproto/jwk-jose'

const client = new NodeOAuthClient({
  clientMetadata: {
    client_id: 'https://app.example.com/oauth-client-metadata.json',
    client_name: 'Example App',
    client_uri: 'https://app.example.com',
    redirect_uris: ['https://app.example.com/oauth/callback'],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    scope: 'atproto transition:generic',
    token_endpoint_auth_method: 'private_key_jwt',
    token_endpoint_auth_signing_alg: 'ES256',
    dpop_bound_access_tokens: true,
    application_type: 'web',
    jwks_uri: 'https://app.example.com/jwks.json',
  },
  keyset: await Promise.all([
    JoseKey.fromImportable(process.env.PRIVATE_KEY_1!, 'key-1'),
    JoseKey.fromImportable(process.env.PRIVATE_KEY_2!, 'key-2'),  // rotation
  ]),
  stateStore: myStateStore,       // 10-min pre-flow state (keyed by `state`)
  sessionStore: mySessionStore,   // per-DID session (keyed by `sub`)
  requestLock: myRequestLock,     // serializes refresh per DID — single most important knob
})

const app = express()

app.get('/oauth-client-metadata.json', (_req, res) =>
  res.json(client.clientMetadata))

app.get('/jwks.json', (_req, res) => res.json(client.jwks))

app.post('/oauth/login', async (req, res) => {
  const url = await client.authorize(req.body.handle, {
    scope: 'atproto transition:generic',
    state: /* opaque app-side state, threaded through */
  })
  res.redirect(url.toString())
})

app.get('/oauth/callback', async (req, res) => {
  const params = new URLSearchParams(req.url.split('?')[1])
  const { session, state } = await client.callback(params)
  // session.did is the verified DID
  // set HttpOnly session cookie → DID → use client.restore(did) on future requests
  req.session.did = session.did
  res.redirect('/')
})

app.get('/api/feed', async (req, res) => {
  const session = await client.restore(req.session.did)   // refreshes if needed
  const agent = new Agent(session)
  const { data } = await agent.app.bsky.feed.getTimeline()
  res.json(data)
})
```

The three store interfaces (`StateStore`, `SessionStore`, `NodeRequestLock`) are what you implement. Each is a tiny async interface — see `sessions.md`.

## Typical wiring — Browser SPA

```ts
import { BrowserOAuthClient } from '@atproto/oauth-client-browser'
import { Agent } from '@atproto/api'

const client = await BrowserOAuthClient.load({
  clientId: 'https://spa.example.com/oauth-client-metadata.json',
  handleResolver: 'https://api.bsky.app',  // or a custom resolver
})

// On page load:
const result = await client.init()
if (result?.session) {
  // Already signed in.
  const agent = new Agent(result.session)
  /* ... */
} else if (window.location.pathname === '/oauth/callback') {
  // In a callback tab; client.init() handled params + exchanged tokens.
  // `result` is defined; its `.state` echoes what was passed to `signIn`.
}

// When user clicks Sign in:
await client.signIn('alice.bsky.social', {
  scope: 'atproto transition:generic',
  prompt: 'login',
  ui_locales: 'en',
  state: 'opaque-app-state',
})
// ^ never returns; window.location changes to the AS.

// Cross-tab sync:
client.addEventListener('updated', e => { /* reload cached data */ })
client.addEventListener('deleted', e => { /* sign out UI */ })
```

Browser client stores sessions in IndexedDB automatically. Token refresh is transparent on `restore()`.

## Idioms specific to TypeScript

- **ESM only.** All three packages are `"type": "module"`. Node ≥18 or a bundler with ESM support.
- **Handle resolution is injected.** Both clients require a `handleResolver` (a URL to an AppView or a function). The crate doesn't ship DNS resolvers — it delegates. For SPA, use `https://api.bsky.app`; for Node, use `@atproto-labs/handle-resolver-node` or roll your own.
- **DPoP is invisible.** You never mint a DPoP proof directly. The `Agent` returned by the client's `session.fetchHandler` signs every XRPC request, handles nonce retry, and tracks per-origin nonces.
- **Refresh serialization via `requestLock`.** Node only. A callback you provide that takes a key + an async function and ensures only one runs at a time per key. The default lock is in-process; for multi-node BFF you must provide a distributed lock (Redis, database advisory lock).
- **Errors are typed.** `TokenRefreshError`, `OAuthResponseError`, `WellKnownHandleResolverError`, etc. Catch on the type, not the message.
- **Cross-tab sync in browser.** `BroadcastChannel` is used; the `updated` / `deleted` events fire on sibling tabs. Don't cache session state across tabs — subscribe to these.

Link to `../shared/divergence-matrix.md` for comparison against Rust and Go. Highlights: TS is the only stack with a first-class SPA client; the Rust crate is the only one that exposes a scope-AST parser; Go's `indigo` is BFF-only.

## File map

| Task                                            | File                 |
| ----------------------------------------------- | -------------------- |
| Serving `/oauth-client-metadata.json` + `/jwks.json` | `client-metadata.md` |
| `signIn` / `callback` / `restore` flow          | `flows.md`           |
| How DPoP is handled internally; custom fetch handlers | `dpop.md`        |
| `StateStore` / `SessionStore` / `requestLock` + IndexedDB SPA store | `sessions.md` |

## See also

- `../shared/spec.md` — normative rules.
- `../shared/divergence-matrix.md` — differences from Rust and Go.
- Upstream docs: <https://atproto.com/guides/sdk-auth>, package README for `@atproto/oauth-client-node`.
- Upstream example: <https://github.com/bluesky-social/atproto/tree/main/packages/oauth>

# TypeScript — DPoP (invisible by design)

The `@atproto/oauth-client-*` packages handle DPoP entirely inside the `fetchHandler` they return. You never mint a proof directly, never manage nonces, never re-sign on retry. This file describes what they do so you can debug it, extend it (custom fetch middleware), or understand the `invalid_dpop_proof` failures you see in logs. For the RFC 9449 rules, see `../shared/dpop.md`.

## The `fetchHandler` contract

Both `NodeOAuthClient` and `BrowserOAuthClient` expose an `OAuthSession` object with a `fetchHandler` that is drop-in compatible with `fetch`:

```ts
const session = await client.restore(did)

// Usable directly:
const res = await session.fetchHandler(url, { method: 'GET' })

// Or wrapped in the Agent helper:
import { Agent } from '@atproto/api'
const agent = new Agent(session)
await agent.app.bsky.feed.getTimeline()
```

Every call through `fetchHandler`:

1. Adds `Authorization: DPoP <access_token>` header.
2. Mints a fresh DPoP proof with `htm`, `htu`, `ath=SHA-256(access_token)`, fresh `jti`, and (if cached) `nonce` for that origin.
3. Sends the request.
4. On `401`/`400` with `DPoP-Nonce` response header or `use_dpop_nonce` body, caches the new nonce, re-mints, retries once.
5. Stores the server's latest nonce in a per-origin cache keyed by origin (AS vs PDS are separate).

The DPoP keypair is generated at session creation and stored alongside the session data (in `SessionStore` for Node, IndexedDB for Browser). It is **immortal for the life of that session** — rotating it invalidates the access and refresh tokens.

## Per-origin nonce cache

The library keeps a `Map<origin, string>` of the most-recent nonce per origin. Two consequences:

- The first request to a new origin pays a retry (no cached nonce → server issues one → retry with it).
- If you drop a `fetchHandler` and build a new one, you lose the cache. Reuse the session's handler across the request's lifetime rather than creating a new one per call.

For the Browser client, the cache is in-memory per tab. Cross-tab sharing of nonces is **not** implemented — each tab pays its own first-request retry. This is acceptable because nonces rotate frequently anyway.

For the Node client, the cache is in-memory per process. Multi-node BFFs will each pay their own warm-up retry. Don't try to sync nonces across nodes — it's not worth it.

## Custom `fetch` middleware

Pass a custom fetch to intercept every outbound request (for logging, metrics, timeouts):

```ts
import { NodeOAuthClient } from '@atproto/oauth-client-node'

const client = new NodeOAuthClient({
  // ... other options ...
  fetch: async (req) => {
    const start = performance.now()
    const res = await fetch(req)
    console.log(`${req.method} ${req.url} → ${res.status} in ${performance.now() - start}ms`)
    return res
  },
})
```

This wraps the underlying transport; the library still handles DPoP on top. **Don't** try to read or modify the DPoP header here — it's a single-use proof with an already-computed signature.

## Reading the DPoP proof (debugging only)

If you need to inspect a proof in flight, add a fetch wrapper that logs headers:

```ts
fetch: async (req) => {
  console.log('DPoP:', req.headers.get('DPoP'))
  console.log('Auth:', req.headers.get('Authorization'))
  return fetch(req)
}
```

Then decode the DPoP JWT with a JWT debugger (or `jose`'s `decodeJwt`):

```ts
import { decodeJwt, decodeProtectedHeader } from 'jose'
const header = decodeProtectedHeader(dpopJwt)
const claims = decodeJwt(dpopJwt)
// header: { typ: 'dpop+jwt', alg: 'ES256', jwk: { kty, crv, x, y } }
// claims: { jti, htm: 'GET', htu: '...', iat, exp, ath: '...', nonce? }
```

Use this when you see `invalid_dpop_proof` from a PDS — compare `htu` to the actual URL the PDS thinks it received (with / without default port, query string, trailing slash).

## Browser — `ath` and subresource integrity

The Browser client's `ath` (access-token hash) is computed via `crypto.subtle.digest('SHA-256', accessTokenBytes)` → base64url (no padding). If you're running in a context where `crypto.subtle` is unavailable (ancient iframe, non-secure origin), the whole stack fails to initialize. Must be HTTPS or `http://localhost`.

## Node — no custom Node fetch

On Node 18+ the library uses global `fetch` (undici). If you pass your own `fetch` via the `fetch:` option, it must match the WHATWG fetch signature — `node-fetch` v3 works, v2 doesn't (wrong Request/Response shape).

## Server-side DPoP validation

`@atproto/oauth-client-*` are **client** packages. They don't validate incoming DPoP proofs. If you're building an AS or resource server in TypeScript:

- Roll your own with `jose`: verify JWT, check `typ=dpop+jwt`, check `htm`/`htu`/`iat`/`exp`, compute thumbprint.
- The validation rules live in `../shared/dpop.md` §server-side.
- `jti` replay protection must be your own — keep a bounded TTL cache keyed by `(thumbprint, jti)`.

No public library exports `validateDpopJwt` today; AT Proto AS implementations (the PDS) do this in Go/Python, not TypeScript.

## What the Agent does on top

`new Agent(session)` wraps the session's `fetchHandler` into a lexicon-typed XRPC client:

```ts
const agent = new Agent(session)
await agent.app.bsky.feed.getTimeline({ limit: 30 })
// ↓ compiles to:
// session.fetchHandler('https://pds/xrpc/app.bsky.feed.getTimeline?limit=30', ...)
```

No extra auth logic — the `Agent` is purely a codegen shell over the handler. If auth fails, you'll see typed errors from `@atproto/api` that wrap the underlying `OAuthResponseError`.

## Common pitfalls

- **Recreating a fresh `Agent` for each request.** Keep it alive — the nonce cache lives on the session's handler. Recreating drops cached nonces → every call pays a retry.
- **Proxying `fetchHandler` output and modifying headers.** Don't touch the DPoP header. If you need to add instrumentation headers, add them upstream of `fetchHandler` via the `fetch:` option.
- **Serving your app over plain HTTP.** Browser DPoP requires `crypto.subtle`, which requires a secure context. Dev with `localhost` works; dev with a `192.168.x.x` IP doesn't.
- **Mixing `Bearer` and `DPoP` auth.** Never send `Authorization: Bearer <token>` for a DPoP-bound session. The whole point is sender constraining. The library always uses `DPoP <token>`.
- **Long-lived, shared `OAuthSession` across multiple DIDs.** One session = one DID = one DPoP keypair. Don't reuse an agent across users.
- **Hoping the library caches nonces across processes.** It doesn't. If you're autoscaling BFF instances, each pays its own warm-up. Acceptable — don't optimize prematurely.

## See also

- `README.md` — package surface.
- `flows.md` — where DPoP enters the flow (auth endpoints AND resource endpoints).
- `sessions.md` — DPoP key lifetime bound to the session.
- `../shared/dpop.md` — RFC 9449 rules and nonce-dance diagram.
- `../shared/test-vectors.md` §V6–V8 — proof-shape vectors.
- `../shared/troubleshooting.md` §`invalid_dpop_proof` — diagnosis checklist.

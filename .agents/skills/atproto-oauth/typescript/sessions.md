# TypeScript — State, sessions, and storage

`NodeOAuthClient` requires three injected interfaces: `stateStore` (10-minute pre-flow state), `sessionStore` (long-lived per-DID sessions), and `requestLock` (refresh serialization). `BrowserOAuthClient` uses IndexedDB automatically — no injection needed. This file is the implementation guide for Node, plus notes on what the Browser does under the hood. For the shape and lifecycle of each, see `../shared/sessions.md`.

## The three interfaces (Node)

```ts
import type {
  NodeSavedState, NodeSavedSession,
  StateStore, SessionStore,
  NodeRequestLock,
} from '@atproto/oauth-client-node'

interface StateStore {
  set(key: string, value: NodeSavedState): Promise<void>
  get(key: string): Promise<NodeSavedState | undefined>
  del(key: string): Promise<void>
}

interface SessionStore {
  set(sub: string, value: NodeSavedSession): Promise<void>
  get(sub: string): Promise<NodeSavedSession | undefined>
  del(sub: string): Promise<void>
}

type NodeRequestLock = <T>(key: string, fn: () => Promise<T>) => Promise<T>
```

All values are plain objects — the library serializes to JSON internally. Your implementation's job is storage + retrieval by key.

## In-memory (dev only)

```ts
const stateStore: StateStore = {
  store: new Map<string, NodeSavedState>(),
  async set(k, v) { this.store.set(k, v) },
  async get(k)    { return this.store.get(k) },
  async del(k)    { this.store.delete(k) },
} as StateStore & { store: Map<string, NodeSavedState> }
```

Good for unit tests. Do not ship.

## Redis-backed `stateStore`

```ts
import Redis from 'ioredis'
const redis = new Redis(process.env.REDIS_URL!)

const stateStore: StateStore = {
  async set(key, value) {
    await redis.set(`oauth:state:${key}`, JSON.stringify(value), 'EX', 600)
  },
  async get(key) {
    const raw = await redis.get(`oauth:state:${key}`)
    return raw ? JSON.parse(raw) : undefined
  },
  async del(key) {
    await redis.del(`oauth:state:${key}`)
  },
}
```

TTL of 600s (10 minutes) matches the AS's PAR expiry. Redis handles expiry for you — no cron needed.

## Postgres-backed `sessionStore`

```ts
import { Pool } from 'pg'
const pool = new Pool({ connectionString: process.env.DATABASE_URL })

// Schema:
// CREATE TABLE oauth_sessions (
//   sub            TEXT PRIMARY KEY,
//   data           JSONB NOT NULL,
//   updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
// );

const sessionStore: SessionStore = {
  async set(sub, value) {
    await pool.query(
      `INSERT INTO oauth_sessions (sub, data, updated_at)
       VALUES ($1, $2, NOW())
       ON CONFLICT (sub) DO UPDATE SET data = $2, updated_at = NOW()`,
      [sub, value],
    )
  },
  async get(sub) {
    const { rows } = await pool.query(
      'SELECT data FROM oauth_sessions WHERE sub = $1',
      [sub],
    )
    return rows[0]?.data
  },
  async del(sub) {
    await pool.query('DELETE FROM oauth_sessions WHERE sub = $1', [sub])
  },
}
```

Encrypt `data` at rest — it contains the refresh token and the DPoP private key JWK. Use `pgcrypto`, envelope encryption, or application-level AEAD.

## `requestLock` — the load-bearing primitive

```ts
type NodeRequestLock = <T>(key: string, fn: () => Promise<T>) => Promise<T>
```

The library calls this whenever it refreshes a session. `key` is the DID. `fn` does the refresh work. Must run `fn` to completion while holding the lock for `key`; concurrent calls for the same key must serialize.

### In-process (default)

If you don't provide `requestLock`, the library uses an in-process promise map — fine for a single Node process:

```ts
// What the library does internally:
const inFlight = new Map<string, Promise<unknown>>()
const defaultLock: NodeRequestLock = async (key, fn) => {
  const existing = inFlight.get(key)
  if (existing) { await existing.catch(() => {}); return fn() }
  // ^ simplified; real impl re-reads state to avoid double refresh.
}
```

### Redis / Redlock (multi-node)

```ts
import Redlock from 'redlock'
const redlock = new Redlock([redis], { retryCount: 10, retryDelay: 200 })

const requestLock: NodeRequestLock = async (key, fn) => {
  const lock = await redlock.acquire([`oauth:refresh-lock:${key}`], 30_000)
  try {
    return await fn()
  } finally {
    await lock.release().catch(() => {})
  }
}
```

TTL of 30s is a generous ceiling for refresh (normally <2s). `retryCount: 10 * retryDelay: 200` = ~2s max wait — tune for your concurrency.

### Postgres advisory lock (if you already have PG)

```ts
const requestLock: NodeRequestLock = async (key, fn) => {
  const hash = hashToBigint(key)                  // pg_advisory_lock takes bigint
  const client = await pool.connect()
  try {
    await client.query('SELECT pg_advisory_lock($1)', [hash])
    return await fn()
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [hash]).catch(() => {})
    client.release()
  }
}
```

Cheap, transactional, no extra infra. Use this if you're already on Postgres.

## Session data contents

What the library stores in `sessionStore.set(sub, value)`:

```ts
interface NodeSavedSession {
  dpopJwk:            JWK              // the client's DPoP private key
  tokenSet: {
    sub:              string           // DID
    aud:              string           // PDS URL
    iss:              string           // AS URL
    scope:            string
    access_token:     string
    refresh_token?:   string
    token_type:       'DPoP'
    expires_at:       string           // ISO-8601
  }
}
```

**Everything in here is secret.** The `refresh_token` + `dpopJwk` together = full account access. Encrypt at rest. Never log the full object.

## Browser — IndexedDB (automatic)

`BrowserOAuthClient` stores sessions in an IndexedDB database named `@atproto-oauth-client`. Two stores:

- `state` — pre-flow state (same shape as Node's `StateStore`, TTL 10 min).
- `session` — post-flow sessions (keyed by DID).

You can inspect it in DevTools → Application → IndexedDB. You can also clear it to force re-auth (or call `client.signOut(did)`).

The browser library listens to `storage` events and `BroadcastChannel` to sync across tabs. Don't write to the IndexedDB store manually — use the client API.

**IndexedDB persistence is load-bearing across reloads.** The per-origin DPoP nonces issued by the AS and PDS are stored in the same IndexedDB database as the session itself. If you clear IndexedDB — either manually in DevTools, or programmatically as part of a "reset" flow — you drop the nonces along with the session, and the next request pays a round-trip to re-prime the nonce (plus one `use_dpop_nonce` retry). Do not clear IndexedDB on logout; call `client.signOut(did)` instead, which removes the session entry but leaves the nonce cache intact for the next login.

## Session hand-off BFF → browser

In a BFF pattern (Node back-end, browser front-end), the browser never sees the OAuth tokens. Instead:

1. Callback handler sets an HttpOnly cookie containing an **app-specific session ID** (not the access token).
2. Browser sends the cookie on every request.
3. BFF middleware looks up the session ID → DID, calls `client.restore(did)`, uses the resulting `Agent` server-side.

Example middleware:

```ts
import session from 'express-session'

app.use(session({
  secret:  process.env.SESSION_SECRET!,
  resave:  false,
  saveUninitialized: false,
  cookie:  { httpOnly: true, secure: true, sameSite: 'lax', maxAge: 30 * 24 * 60 * 60 * 1000 },
}))

app.use(async (req, res, next) => {
  if (!req.session.user_did) return next()
  try {
    req.oauthSession = await client.restore(req.session.user_did)
    next()
  } catch (e) {
    if (e instanceof TokenRefreshError) {
      req.session.destroy(() => res.redirect('/login'))
    } else {
      next(e)
    }
  }
})
```

See `../shared/sessions.md` §BFF for the pattern rationale.

## Two-cookie variant

If you need a DID accessible to the front-end (for display), set two cookies:

```ts
// Encrypted session cookie (HttpOnly) — contains session_id → DID mapping
res.cookie('session', encryptedSessionId, {
  httpOnly: true, secure: true, sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
})

// Identity cookie (readable by JS) — just display data
res.cookie('identity', JSON.stringify({ did, handle, pds_url }), {
  httpOnly: false, secure: true, sameSite: 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
})
```

The identity cookie holds no secrets; the session cookie is the authority. Never trust the identity cookie on the server side — always derive from the session cookie.

## Session cookie settings

```ts
{
  httpOnly: true,
  secure:   true,              // HTTPS only; dev: set to false only for localhost
  sameSite: 'lax',             // NOT 'strict' — OAuth callback is cross-origin
  maxAge:   30 * 24 * 60 * 60 * 1000,   // 30 days (long enough for refresh cycle)
  path:     '/',
}
```

**`SameSite: 'lax'`, not `'strict'`.** The AS callback is a cross-origin top-level navigation; `strict` drops the cookie and your `callback` handler can't find the pre-flow state. See `../shared/troubleshooting.md` §"Cookie not sent on callback".

## Logout

```ts
app.post('/oauth/logout', async (req, res) => {
  const did = req.session.user_did
  if (did) {
    try { await client.revoke(did) } catch {}   // best-effort
  }
  req.session.destroy(() => {
    res.clearCookie('session')
    res.clearCookie('identity')
    res.redirect('/')
  })
})
```

`client.revoke(did)`:
1. POSTs to AS's revocation endpoint (if advertised) with the refresh token.
2. Calls `sessionStore.del(did)`.

Always run 2 even if 1 fails. A cookie on a user's device persists until it expires; revocation at the AS is the only way to kill the refresh token server-side.

## Key hygiene

- **DPoP private key is immortal for the session.** Stored as JWK in `NodeSavedSession.dpopJwk`. Never rotate during a session. Rotation = end of session.
- **Encrypt `sessionStore.data` at rest.** Contains `refresh_token` + `dpopJwk`. A leaked row = account takeover.
- **Rotate the session cookie secret** periodically. Use a dual-secret scheme (decrypt with old+new) during transitions.
- **No tokens in logs.** Especially not `tokenSet.access_token` or `tokenSet.refresh_token`. Log `sub` only.

## Common pitfalls

- **In-process `requestLock` behind a load balancer.** Two Node instances refresh in parallel, one wins the rotation, the other's refresh token dies. Switch to Redis/Postgres lock the moment you scale past 1 process.
- **TTL on `stateStore` > 10 minutes.** The AS expires PAR `request_uri` at ~10 min anyway; longer TTL just leaks state. Match it.
- **Not clearing `sessionStore` on `TokenRefreshError`.** The session is permanently dead. Leaving it creates a perpetual refresh-fail loop. `del` it and force re-login.
- **Storing sessions in a plain-text file or unencrypted JSON.** Refresh token + DPoP key in one file = game over. Encrypt.
- **Cookie `SameSite: 'strict'`.** Breaks the callback. Lax is the required setting.
- **Hand-rolling the browser IndexedDB access.** Unnecessary. `BrowserOAuthClient` gives you `restore(did)`, `signOut(did)`, and events. Use them.

## See also

- `README.md` — Node and Browser package setup.
- `flows.md` — where `stateStore`/`sessionStore`/`requestLock` plug into each flow method.
- `dpop.md` — DPoP key lifetime bound to session.
- `../shared/sessions.md` — language-neutral rules and BFF/SPA/native patterns.
- `../shared/security-requirements.md` — cookie/key/token hardening checklist.
- `../shared/troubleshooting.md` §refresh race — diagnosing token-rotation failures.

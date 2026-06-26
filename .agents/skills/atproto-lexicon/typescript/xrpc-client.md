# TypeScript — invoking XRPC methods (client, agent, server, subscriptions)

Procedure-oriented guide for `@atproto/xrpc`, `@atproto/api`, and `@atproto/xrpc-server`. The wire rules are in `../shared/xrpc-wire.md`.

## 1. `XrpcClient` — low-level client

```ts
import { XrpcClient, XRPCError, XRPCInvalidResponseError } from '@atproto/xrpc'
import lexiconDocs from './lexicons'

const client = new XrpcClient('https://bsky.social', lexiconDocs)
// or with custom fetch / headers:
const client2 = new XrpcClient(
  { service: 'https://bsky.social', fetch, headers: { 'x-custom': 'v' } },
  lexiconDocs,
)
```

Call a query:

```ts
const { data } = await client.call(
  'com.atproto.repo.getRecord',
  { repo, collection, rkey },               // params → query string
  undefined,                                 // no input body for queries
  { headers: { authorization: `Bearer ${jwt}` } },
)
```

Call a procedure:

```ts
const { data } = await client.call(
  'com.atproto.repo.createRecord',
  undefined,                                 // no query-string params
  { repo, collection, record },              // input → JSON body
  { headers: { authorization: `Bearer ${jwt}` } },
)
```

`XrpcClient` serializes params, serializes input, sets `Content-Type`, validates the response against the lexicon, and throws `XRPCInvalidResponseError` if the response doesn't match. A protocol error (non-2xx) surfaces as `XRPCError`.

## 2. `AtpAgent` — session-managed client

`@atproto/api` wraps `XrpcClient` with session management and generated namespaces:

```ts
import { AtpAgent } from '@atproto/api'

const agent = new AtpAgent({ service: 'https://bsky.social' })
await agent.login({ identifier: 'alice.example', password: '...' })

// agent.com.atproto.* — core AT Protocol, in scope for this skill:
const rec = await agent.com.atproto.repo.getRecord({
  repo: 'did:plc:abc123',
  collection: 'app.bsky.feed.post',
  rkey: '3jwdwj2ctlk26',
})

// agent.app.bsky.* — Bluesky-specific, OUT OF SCOPE for this skill:
const tl = await agent.app.bsky.feed.getTimeline()
```

The **Bluesky boundary**: anything under `agent.app.bsky.*`, plus `RichText` and facet helpers, is Bluesky-domain. Direct users to the `@atproto/api` README for those.

For OAuth, use the newer `Agent` wrapper with an `OAuthSession`:

```ts
import { Agent } from '@atproto/api'

const agent = new Agent(oauthSession)   // oauthSession from @atproto/oauth-client-*
await agent.com.atproto.repo.createRecord({ ... })
```

See `../../atproto-oauth/`.

## 3. Error handling

```ts
import { XRPCError } from '@atproto/xrpc'

try {
  await client.call('com.atproto.repo.getRecord', params)
} catch (err) {
  if (err instanceof XRPCError) {
    console.log(err.status)            // HTTP status
    console.log(err.error)             // lexicon error name
    console.log(err.message)           // free text
    console.log(err.headers)           // response headers
    if (err.error === 'RecordNotFound') {
      return null
    }
  }
  throw err
}
```

`XRPCInvalidResponseError` (subclass) indicates the server's response didn't match the lexicon — typically a server bug or lexicon-version mismatch.

Clients **must** tolerate unknown `err.error` names. Default branch on the error name; fall back to `err.status`-based handling for unknown names.

## 4. Server — `@atproto/xrpc-server` (Node only)

```ts
import {
  createServer,
  AuthRequiredError,
  InvalidRequestError,
  InternalServerError,
} from '@atproto/xrpc-server'
import lexiconDocs from './lexicons'

const server = createServer(lexiconDocs)

server.method('com.example.note.get', {
  auth: async (ctx) => {
    // inspect ctx.req for Authorization; return an auth object or throw AuthRequiredError
    return { did: 'did:plc:abc123' }
  },
  handler: async ({ params, auth, req, res }) => {
    const note = await db.fetchNote(params.repo, params.rkey)
    if (!note) throw new InvalidRequestError('RecordNotFound', 'no such rkey')
    return { encoding: 'application/json', body: note }
  },
})

server.method('com.example.note.create', {
  handler: async ({ input, auth }) => {
    // input.body is the validated JSON
    await db.createNote(auth.did, input.body)
    return { encoding: 'application/json', body: { ok: true } }
  },
})
```

Mount on Express / Fastify:

```ts
app.use(server.xrpc.router)
```

Validation happens automatically. Your handler receives typed input; its return value is validated against `output.schema` before being sent.

## 5. Subscriptions (server and client)

### Server — `streamMethod`

```ts
server.streamMethod('com.example.stream', {
  handler: async function* ({ params, signal }) {
    let seq = 0
    while (!signal.aborted) {
      yield { $type: '#tick', seq: seq++, time: new Date().toISOString() }
      await sleep(1000)
    }
  },
})
```

Framing and DAG-CBOR encoding are handled by the server. Each yielded value becomes one WebSocket binary message consisting of header + body (see `../shared/xrpc-wire.md §6`).

### Client — consuming frames

`@atproto/xrpc-server` also exports the consumer-side utilities (`Subscription`, `Frame`, `MessageFrame`, `ErrorFrame`). **Note:** the export location has moved between releases. If imports fail, grep the current `node_modules/@atproto/xrpc-server/dist/index.d.ts` (or `@atproto/xrpc` — historical home).

Worked example pattern:

```ts
import { Subscription } from '@atproto/xrpc-server'  // verify current path

const sub = new Subscription({
  service: 'wss://bsky.network',
  method:  'com.atproto.sync.subscribeRepos',
  getParams: () => ({ cursor: lastCursor }),
  validate: (value) => lex.assertValidXrpcMessage('com.atproto.sync.subscribeRepos', value),
})

for await (const event of sub) {
  // event shape depends on the subscription lexicon's message union
  // dispatch on a discriminator ($type, op, etc.)
}
```

Reconnection, cursor persistence, and back-pressure are the caller's responsibility.

## 6. Common pitfalls

- **`Subscription` import path moved.** Re-check between releases. Also watch for a browser-compatible variant.
- **Node < 18.** `fetch` isn't global; pass one into `XrpcClient({ service, fetch })`.
- **`@atproto/api` pulls the full `@atproto/crypto` surface.** If bundle size matters in the browser, use `@atproto/xrpc` directly.
- **Session rotation.** `AtpAgent.login` stores a session. If refresh fails, calls throw `AuthRequired` — listen for session events or handle in your own refresh loop.
- **Rate limits.** `err.headers['ratelimit-*']` is set; check before retrying.
- **ESM-only imports.** CommonJS consumers need dynamic `import()` or a bundler with ESM interop.

## 7. See also

- `authoring.md` — lexicon loading feeds both client and server.
- `validation.md` — the validator that runs inside `XrpcClient` and `createServer`.
- `records.md` — strongRef, blob ref, AT-URI handling at the record layer.
- `../shared/xrpc-wire.md` — normative HTTP and WebSocket rules.
- `../../atproto-oauth/typescript/` — populating `Authorization`/`DPoP` headers via `Agent`.

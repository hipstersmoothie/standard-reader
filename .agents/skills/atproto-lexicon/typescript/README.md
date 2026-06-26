# TypeScript — `@atproto/*` setup

TypeScript lexicon and XRPC work lives in the `bluesky-social/atproto` monorepo. This skill centers on `@atproto/lexicon` (schema model + validation), `@atproto/xrpc` (client transport), and `@atproto/xrpc-server` (server). `@atproto/api` is the high-level client that bundles generated `com.atproto.*` + `app.bsky.*` wrappers on top of these.

All packages are isomorphic ESM except `@atproto/xrpc-server`, which is Node-only.

> **Scope note.** This file covers protocol-level lexicon authoring, schema validation, XRPC invocation, and generic record parsing (`$type` dispatch, `strongRef`, blob refs). Bluesky-domain record idioms — `app.bsky.richtext.facet`, embeds, threadgates, label value definitions — are **out of scope for this plugin entirely**. Those ship in `@atproto/api` and live in Bluesky-specific tooling. If the user asks about richtext facets or embeds, say so and point at the Bluesky AppView docs.

## Install

Lexicon + XRPC client:

```json
{
  "dependencies": {
    "@atproto/lexicon": "^0.4",
    "@atproto/xrpc":    "^0.6",
    "@atproto/syntax":  "^0.3"
  }
}
```

High-level agent (pulls the others transitively):

```json
{
  "dependencies": {
    "@atproto/api": "^0.13"
  }
}
```

Server and codegen as dev deps:

```json
{
  "devDependencies": {
    "@atproto/xrpc-server": "^0.7",
    "@atproto/lex-cli":     "^0.6"
  }
}
```

Pin actual versions from `npm info @atproto/lexicon @atproto/xrpc @atproto/xrpc-server @atproto/api @atproto/lex-cli`.

## Package map

| Package                 | Handles                                                                    | See file |
| ----------------------- | -------------------------------------------------------------------------- | -------- |
| `@atproto/lexicon`      | Schema model, `Lexicons` catalog, `BlobRef`, record and XRPC validation.   | `authoring.md`, `validation.md` |
| `@atproto/xrpc`         | `XrpcClient` — client-side transport.                                      | `xrpc-client.md` |
| `@atproto/xrpc-server`  | `createServer`, route registration, subscription streaming.                | `xrpc-client.md §server` |
| `@atproto/api`          | `AtpAgent`, generated `com.atproto.*` + `app.bsky.*` wrappers, `RichText`. | `xrpc-client.md §agent` |
| `@atproto/lex-cli`      | `gen-api`, `gen-server` codegen.                                           | `authoring.md §codegen` |
| `@atproto/syntax`       | `NSID`, `AtUri`, `TID` classes — boundary types.                           | `records.md` |

### The Bluesky boundary

`@atproto/api` exposes `agent.com.atproto.*` (core AT Protocol, in scope) and `agent.app.bsky.*` / `RichText` / facet helpers (Bluesky-specific, **out of scope for this skill**). Point users at the `@atproto/api` README for Bluesky-domain work; this skill focuses on protocol-level record parsing and XRPC invocation.

## Typical wiring — validate a record

```ts
import { Lexicons, type LexiconDoc, ValidationError } from '@atproto/lexicon'
import noteSchema from './lexicons/com/example/note.json'

const lex = new Lexicons()
lex.add(noteSchema as LexiconDoc)

try {
  const value = lex.assertValidRecord('com.example.note', record)
  // value is the validated object
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(err.message)  // includes the JSON path that failed
  }
  throw err
}
```

`Lexicons` is **mutable**. `.add(doc)` and `.addMany([docs])` modify in place. Build once at startup, share across requests.

## Typical wiring — call an XRPC method

```ts
import { XrpcClient } from '@atproto/xrpc'
import lexiconDocs from './lexicons'

const client = new XrpcClient('https://bsky.social', lexiconDocs)

const { data } = await client.call(
  'com.atproto.repo.getRecord',
  { repo: 'did:plc:abc123', collection: 'app.bsky.feed.post', rkey: '3jwdwj2ctlk26' },
  undefined,                                   // input (procedures only)
  { headers: { authorization: `Bearer ${jwt}` } },
)
```

Or use `AtpAgent` for session management + generated namespaces:

```ts
import { AtpAgent } from '@atproto/api'

const agent = new AtpAgent({ service: 'https://bsky.social' })
await agent.login({ identifier: 'alice.example', password: '...' })

const res = await agent.com.atproto.repo.getRecord({
  repo: 'did:plc:abc123',
  collection: 'app.bsky.feed.post',
  rkey: '3jwdwj2ctlk26',
})
```

## Idioms

- **ESM only.** `"type": "module"` in every package. If you're shipping CJS, arrange a bundler with ESM interop or use dynamic `import()`.
- **`Lexicons` is mutable; `BlobRef` is a class.** See `validation.md` for pitfalls around plain-object blobs.
- **Validation is sync.** `assertValid*` throws `ValidationError`; `validate` returns a result union. Don't `await` — there's no async path.
- **`fetch` is global on Node 18+.** `XrpcClient` uses it; older Node needs a polyfill.
- **Errors are structured classes.** `XRPCError { status, error, message }` for protocol-level failures; `XRPCInvalidResponseError` when the server's response didn't match the lexicon.
- **Prefer the generated code.** `@atproto/api` already ships every `com.atproto.*` + `app.bsky.*` method typed. For your own lexicons, run `lex-cli gen-api` rather than hand-writing wrappers.

## When to use which package

| Want to…                                         | Use…                                                   |
| ------------------------------------------------ | ------------------------------------------------------ |
| Validate a record                                | `@atproto/lexicon`: `lex.assertValidRecord(nsid, val)` |
| Call an XRPC method with session management     | `@atproto/api`: `AtpAgent`                             |
| Call an XRPC method without session              | `@atproto/xrpc`: `new XrpcClient(service, docs)`       |
| Host XRPC methods                                | `@atproto/xrpc-server`: `createServer(docs)`           |
| Parse AT-URIs, NSIDs, TIDs                       | `@atproto/syntax`                                      |
| Build a typed client from your own lexicons      | `@atproto/lex-cli gen-api`                             |
| Consume the firehose                             | `@atproto/xrpc-server` subscription utilities          |

## See also

- `authoring.md` — writing lexicons, loading into `Lexicons`, codegen.
- `validation.md` — strictness, `BlobRef` handling, `ValidationError` surface.
- `xrpc-client.md` — `XrpcClient`, `AtpAgent`, subscriptions, `createServer`.
- `records.md` — AT-URIs, TIDs, strongRef, blob helpers.
- `../shared/lexicon-spec.md`, `../shared/xrpc-wire.md`, `../shared/record-model.md` — language-neutral rules.
- `../shared/divergence-matrix.md` — how this stack compares to Rust and Go.

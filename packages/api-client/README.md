# @standard-reader/api-client

A typed TypeScript client for the **Standard Reader** XRPC API.

The client is generated directly from Standard Reader's AT Protocol lexicons
(`lexicons/app/standard-reader/*.json`) using
[`@atproto/lex`](https://www.npmjs.com/package/@atproto/lex) — the official
atproto Lexicon codegen — and pairs the generated schemas with
[`@atproto/lex-client`](https://www.npmjs.com/package/@atproto/lex-client) for
end-to-end type safety over XRPC.

> There is no OpenAPI step: XRPC is RPC-over-HTTP, not REST, so the client is
> generated straight from the lexicons, preserving atproto-native semantics
> (`at-uri`/`did`/`cid` formats, refs, unions, records).

## Install

```sh
pnpm add @standard-reader/api-client
```

## Usage

### Anonymous reads (public endpoints)

```ts
import { createClient, lexicons } from "@standard-reader/api-client";

const client = createClient(); // defaults to https://standard-reader.app

const { publications } = await client.call(
  lexicons.app["standard-reader"].getTrendingPublications,
  { limit: 12 },
);

const doc = await client.call(lexicons.app["standard-reader"].getDocument, {
  document: "at://did:plc:…/app.standard-reader.document/…",
});
```

`client.call(method, input)` is fully typed: `input` matches the method's
`params` (queries) or `input` body (procedures), and the awaited result matches
the method's `output` schema. The response is validated against the lexicon at
runtime.

### Authenticated writes

Write procedures (`markRead`, `bookmarkDocument`, `followUser`, …) require an
authenticated AT Protocol session. Attach credentials with a `fetch` override:

```ts
const client = createClient({
  service: "https://standard-reader.app",
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      headers: { ...init?.headers, authorization: `Bearer ${accessJwt}` },
    }),
});

await client.call(lexicons.app["standard-reader"].markRead, {
  document: "at://…",
});
```

The `fetch` override is also the hook for DPoP, token refresh, retries, and
SSRF protection. Alternatively pass a bare fetch handler or a pre-built agent —
see `createClient`'s JSDoc.

## What's generated

`src/lexicons/` is generated and committed (do not edit by hand). It covers:

- `app["standard-reader"].*` — every Standard Reader query, procedure, and
  record.
- `com.atproto.label.*` and `at.markpub.*` — the external definitions the
  Standard Reader lexicons reference.

Unrelated `app.bsky.*` reference lexicons vendored in the repo are excluded from
generation.

## Regenerating

Run from the repo root after changing any lexicon:

```sh
pnpm --filter @standard-reader/api-client generate
```

This runs `ts-lex build` over `../../lexicons`. To refresh the vendored external
lexicons (bsky/markpub/etc.) and verify their pinned CIDs:

```sh
pnpm --filter @standard-reader/api-client lex:install
```

## Build

```sh
pnpm --filter @standard-reader/api-client build      # tsc -> dist/
pnpm --filter @standard-reader/api-client typecheck
```

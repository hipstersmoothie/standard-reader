# @standard-reader/lexicons

The **Standard Reader** XRPC API as typed AT Protocol lexicon schemas.

This package is generated directly from Standard Reader's lexicons
(`lexicons/app/standard-reader/*.json`) using
[`@atproto/lex`](https://www.npmjs.com/package/@atproto/lex) — the official
atproto Lexicon codegen. Its primary export, `standardReader`, holds a generated
schema object for every `app.standard-reader.*` method and record (e.g.
`standardReader.getDocument`).

> There is no OpenAPI step: XRPC is RPC-over-HTTP, not REST, so the schemas are
> generated straight from the lexicons, preserving atproto-native semantics
> (`at-uri`/`did`/`cid` formats, refs, unions, records).

**It does not ship a client.** Pair these schemas with a standard atproto XRPC
client — [`@atproto/lex-client`](https://www.npmjs.com/package/@atproto/lex-client)
— whose `Client.call`/`create`/`put`/`delete` methods are fully typed against
them. That keeps the transport (auth, DPoP, retries, session management) in the
maintained upstream client rather than a bespoke wrapper.

## Install

```sh
pnpm add @standard-reader/lexicons @atproto/lex-client
```

## Usage

### Anonymous reads (public endpoints)

```ts
import { Client } from "@atproto/lex-client";
import { standardReader, STANDARD_READER_SERVICE } from "@standard-reader/lexicons";

const client = new Client(STANDARD_READER_SERVICE); // https://standard-reader.app

const { publications } = await client.call(
  standardReader.getTrendingPublications,
  { limit: 12 },
);

const doc = await client.call(standardReader.getDocument, {
  document: "at://did:plc:…/app.standard-reader.document/…",
});
```

`client.call(method, input)` is fully typed: `input` matches the method's
`params` (queries) or `input` body (procedures), and the awaited result matches
the method's `output` schema. Responses are validated against the lexicon at
runtime.

### Authenticated writes

Write procedures (`markRead`, `bookmarkDocument`, `followUser`, …) require an
authenticated AT Protocol session. Attach credentials via the client's agent
config — e.g. a `fetch` override (also the hook for DPoP, token refresh,
retries):

```ts
const client = new Client({
  service: STANDARD_READER_SERVICE,
  fetch: (input, init) =>
    fetch(input, {
      ...init,
      headers: { ...init?.headers, authorization: `Bearer ${accessJwt}` },
    }),
});

await client.call(standardReader.markRead, { document: "at://…" });
```

See [`@atproto/lex-client`](https://www.npmjs.com/package/@atproto/lex-client)
for the full agent/auth API.

## What's generated

`src/lexicons/` is generated and committed (do not edit by hand). It covers:

- `app["standard-reader"].*` — every Standard Reader query, procedure, and
  record (exposed as the `standardReader` shorthand).
- `com.atproto.label.defs` and `at.markpub.*` — the external definitions the
  Standard Reader lexicons actually reference (labels returned by `getLabels`;
  the markdown body of the `collection` record). Reach them via the full
  `lexicons` export, e.g. `lexicons.com.atproto.label.defs`.

Reference lexicons vendored in the repo but not referenced by our API
(`app.bsky.*`, the `com.atproto.label` query/subscription methods) are excluded
from generation.

## Regenerating

Run from the repo root after changing any lexicon:

```sh
pnpm --filter @standard-reader/lexicons generate
```

This runs `ts-lex build` over `../../lexicons`. To refresh the vendored external
lexicons (markpub/etc.) and verify their pinned CIDs:

```sh
pnpm --filter @standard-reader/lexicons lex:install
```

## Build

```sh
pnpm --filter @standard-reader/lexicons build      # tsc -> dist/
pnpm --filter @standard-reader/lexicons typecheck
```

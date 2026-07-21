# @standard-reader/lexicons

The **Standard Reader** XRPC API as typed AT Protocol lexicon schemas.

Generated from Standard Reader's AT Protocol lexicons with
[`@atproto/lex`](https://www.npmjs.com/package/@atproto/lex), the official
atproto Lexicon codegen. The sole export, `standardReader`, holds a typed schema
object for every `app.standard-reader.*` query, procedure, and record — e.g.
`standardReader.getDocument`.

> No OpenAPI step: XRPC is RPC-over-HTTP, not REST, so the schemas are generated
> straight from the lexicons, preserving atproto-native semantics
> (`at-uri`/`did`/`cid` formats, refs, unions, records).

**It does not ship a client.** Pair these schemas with a standard atproto XRPC
client — [`@atproto/lex-client`](https://www.npmjs.com/package/@atproto/lex-client)
— whose `Client.call`/`create`/`put`/`delete` methods are fully typed against
them. Transport concerns (auth, DPoP, retries, session management) stay in the
maintained upstream client.

## Install

```sh
npm install @standard-reader/lexicons @atproto/lex-client
```

## Usage

### Anonymous reads

```ts
import { Client } from "@atproto/lex-client";
import {
  standardReader,
  STANDARD_READER_SERVICE,
} from "@standard-reader/lexicons";

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
for the full agent and auth API.

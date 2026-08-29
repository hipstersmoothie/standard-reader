# Standard Reader XRPC example client

A small, dependency-free client for the Standard Reader AppView — and the
end-to-end conformance run for its XRPC surface.

It imports nothing from the app on purpose. It talks to a deployment the way an
outside integration does, so the things that only break across the network
(identity resolution, inter-service auth, proxying) break here too.

```bash
# every method, plus the transport probe, against production
pnpm --filter @standard-reader/example-xrpc-client start

pnpm --filter @standard-reader/example-xrpc-client conformance
pnpm --filter @standard-reader/example-xrpc-client transports
pnpm --filter @standard-reader/example-xrpc-client start call app.standard-reader.getLatestFeed limit=3
```

Credentials come from the environment — `STANDARD_READER_IDENTIFIER` and
`STANDARD_READER_APP_PASSWORD` (an app password from Settings → App Passwords).
The `PERF_TEST_*` names work too, so the scripts pick up
`apps/standard-reader/.env` unchanged. `EXAMPLE_APPVIEW` points the run at
another deployment (defaults to `https://standard-reader.app`).

## The three ways to call the AppView

| Transport     | Where you send the request                       | What authenticates it                                             | Writes? |
| ------------- | ------------------------------------------------ | ----------------------------------------------------------------- | ------- |
| `direct`      | the AppView                                      | your PDS access token                                             | yes     |
| `proxy`       | **your own PDS**, with an `atproto-proxy` header | a service JWT your PDS mints for us                               | no      |
| `serviceAuth` | the AppView                                      | a service JWT you minted with `com.atproto.server.getServiceAuth` | no      |

`proxy` is the standard AT Protocol shape: you keep talking to your own PDS and
it forwards the call.

```http
GET /xrpc/app.standard-reader.getBookmarkStatus?document=at://… HTTP/1.1
Host: your.pds.example
Authorization: Bearer <your PDS access token>
atproto-proxy: did:web:standard-reader.app#standard_reader_appview
```

**Writes cannot be proxied.** The token that reaches us proves who you are but
is not a credential we can replay against your repo, so write procedures answer
with an explanation rather than a bare 401. Either call the AppView directly
with your own access token, or write the `app.standard-reader.*` record to your
own repo — the AppView mirrors it from the firehose within seconds.

## What the transport probe checks, and why it looks paranoid

A status code proves nothing about authentication here. Most reader-state
queries are _optionally_ authenticated: `getBookmarkStatus` answers
`200 {"active":false}` to a caller it doesn't recognise. So a proxy integration
that has silently stopped authenticating still returns 200 for every read — that
is exactly how a broken `atproto-proxy` path survived two rounds of fixes.

So the probe creates state only the signed-in reader can see, then requires each
transport to see it:

1. bookmark a document over `direct`;
2. for each transport, read `getBookmarkStatus` **without** a `did` parameter —
   the answer has to come from the credential — and require `active: true`;
3. require a proxied write to explain itself in words, not 401 or 502;
4. remove the bookmark.

It also validates the published DID document the way a PDS does, because both of
the earlier failures lived there: the `id` must match the DID it is served for
(`did:web:standard-reader.app`, dots intact — colons encode _path_ segments),
and `serviceEndpoint` must be a bare origin, since a PDS uses it verbatim as an
HTTP origin and appends `/xrpc/<nsid>` itself.

## What the conformance run checks

Every method the AppView serves, with the example arguments its public API docs
advertise. Fixtures (a real publication, a real document, a list) are discovered
at run time from public endpoints, so there is no fixture file to keep current;
any of them can be pinned with `EXAMPLE_DOCUMENT_URI`, `EXAMPLE_PUBLICATION_URI`,
`EXAMPLE_LIST_URI`, `EXAMPLE_TAG`, `EXAMPLE_SEARCH`, `EXAMPLE_LABELER_DID`,
`EXAMPLE_RESOLVE_URL`.

Writes run paired with the procedure that undoes them, so a run leaves the
account as it found it. `createList` → `updateList` → `deleteList` run as one
chain on the rkey the first call returns. Two procedures have no inverse
(`markAllRead`, `markPublicationAllRead`) and are skipped unless you pass
`--include-destructive`.

`src/plan.generated.ts` is generated from the app's API docs catalog:

```bash
pnpm --filter standard-reader xrpc:example-plan
```

A test in the app fails when the checked-in plan drifts, and another fails when
a registered method is missing from the catalog. Between them, a new endpoint
cannot ship without something exercising it here.

## Files

| File                    |                                                                       |
| ----------------------- | --------------------------------------------------------------------- |
| `src/identity.ts`       | handle → DID → PDS, and discovering the AppView from its DID document |
| `src/session.ts`        | app-password login, and minting a service JWT                         |
| `src/client.ts`         | the client — the three transports above                               |
| `src/fixtures.ts`       | run-time fixture discovery and `{{token}}` substitution               |
| `src/transports.ts`     | the authentication probe                                              |
| `src/conformance.ts`    | the full sweep                                                        |
| `src/plan.generated.ts` | every method + its documented example arguments                       |

# Go — `indigo` setup

The de-facto Go implementation of AT Protocol is `github.com/bluesky-social/indigo`. This skill centers on `indigo/atproto/lexicon` (schema model + validation), `indigo/atproto/data` (record data model), `indigo/xrpc` (client), and `indigo/events` (firehose).

> **Scope note.** This file covers protocol-level lexicon authoring, schema validation, XRPC invocation, and generic record parsing (`$type` dispatch, `strongRef`, blob refs). Bluesky-domain record idioms — `app.bsky.richtext.facet`, embeds, threadgates, label value definitions — are **out of scope for this plugin entirely** and belong with `indigo/api/bsky` helpers in Bluesky-specific tooling. If the user asks about richtext facets or embeds, say so and point at the Bluesky AppView docs.

## Install

```bash
go get github.com/bluesky-social/indigo@latest
```

A typical set of imports:

```go
import (
    "github.com/bluesky-social/indigo/atproto/lexicon"
    "github.com/bluesky-social/indigo/atproto/data"
    "github.com/bluesky-social/indigo/atproto/syntax"
    "github.com/bluesky-social/indigo/xrpc"
    "github.com/bluesky-social/indigo/api/atproto"
    "github.com/bluesky-social/indigo/api/agnostic"
    "github.com/bluesky-social/indigo/events"
)
```

## Package map

| Package                                      | Handles                                                                           | See file |
| -------------------------------------------- | --------------------------------------------------------------------------------- | -------- |
| `atproto/lexicon`                            | Schema model, `BaseCatalog`, `ValidateRecord`, `ValidateFlags`.                   | `authoring.md`, `validation.md` |
| `atproto/data`                               | Modern record model: `Blob`, `CIDLink`, `Bytes`, JSON/CBOR marshaling.            | `records.md` |
| `atproto/syntax`                             | `NSID`, `ATURI`, `TID`, `RecordKey` — strongly-typed string wrappers.             | `records.md` |
| `xrpc`                                       | Low-level client: `Client{Host, Auth, Client, Headers}`, `.Do(...)`.              | `xrpc-client.md` |
| `api/atproto`                                | Generated `com.atproto.*` client wrappers (typed).                                | `xrpc-client.md` |
| `api/agnostic`                               | Schema-agnostic wrappers — same signatures, `Value` is `*json.RawMessage`.        | `xrpc-client.md` |
| `api/bsky`                                   | Generated `app.bsky.*` wrappers (Bluesky-specific — **out of scope**).            | —        |
| `events`                                     | Firehose consumer: `HandleRepoStream`, `RepoStreamCallbacks`.                     | `xrpc-client.md §subscriptions` |
| `events/schedulers/{sequential,parallel,autoscaling}` | Dispatch strategies for the firehose.                                     | `xrpc-client.md §subscriptions` |
| `cmd/lexgen`                                 | Codegen: Go types + XRPC wrappers + `MarshalCBOR`.                                | `authoring.md §codegen` |
| `lex/util`                                   | Legacy types still referenced by generated code: `LexBlob`, `LexLink`, `LexiconTypeDecoder`. | `records.md §legacy` |

### Choosing a client

- Use `api/atproto.<NSID>(...)` for spec'd `com.atproto.*` calls — fully typed.
- Use `api/agnostic.<NSID>(...)` when the record body is an arbitrary third-party lexicon — typed params, opaque `Value`.
- Fall back to `xrpc.Client.Do(...)` for non-spec or subscription endpoints.

## Two data-model stacks (important)

Go maintains **two parallel stacks**:

- **Modern** `atproto/data`: `Blob`, `CIDLink`, `Bytes`. Used by the validator and any schema-agnostic code.
- **Legacy** `lex/util`: `LexBlob`, `LexLink`, `LexBytes`. Still emitted by `cmd/lexgen` generated code.

Anything imported from `api/atproto` touches `lex/util.LexBlob`. Rust and TypeScript do not have this split; expect conversion code when bridging layers. See `records.md §legacy`.

## Typical wiring — validate a record

```go
package main

import (
    "encoding/json"
    "log"

    "github.com/bluesky-social/indigo/atproto/data"
    "github.com/bluesky-social/indigo/atproto/lexicon"
)

func main() {
    cat := lexicon.NewBaseCatalog()
    if err := cat.LoadDirectory("./lexicons"); err != nil {
        log.Fatal(err)
    }

    var body []byte = /* JSON record bytes */
    obj, err := data.UnmarshalJSON(body)
    if err != nil { log.Fatal(err) }

    if err := lexicon.ValidateRecord(&cat, obj, "com.example.note", 0); err != nil {
        log.Fatalf("validation failed: %v", err)
    }
    _ = json.Marshal // kept for example compilation
}
```

`recordData` must be a `map[string]any` produced by `data.UnmarshalJSON` (or `UnmarshalCBOR`) — it MUST include a `$type` matching the `ref` argument.

## Typical wiring — call an XRPC method

```go
package main

import (
    "context"
    "net/http"

    "github.com/bluesky-social/indigo/api/atproto"
    "github.com/bluesky-social/indigo/xrpc"
)

func main() {
    ctx := context.Background()
    c := &xrpc.Client{
        Client: http.DefaultClient,
        Host:   "https://bsky.social",
        Auth: &xrpc.AuthInfo{
            AccessJwt:  "...",
            RefreshJwt: "...",
            Did:        "did:plc:abc123",
            Handle:     "alice.example",
        },
    }

    out, err := atproto.RepoGetRecord(ctx, c,
        /*cid*/ "",
        /*collection*/ "app.bsky.feed.post",
        /*repo*/ "did:plc:abc123",
        /*rkey*/ "3jwdwj2ctlk26",
    )
    if err != nil {
        // *xrpc.Error offers .IsThrottled(), .Ratelimit, etc.
    }
    _ = out
}
```

For arbitrary lexicons whose records you don't have typed:

```go
import "github.com/bluesky-social/indigo/api/agnostic"

out, err := agnostic.RepoGetRecord(ctx, c, "", "com.example.note", "did:plc:abc123", "rkey")
// out.Value is *json.RawMessage — pass to data.UnmarshalJSON for validation.
```

## Idioms

- **Disk-first catalog.** `BaseCatalog.LoadDirectory("./lexicons")` at startup is the idiom; `LoadEmbedFS(efs)` for distributable binaries. No global catalog — pass it around.
- **Context everywhere.** Every XRPC call takes `context.Context`. Pass a cancel-aware context from your handler.
- **`error` everywhere.** Check with `errors.Is` / `errors.As`. `*xrpc.Error` is your structured XRPC error type.
- **Heavy work off the firehose callback.** Use a `Scheduler` (`sequential` / `parallel` / `autoscaling`) to decouple read from processing.
- **`cbor-gen` struct tags.** Generated structs carry both `json:"..."` and `cborgen:"..."` tags. Hand-written CBOR-marshaled structs need both.
- **`data.UnmarshalJSON` vs. `json.Unmarshal`.** `data.UnmarshalJSON` produces `map[string]any` with `Blob`/`CIDLink`/`Bytes` already recognized. Plain `json.Unmarshal` doesn't.

## When to use which package

| Want to…                                                  | Use…                                                    |
| --------------------------------------------------------- | ------------------------------------------------------- |
| Validate a record                                         | `lexicon.ValidateRecord(&cat, obj, nsid, flags)`        |
| Load lexicons from disk                                   | `lexicon.NewBaseCatalog(); cat.LoadDirectory(path)`     |
| Resolve NSID over the network                             | `lexicon.NewResolvingCatalog()` (needs `identity.Directory`) |
| Call a `com.atproto.*` method                             | `api/atproto.<Method>(ctx, client, args...)`            |
| Call an arbitrary method                                  | `api/agnostic.<Method>(...)` or `xrpc.Client.Do(...)`   |
| Parse AT-URI / NSID / TID                                 | `atproto/syntax`                                        |
| Consume the firehose                                      | `events.HandleRepoStream` + a `Scheduler`               |
| Extract blobs from an arbitrary record                    | `data.ExtractBlobs(obj)`                                |
| Generate typed wrappers from lexicon JSON                 | `go run github.com/bluesky-social/indigo/cmd/lexgen`    |

## See also

- `authoring.md` — writing lexicons, loading into a catalog, codegen.
- `validation.md` — `ValidateFlags`, strict vs. lenient.
- `xrpc-client.md` — client calls, server patterns, firehose consumption.
- `records.md` — `Blob`, `CIDLink`, AT-URI handling, legacy stack.
- `../shared/lexicon-spec.md`, `../shared/xrpc-wire.md`, `../shared/record-model.md` — language-neutral rules.
- `../shared/divergence-matrix.md` — how this stack compares to Rust and TypeScript.

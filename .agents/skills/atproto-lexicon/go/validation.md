# Go — validating records and XRPC payloads

This file covers validation against `BaseCatalog` via `ValidateRecord`. Rules in `../shared/lexicon-spec.md §7–8` and `../shared/record-model.md`.

## 1. Public entry point

```go
import "github.com/bluesky-social/indigo/atproto/lexicon"

// signature:
func ValidateRecord(
    cat Catalog,
    recordData any,       // typically map[string]any from data.UnmarshalJSON
    ref string,           // the NSID or NSID#def to validate against
    flags ValidateFlags,
) error
```

The `recordData` must be a `map[string]any` with a `$type` field matching `ref`. Other `Validate*` helpers exist for XRPC params/input (check `indigo/atproto/lexicon` godoc for the current set).

## 2. `ValidateFlags`

```go
type ValidateFlags uint

const (
    AllowLegacyBlob          ValidateFlags = 1 << iota
    AllowLenientDatetime
    StrictRecursiveValidation
)

var LenientMode = AllowLegacyBlob | AllowLenientDatetime
```

| Flag                          | Effect                                                                                  |
| ----------------------------- | --------------------------------------------------------------------------------------- |
| `0`                           | Strict. Reject legacy blobs. Require strict RFC 3339 datetimes.                         |
| `AllowLegacyBlob`             | Accept the pre-v1 blob shape (`{cid, mimeType}` without wrapper).                       |
| `AllowLenientDatetime`        | Accept relaxed datetime syntax.                                                         |
| `StrictRecursiveValidation`   | Inside `type:"unknown"` values carrying a `$type`, validate recursively.                |
| `LenientMode`                 | Convenience: `AllowLegacyBlob | AllowLenientDatetime`. Common for read-paths.           |

## 3. Worked example

```go
import (
    "log"

    "github.com/bluesky-social/indigo/atproto/data"
    "github.com/bluesky-social/indigo/atproto/lexicon"
)

func main() {
    cat := lexicon.NewBaseCatalog()
    if err := cat.LoadDirectory("./lexicons"); err != nil {
        log.Fatal(err)
    }

    raw := []byte(`{
        "$type":     "com.example.note",
        "text":      "hello",
        "createdAt": "2026-04-21T12:00:00.000Z"
    }`)

    obj, err := data.UnmarshalJSON(raw)
    if err != nil {
        log.Fatalf("decode: %v", err)
    }

    if err := lexicon.ValidateRecord(&cat, obj, "com.example.note", 0); err != nil {
        log.Fatalf("validate: %v", err)
    }

    // obj is now safe to operate on.
}
```

Lenient read-path:

```go
err := lexicon.ValidateRecord(&cat, obj, "com.example.note", lexicon.LenientMode)
```

## 4. Strict vs. lenient — where to use each

- **Write path (accepting records into your system):** strict (`0`). Reject unknown fields, reject legacy blobs.
- **Read path (consuming records from the network or firehose):** `LenientMode`. You will encounter older records.
- **Internal pipelines:** strict once normalized.

Go's validator rejects unknown fields strictly by default; some older record stores contain records that now fail validation. Walk your data before flipping to strict everywhere.

## 5. Validating XRPC payloads

`indigo/atproto/lexicon` exposes `ExtractTypeJSON`, `ResolveLexiconSchemaFile`, and `ExtractTypeCBOR` (also in `atproto/data`); combine with `ValidateRecord` for incoming XRPC payloads. For server implementations, validate `input.schema` bodies at the HTTP boundary using the lexicon-resolved schema:

```go
schema, err := cat.Resolve("com.atproto.repo.createRecord")
// pattern-match on schema.Def for Procedure{ Input, Output, Parameters, Errors }
```

Exact signatures vary by indigo release — consult `pkg.go.dev/github.com/bluesky-social/indigo/atproto/lexicon` for the current set.

## 6. `data.Validate` — schema-agnostic well-formedness

`data.Validate(obj)` checks that an object is a **legal AT Protocol data value** — `Blob`/`CIDLink`/`Bytes` shapes are well-formed, no forbidden types appear — **without** consulting a lexicon. Useful as a pre-pass when you haven't resolved the schema yet.

```go
if err := data.Validate(obj); err != nil {
    // obj is malformed at the data-model level
}
```

Not a substitute for `ValidateRecord`.

## 7. `ExtractTypeJSON` / `ExtractTypeCBOR`

Two packages ship the same helper. Prefer the one matching your code path:

```go
import (
    "github.com/bluesky-social/indigo/atproto/data"
    "github.com/bluesky-social/indigo/atproto/lexicon"
)

nsid, err := data.ExtractTypeJSON(raw)        // for loose JSON inspection
nsid, err = lexicon.ExtractTypeJSON(raw)      // when already in the validation path
```

Both return the `$type` value as a string. Use to decide which catalog def to dispatch on.

## 8. Common pitfalls

- **Passing `json.Unmarshal`'d `map[string]any`.** Use `data.UnmarshalJSON` so that `$link`, `$bytes`, and blob shapes become `CIDLink`, `Bytes`, `Blob` respectively. Plain `json.Unmarshal` loses this structure and validation sees the wrong types.
- **`$type` mismatch.** The record's `$type` must equal the `ref` argument. Validator rejects mismatches.
- **Legacy blobs in strict mode.** Errors without a clear "it's a legacy blob" hint. Flip to `AllowLegacyBlob` on read if you know the data is old.
- **Forgot to `LoadDirectory`.** Empty catalog → every `Resolve` fails → validator can't find the schema.
- **Modifying catalog during validation.** Not goroutine-safe. Build before spawning workers.

## 9. See also

- `authoring.md` — building the catalog.
- `xrpc-client.md` — validation around XRPC transport.
- `records.md` — `Blob`, `CIDLink`, AT-URI handling.
- `../shared/lexicon-spec.md §7–8` — strict vs. lenient rules.
- `../shared/record-model.md` — strongRef, blob shapes.
- `../shared/divergence-matrix.md §2` — how Go's strictness compares to Rust and TS.

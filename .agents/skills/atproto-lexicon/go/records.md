# Go — records, AT-URIs, TIDs, strongRef, blobs, typed dispatch

Companion to `validation.md`. Covers `atproto/data`, `atproto/syntax`, the legacy `lex/util` types, and `$type` dispatch.

## 1. AT-URIs — `atproto/syntax`

```go
import "github.com/bluesky-social/indigo/atproto/syntax"

uri, err := syntax.ParseATURI("at://did:plc:abc123/app.bsky.feed.post/3jwdwj2ctlk26")
if err != nil { return err }

uri.Authority()   // AtIdentifier — DID or handle
uri.Collection()  // NSID
uri.RecordKey()   // RecordKey
uri.Path()        // "/app.bsky.feed.post/3jwdwj2ctlk26"
uri.Normalize()   // returns a normalized ATURI
```

Always parse, never cast. `ATURI` is a typed wrapper over `string`; constructing from a raw string bypasses validation.

## 2. NSIDs, TIDs, RecordKeys

```go
nsid, err := syntax.ParseNSID("com.example.feed.post")
tid, err  := syntax.ParseTID("3jwdwj2ctlk26")
rk,  err  := syntax.ParseRecordKey("3jwdwj2ctlk26")

fresh := syntax.NewTIDNow(0)  // clockId 0; use distinct ids for multiple writers
```

`NSID`, `TID`, `RecordKey`, `ATURI`, `Handle`, `DID` are all string-typed — call `.String()` to serialize.

## 3. strongRef

`com.atproto.repo.strongRef` — `{uri, cid}`. In the generated `api/atproto` package:

```go
type RepoStrongRef struct {
    Cid string `json:"cid" cborgen:"cid"`
    Uri string `json:"uri" cborgen:"uri"`
}
func (t *RepoStrongRef) MarshalCBOR(w io.Writer) error
```

Build:

```go
import atproto "github.com/bluesky-social/indigo/api/atproto"

pin := &atproto.RepoStrongRef{
    Uri: "at://did:plc:abc123/app.bsky.feed.post/3jwdwj2ctlk26",
    Cid: "bafyrei...",     // plain string, NOT a cid-link
}
```

**Critical:** `Cid` is a plain string. It is not a `cid-link`, not `{$link: ...}`, not tag 42. See `../shared/record-model.md §strongRef`.

## 4. Blob refs — modern vs. legacy

Go maintains two stacks. Choose the right one for the context.

### Modern — `atproto/data`

```go
import "github.com/bluesky-social/indigo/atproto/data"

type Blob struct {
    Ref      CIDLink
    MimeType string
    Size     int64       // -1 means "legacy" blob
}
type CIDLink cid.Cid     // wraps go-cid
type Bytes []byte        // JSON: {"$bytes": "base64..."}
```

Build inline:

```go
import "github.com/ipfs/go-cid"

c, _ := cid.Decode("bafk...")
blob := data.Blob{
    Ref:      data.CIDLink(c),
    MimeType: "image/jpeg",
    Size:     12345,
}

rec := map[string]any{
    "$type":     "com.example.avatar",
    "image":     blob,    // data.UnmarshalJSON round-trips this shape
}
```

`data.UnmarshalJSON` recognizes both modern (`$type:"blob"`) and legacy (`{cid, mimeType}`) shapes and produces `Blob` instances.

### Extracting blobs

```go
blobs := data.ExtractBlobs(obj)   // walks the map, returns all Blob values
for _, b := range blobs {
    cidStr := cid.Cid(b.Ref).String()
    fmt.Printf("%s  %s  %d\n", cidStr, b.MimeType, b.Size)
}
```

### Legacy — `lex/util`

Generated `api/atproto` code still uses `lex/util.LexBlob`, not `data.Blob`:

```go
import lexutil "github.com/bluesky-social/indigo/lex/util"

type LexBlob struct {
    Ref      LexLink
    MimeType string
    Size     int64
}
type LexLink cid.Cid
```

When a generated record type has a blob field, it appears as `*lexutil.LexBlob`. If you're round-tripping between generated structs and modern `data.Blob` values, you'll need a conversion helper. Example:

```go
func blobToLex(b data.Blob) *lexutil.LexBlob {
    return &lexutil.LexBlob{
        Ref:      lexutil.LexLink(cid.Cid(b.Ref)),
        MimeType: b.MimeType,
        Size:     b.Size,
    }
}
```

See `../shared/divergence-matrix.md §4` — Rust and TypeScript do not have this split.

## 5. Typed `$type` dispatch — `lexutil.LexiconTypeDecoder`

Generated union fields are `*lexutil.LexiconTypeDecoder`:

```go
type LexiconTypeDecoder struct { Val cbg.CBORMarshaler }

func RegisterType(id string, val cbg.CBORMarshaler)   // generated init() does this
func NewFromType(typ string) (any, error)              // factory by $type
```

Dispatch by `$type`:

```go
typeName, err := data.ExtractTypeJSON(raw)
// or lexicon.ExtractTypeJSON(raw)
if err != nil { return err }

val, err := lexutil.NewFromType(typeName)
if err != nil { return err }
if err := json.Unmarshal(raw, val); err != nil { return err }
```

JSON-side unions are represented as sibling fields (`Foo_Bar`, `Foo_Baz`) on the parent struct — typical cbor-gen idiom. Exactly one non-nil field at a time.

## 6. Struct tag pair

Generated CBOR types carry both tags:

```go
type MyRecord struct {
    Text      string `json:"text" cborgen:"text"`
    CreatedAt string `json:"createdAt" cborgen:"createdAt"`
    Type_     string `json:"$type,const=com.example.note" cborgen:"$type,const=com.example.note"`
}
```

When authoring hand-written CBOR-marshaled types, include both. `cbor-gen` recognizes `cborgen:"$type,const=..."` for compile-time `$type` locking.

## 7. Pattern — fetch, validate, dispatch

```go
import (
    "context"
    "encoding/json"

    "github.com/bluesky-social/indigo/api/agnostic"
    "github.com/bluesky-social/indigo/atproto/data"
    "github.com/bluesky-social/indigo/atproto/lexicon"
    "github.com/bluesky-social/indigo/xrpc"
)

func fetchAndValidate(
    ctx context.Context, c *xrpc.Client, cat *lexicon.BaseCatalog,
    repo, collection, rkey string,
) (map[string]any, error) {
    out, err := agnostic.RepoGetRecord(ctx, c, "", collection, repo, rkey)
    if err != nil { return nil, err }

    obj, err := data.UnmarshalJSON(*out.Value)
    if err != nil { return nil, err }

    if err := lexicon.ValidateRecord(cat, obj, collection, lexicon.LenientMode); err != nil {
        return nil, err
    }
    return obj, nil
}
```

## 8. Pitfalls

- **Wrong stack for the context.** Generated code → `lex/util.LexBlob`; validator → `data.Blob`. Convert at the boundary.
- **Plain `json.Unmarshal` loses type structure.** `$link`, `$bytes`, `$type:"blob"` markers become raw sub-objects. Use `data.UnmarshalJSON`.
- **strongRef `cid` as CID-link.** Never. Plain string only.
- **Handle-based AT-URIs in persisted records.** Persist DIDs.
- **Missing both struct tags.** `cbor-gen` and `json` read different tags; hand-rolled types need both.
- **TID clock collisions.** Use distinct `clockId` values for independent writers.

## 9. See also

- `validation.md` — validating decoded values.
- `xrpc-client.md` — fetching records from a PDS.
- `../shared/at-uri.md` — AT-URI grammar.
- `../shared/record-model.md` — `$type`, strongRef, blob rules.
- `../../atproto-cid/go/` — CID parsing.
- `../../atproto-identity-resolution/` — `atproto/syntax` broader usage.
- `../../atproto-repository/go/` — CAR framing around record blocks.

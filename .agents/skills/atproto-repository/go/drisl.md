# Go — DAG-CBOR encoding via cbor-gen and `atdata`

Go's indigo stack encodes and decodes repo blocks through **two layers**:

1. **Typed structs** — `Commit`, `NodeData`, `EntryData`, `atdata.CIDLink`, `atdata.Bytes`, `atdata.Blob` — with cbor-gen-generated `MarshalCBOR` / `UnmarshalCBOR` methods. Used for every known block shape in the repo.
2. **Generic `map[string]any`** — via `atdata.UnmarshalCBOR` / `atdata.MarshalCBOR`, backed by `github.com/ipfs/go-ipld-cbor`. Used for decoding arbitrary records without a typed struct.

Both paths produce DRISL-compliant output **when the input is well-formed**. Neither re-implements DRISL validation — they rely on cbor-gen / go-ipld-cbor emitting canonical DAG-CBOR and reject non-canonical inputs only in specific cases. For strict validation of third-party input, layer extra checks or compare to an alternative implementation.

The term "DRISL" does not appear in the indigo codebase — Go talks about "DAG-CBOR" / "IPLD CBOR". For cross-language interop, the rules of `../shared/drisl.md` still apply; they're just not named.

## Typed encode / decode — cbor-gen generated code

The authoritative generated marshallers live next to their structs:

- `atproto/repo/cbor_gen.go` — `Commit.MarshalCBOR` / `UnmarshalCBOR`.
- `atproto/repo/mst/cbor_gen.go` — `NodeData` and `EntryData` marshallers.
- `atproto/atdata/cbor_gen.go` — the `Blob` struct marshaller.

Generated from `cborgen` struct tags via `github.com/whyrusleeping/cbor-gen`. To regenerate after a struct change, run the `gen.go` at the package root — but this skill doesn't cover regeneration flow; treat `cbor_gen.go` as read-only unless you own the struct.

```go
import (
    "bytes"
    "github.com/bluesky-social/indigo/atproto/repo"
)

var c repo.Commit
if err := c.UnmarshalCBOR(bytes.NewReader(blockBytes)); err != nil {
    return err
}

buf := new(bytes.Buffer)
if err := c.MarshalCBOR(buf); err != nil {
    return err
}
encoded := buf.Bytes()
```

cbor-gen-generated code sorts map keys in the order they appear in the struct declaration, **not** bytewise. For an atproto commit this works because the declaration order matches bytewise order (`data`, `did`, `prev`, `rev`, `sig`, `version`). **If you add a cbor-gen struct yourself and the struct-field order doesn't match bytewise order of the tags, your output will be non-canonical and fail CID verification.** Audit the struct tag order before generating; don't assume cbor-gen sorts for you.

## Generic record decode — `atdata`

For arbitrary records whose shape you don't have a struct for:

```go
import "github.com/bluesky-social/indigo/atproto/atdata"

// bytes is the raw DAG-CBOR block from the blockstore.
rec, err := atdata.UnmarshalCBOR(bytes)
if err != nil { return err }
// rec is map[string]any. $type, $link (→ CIDLink), $bytes (→ Bytes), blob objects (→ Blob) are
// parsed into their atproto-aware types.

// Round-trip to CBOR:
out, err := atdata.MarshalCBOR(rec)
```

`atdata` covers the **data model**, not just CBOR shape — it enforces:

- Container size limit: `MAX_CBOR_CONTAINER_LEN = 128 * 1024` elements per object / array.
- Record size limit: `MAX_CBOR_RECORD_SIZE = 1 MiB`, `MAX_JSON_RECORD_SIZE = 2 MiB`.
- Object key length: `MAX_OBJECT_KEY_LEN = 8192` bytes.
- String length: `MAX_RECORD_STRING_LEN = 1 MiB`.
- CID-link / bytes / blob shapes (exactly one `$link` / `$bytes` field; blobs carry `$type: "blob"` + `ref`/`mimeType`/`size`).

Exceeding a limit returns an error with the specific size / count. Constants are in `atproto/atdata/const.go`.

What `atdata` does **not** enforce:

- Map keys sorted bytewise on input (it relies on go-ipld-cbor, which does not strict-check).
- Integers in shortest form.
- No indefinite-length framing.

In practice the blocks you're decoding — commit, MST node, records produced by a conformant PDS — are canonical, so the decoder accepts them. If you're auditing potentially non-canonical input, cross-check CIDs by re-encoding and comparing bytes.

## `atdata.CIDLink` — the data-model cid-link wrapper

The data model defines CID references as `{"$link": "<cid-string>"}` in JSON and CBOR tag 42 in CBOR. `atdata.CIDLink` is the Go carrier:

```go
type CIDLink cid.Cid          // simple alias of github.com/ipfs/go-cid

func (ll CIDLink) CID() cid.Cid
func (ll CIDLink) String() string            // "" if undefined
func (ll CIDLink) IsDefined() bool           // false on zero-value
func (ll CIDLink) MarshalJSON() ([]byte, error)    // {"$link":"..."}
func (ll *CIDLink) UnmarshalJSON(raw []byte) error
func (ll *CIDLink) MarshalCBOR(w io.Writer) error  // tag 42
func (ll *CIDLink) UnmarshalCBOR(r io.Reader) error
```

When you embed a `cid.Cid` directly in a cbor-gen struct (like `Commit.Data`), cbor-gen produces tag-42 output by calling `cbg.WriteCid`. For structs you don't control or for generic data, wrap with `CIDLink` to get JSON `{"$link": ...}` and CBOR tag-42 emission for free.

`cid.Cid` in go-cid is a struct with a method `Defined() bool`. `CIDLink(zero).IsDefined() == false` — relying on the zero value means "no CID" in this ecosystem. A null pointer `*cid.Cid == nil` is how optional CID fields (like `Commit.Prev`) are represented.

## `atdata.Bytes` — the data-model bytes wrapper

```go
type Bytes []byte

// JSON: {"$bytes": "<base64 unpadded>"}
// CBOR: plain byte array (major type 2)
```

Used for binary fields inside records. Blobs have their own type (`atdata.Blob`) because they carry more metadata.

## `atdata.Blob` — the blob-reference wrapper

```go
type Blob struct {
    MimeType string
    Size     int64
    Ref      CIDLink
}
```

Blob objects round-trip to JSON as `{"$type": "blob", "ref": {"$link": "..."}, "mimeType": "...", "size": N}` and to CBOR with the same shape.

To find every blob referenced by a record:

```go
blobs := atdata.ExtractBlobs(rec)    // Returns []atdata.Blob by walking the tree
```

Useful when a consumer needs to fetch `com.atproto.sync.getBlob` for every blob in a record.

## Validation helpers

```go
func atdata.Validate(obj map[string]any) error
```

Runs `parseObject` on an already-decoded map and returns an error if any atproto-data-model constraint fails (sizes, `$link` / `$bytes` / `blob` shape). Use this to gate data you built in memory before writing it out.

## Varints and CAR framing

The DRISL-level varint encoding (CAR frame length prefix, not part of a block itself) isn't exposed directly in `indigo`. It's used only by the `github.com/ipld/go-car` library during CAR read/write. See `car.md` for how blocks flow through that.

## Common errors

| Error                                             | Cause                                                                                |
| ------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `exceeded max CBOR record size: N`                | Record is larger than `MAX_CBOR_RECORD_SIZE` (1 MiB). PDSes enforce this.            |
| `data object has too many fields: N`              | Object has > `MAX_CBOR_CONTAINER_LEN` fields. Likely adversarial input.              |
| `unexpected type: X`                              | `parseAtom` found a Go value it can't map to the atproto data model. Fix the producer. |
| `tried to marshal nil or undefined cid-link`      | A `CIDLink` was serialized while unset. Use `*CIDLink` for optional fields.          |
| `parsing cid-link CID: …`                         | `$link` string didn't parse. Usually a bare string instead of `{"$link": "..."}`.    |
| `string too long: N`                              | Field exceeds `MAX_RECORD_STRING_LEN` (1 MiB).                                       |

## File pointers

| Concern                     | File                                            |
| --------------------------- | ----------------------------------------------- |
| `Commit` CBOR               | `atproto/repo/commit.go` + `cbor_gen.go`        |
| `NodeData` / `EntryData` CBOR | `atproto/repo/mst/encoding.go` + `cbor_gen.go` |
| Generic record decode       | `atproto/atdata/data.go` (`UnmarshalCBOR`, `UnmarshalJSON`) |
| Atom / map / array parse    | `atproto/atdata/parse.go`                       |
| `CIDLink`                   | `atproto/atdata/cidlink.go`                     |
| `Bytes`                     | `atproto/atdata/bytes.go`                       |
| `Blob`                      | `atproto/atdata/blob.go`                        |
| Size / count constants      | `atproto/atdata/const.go`                       |
| CBOR extract helpers        | `atproto/atdata/extract.go`                     |

## See also

- `../shared/drisl.md` — language-neutral canonical DAG-CBOR (DRISL) rules. Rules Go must conform to, even though the Go code doesn't say "DRISL".
- `car.md` — where blocks flow through CAR v1.
- `mst.md` — `NodeData` / `EntryData` encoding.
- `commit.md` — `Commit.UnsignedBytes()` and its cbor-gen-generated bytes.
- `../shared/divergence-matrix.md` §drisl — Go's declaration-order sort vs Rust's bytewise sort.

# Go — Parsing a CID

Every parse below must be followed by `daslcid.Assert(c, opt)` (from `README.md`). `go-cid` is permissive by design; it will parse CIDv0 `Qm…`, dag-pb CIDs, and non-SHA-256 hashes without complaint.

## From a string

```go
import (
    "github.com/ipfs/go-cid"
    "example.com/yourpkg/daslcid"
)

s := "bafyreihunttf7a3uvtzrgbnyu2rzv24w4zx7xjwqgk4x5w7n5yvq7u7aua"
c, err := cid.Decode(s)                          // sync; accepts any multibase
if err != nil {
    return fmt.Errorf("parse: %w", err)
}
if err := daslcid.Assert(c, daslcid.Options{}); err != nil {
    return err
}
```

`cid.Decode` sniffs the multibase prefix: `b` → base32lower (DASL default), `z` → base58btc (CIDv0), `m` → base64. For DASL-only input, reject anything that isn't a v1 with dag-cbor/raw codec — the `Assert` call does this. No per-base argument needed; `go-cid` handles the prefix internally.

There is also `cid.Parse(any)` which accepts a `string`, `[]byte`, or `cid.Cid` and routes appropriately. Prefer `Decode` for strings and `Cast` for bytes — the type-switchy `Parse` is error-prone in generic code paths.

## From 36 raw bytes (CAR block frame)

```go
bytes := readExact(reader, 36)
c, err := cid.Cast(bytes)                        // strict — expects exact CID bytes
if err != nil {
    return fmt.Errorf("cast: %w", err)
}
if err := daslcid.Assert(c, daslcid.Options{}); err != nil {
    return err
}
```

`cid.Cast` expects the buffer to be exactly a CID. If there's trailing data, use `cid.CidFromBytes` instead:

```go
c, nRead, err := cid.CidFromBytes(buf)           // returns bytes consumed
if err != nil {
    return fmt.Errorf("cid from bytes: %w", err)
}
remainder := buf[nRead:]
```

`CidFromBytes` is the right tool for CAR block framing where the block-length varint tells you the CID + data total length but the CID byte count is known only after parsing. You consume the CID, and the remainder is the payload.

## Streaming from a reader

```go
import "github.com/ipfs/go-cid"

c, err := cid.CidFromReader(reader)              // reads exactly the CID bytes
if err != nil {
    return fmt.Errorf("read cid: %w", err)
}
if err := daslcid.Assert(c, daslcid.Options{}); err != nil {
    return err
}
```

`cid.CidFromReader` is convenient for CAR parsing: it pulls the header bytes, figures out the multihash length from the header, and reads exactly that many bytes. It does not require the caller to know the CID's total size ahead of time.

## From a DAG-CBOR byte string (tag 42)

With `go-ipld-prime`'s dagcbor codec, CID values are automatically decoded from tag-42 byte strings:

```go
import (
    "bytes"
    ipld "github.com/ipld/go-ipld-prime"
    "github.com/ipld/go-ipld-prime/codec/dagcbor"
    "github.com/ipld/go-ipld-prime/node/basicnode"
)

nb := basicnode.Prototype.Any.NewBuilder()
if err := dagcbor.Decode(nb, bytes.NewReader(cborBytes)); err != nil {
    return err
}
node := nb.Build()
// Walk the node; any CID-typed field comes back as a Go cid.Cid value.
```

When using the indigo `atproto/data` package, unmarshalling into a struct with `cid.Cid`-typed fields works directly — the library handles tag 42 + identity multibase prefix stripping:

```go
import atdata "github.com/bluesky-social/indigo/atproto/data"

type MstEntry struct {
    P int32            `cborgen:"p"`
    K []byte           `cborgen:"k"`
    V cid.Cid          `cborgen:"v"`
    T *cid.Cid         `cborgen:"t,omitempty"`
}

var entry MstEntry
if err := atdata.UnmarshalCBOR(cborBytes, &entry); err != nil {
    return err
}
if err := daslcid.Assert(entry.V, daslcid.Options{}); err != nil {
    return err
}
```

Hand-decoding tag 42 manually is almost never the right move — use a decoder that recognizes it. If you *must* hand-decode (debugging a malformed payload), extract the 37-byte tag-42 byte string, drop the first byte (the `0x00` identity multibase), and pass the remaining 36 bytes to `cid.Cast`.

## From a JSON `$link`

AT Protocol's JSON convention is `{"$link": "bafyrei…"}`. Neither `encoding/json` nor `go-ipld-prime/codec/dagjson` knows about `$link` directly — `dagjson` uses `{"/": "..."}` (the dag-json convention). You unmarshal into a struct and pass the string through `cid.Decode`:

```go
type Link struct {
    Link string `json:"$link"`
}
type BlobRef struct {
    Type     string `json:"$type"`
    Ref      Link   `json:"ref"`
    MimeType string `json:"mimeType"`
    Size     int64  `json:"size"`
}

var ref BlobRef
if err := json.Unmarshal(body, &ref); err != nil {
    return err
}
c, err := cid.Decode(ref.Ref.Link)
if err != nil {
    return fmt.Errorf("parse $link: %w", err)
}
if err := daslcid.Assert(c, daslcid.Options{}); err != nil {
    return err
}
```

When emitting JSON, mirror the convention: `Link{Link: c.String()}`. Never emit a bare string for a CID field.

If the producer handed you a bare string instead of `{"$link": "…"}`, treat it as malformed and reject. Silent promotion breaks canonicalization downstream.

## Error handling

`go-cid` and `go-multihash` expose sentinel errors. Match with `errors.Is`:

```go
import (
    "errors"
    "github.com/ipfs/go-cid"
    mh "github.com/multiformats/go-multihash"
)

c, err := cid.Decode(input)
switch {
case errors.Is(err, cid.ErrCidTooShort):
    return fmt.Errorf("truncated cid: %w", err)
case errors.Is(err, cid.ErrInvalidCid):
    return fmt.Errorf("malformed cid: %w", err)
case errors.Is(err, mh.ErrUnknownCode):
    return fmt.Errorf("unsupported hash: %w", err)
case err != nil:
    return fmt.Errorf("cid decode: %w", err)
}
```

Sentinel list (not exhaustive, check the package docs):

- `cid.ErrCidTooShort` — buffer shorter than the minimum header.
- `cid.ErrInvalidCid` — header bytes don't form a valid CID.
- `cid.ErrVarintBuffSmall` — multihash length varint overflowed the buffer.
- `mh.ErrUnknownCode` — hash function code not registered in the multihash codec table.
- `mh.ErrLenTooLarge`, `mh.ErrInconsistentLen` — length field conflicts with data.

Wrap all of these in your own typed error at the service boundary if you want callers to distinguish "bad user input" from internal parse failures.

## Validation vs verification

Parsing confirms *shape*. To confirm *content* (the digest matches the bytes), re-hash:

```go
import (
    "bytes"
    "crypto/sha256"
    "github.com/ipfs/go-cid"
    mh "github.com/multiformats/go-multihash"
)

func VerifyCid(c cid.Cid, data []byte) (bool, error) {
    sum := sha256.Sum256(data)
    h, err := mh.Encode(sum[:], mh.SHA2_256)
    if err != nil {
        return false, err
    }
    expected := cid.NewCidV1(c.Prefix().Codec, h)
    return c.Equals(expected), nil
}
```

Use `c.Equals(other)`, never `c.String() == other.String()` — binary comparison is authoritative.

## Common parse failures

| Symptom                                          | Cause                                                                 |
| ------------------------------------------------ | --------------------------------------------------------------------- |
| `ErrUnknownCode` on hash `0x13` or `0x17`        | SHA-512 or SHA3-256 — not DASL. Reject.                               |
| `ErrInvalidCid` on input starting with `Qm`      | CIDv0. `go-cid` accepts it; `Assert` rejects. Do not `c.Prefix()` promote to v1 — the lossless upgrade yields dag-pb, still not DASL. |
| `ErrCidTooShort` on CAR block read               | Used `cid.Cast` on a buffer with trailing block data. Use `cid.CidFromBytes` or `cid.CidFromReader`. |
| `Assert` fails with "codec must be dag-cbor or raw" | Producer sent `0x70` (dag-pb). Reject.                             |
| `Assert` fails with "digest length must be 32"   | Non-32-byte digest (e.g., SHA-512 truncation). Reject.                |

## See also

- `construction.md` — the reverse direction.
- `codecs.md` — the shipped codec constants.
- `../shared/spec.md` — rules the gate enforces.
- `../shared/divergence-matrix.md` — why the DASL gate exists in TypeScript and Go but not in Rust.

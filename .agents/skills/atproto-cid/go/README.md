# Go (go-cid / go-multihash)

The Go ecosystem for CIDs is [`github.com/ipfs/go-cid`](https://pkg.go.dev/github.com/ipfs/go-cid) paired with [`github.com/multiformats/go-multihash`](https://pkg.go.dev/github.com/multiformats/go-multihash). Both are maintained by IPFS and are the same libraries used inside [`indigo`](https://github.com/bluesky-social/indigo) (Bluesky's Go implementation).

Like TypeScript, there is **no shipped DASL-strict wrapper**. DASL validation is a caller-owned gate applied after every parse. Unlike TypeScript, codec constants are shipped directly off the `cid` package — that's the one ergonomic win Go has over the other two ecosystems.

## Dependencies

```bash
go get github.com/ipfs/go-cid
go get github.com/multiformats/go-multihash
```

For DAG-CBOR encoding of records (not just the CID wrapper), add:

```bash
go get github.com/ipld/go-ipld-prime
```

and use the `codec/dagcbor` subpackage. For production use in the Bluesky ecosystem, `github.com/bluesky-social/indigo/atproto/data` provides DRISL-strict marshal/unmarshal on top of the ipld-prime stack; prefer it when available.

## Core imports

```go
import (
    "github.com/ipfs/go-cid"
    mh "github.com/multiformats/go-multihash"
)
```

The `mh` alias is an established convention throughout Go CID code — preserve it when reviewing or generating.

## The DASL gate — your validator

Because `go-cid` is permissive (parses CIDv0 `Qm…` and `dag-pb` CIDs without complaint), write a tiny gate and call it after every parse:

```go
package daslcid

import (
    "errors"
    "fmt"

    "github.com/ipfs/go-cid"
    mh "github.com/multiformats/go-multihash"
)

const (
    DagCBOR uint64 = 0x71
    Raw     uint64 = 0x55
    SHA256  uint64 = 0x12
    BLAKE3  uint64 = 0x1e
)

var (
    ErrNotV1         = errors.New("dasl: CID version 1 required")
    ErrBadCodec      = errors.New("dasl: codec must be dag-cbor or raw")
    ErrBadHashCode   = errors.New("dasl: hash must be SHA-256 (or BLAKE3 under BDASL)")
    ErrBadDigestLen  = errors.New("dasl: digest length must be 32")
)

type Options struct {
    AllowBLAKE3 bool
}

func Assert(c cid.Cid, opt Options) error {
    if c.Version() != 1 {
        return fmt.Errorf("%w: got v%d", ErrNotV1, c.Version())
    }
    codec := c.Prefix().Codec
    if codec != DagCBOR && codec != Raw {
        return fmt.Errorf("%w: got 0x%x", ErrBadCodec, codec)
    }
    decoded, err := mh.Decode(c.Hash())
    if err != nil {
        return fmt.Errorf("dasl: multihash decode: %w", err)
    }
    if decoded.Code != SHA256 && !(opt.AllowBLAKE3 && decoded.Code == BLAKE3) {
        return fmt.Errorf("%w: got 0x%x", ErrBadHashCode, decoded.Code)
    }
    if decoded.Length != 32 {
        return fmt.Errorf("%w: got %d", ErrBadDigestLen, decoded.Length)
    }
    return nil
}
```

Call `Assert(c, Options{})` after every `cid.Decode` / `cid.Cast` / `cid.Parse` on a CID from an untrusted source. If you want BLAKE3 (BDASL) support, pass `Options{AllowBLAKE3: true}` at that specific gate call — do not loosen the default.

Go has no `asserts cid is DaslCid` equivalent to TypeScript, so the gate returns an error and the caller is expected to handle it. If you want nominal typing, wrap in a struct:

```go
type DaslCid struct{ cid.Cid }

func NewDaslCid(c cid.Cid, opt Options) (DaslCid, error) {
    if err := Assert(c, opt); err != nil {
        return DaslCid{}, err
    }
    return DaslCid{c}, nil
}
```

This gives you a type that downstream code can take to signal "already validated."

## Canonical DAG-CBOR encoding

For a record → CID pipeline, never use `encoding/gob`, `encoding/json`, or a general-purpose CBOR library (`fxamacker/cbor` is not DRISL-strict by default). Use `github.com/ipld/go-ipld-prime/codec/dagcbor` or (preferred for AT Protocol) the `indigo` data package:

```go
import atdata "github.com/bluesky-social/indigo/atproto/data"

bytes, err := atdata.MarshalCBOR(record)   // DRISL-canonical
```

If the indigo data package isn't available in your dependency set, use `dagcbor.Encode` on an `ipld.Node` value; the library handles map key sorting, tag 42 for CIDs, and integer shortest-form per the spec.

To double-check a record against ground truth, call `lexicon-garden`'s `create_record_cid`.

## Idioms Go engineers expect

- **Errors are sentinel values, compared with `errors.Is`.** Wrap them with `fmt.Errorf("%w: …", sentinel, …)` so callers can still match. The gate above follows this pattern.
- **`c.Bytes()` is a method** — not a field — and returns the 36-byte binary form. Equivalent to Rust's `cid.to_bytes()` and TypeScript's `cid.bytes` *property*. Porting between Go and TypeScript is where the method-vs-property bug usually shows up.
- **Comparing CIDs uses `a.Equals(b)`.** Don't compare strings. `==` on `cid.Cid` is a Go struct comparison and happens to work (CID is comparable), but prefer `Equals` for clarity.
- **`cid.Undef` is the zero value** — `if c == cid.Undef { … }` checks for "unset." Do not panic on an undef CID; return an error.
- **Parsing is synchronous.** Unlike TypeScript, hashing is also synchronous (`crypto/sha256` and `go-multihash` are both blocking). No async concerns.
- **JSON marshalling emits `{"/": "..."}`** if you use `go-ipld-prime`'s dagjson codec. AT Protocol uses `{"$link": "..."}` — you must roll your own JSON for CID fields, e.g.:

  ```go
  type Link struct {
      Link string `json:"$link"`
  }
  type BlobRef struct {
      Ref      Link   `json:"ref"`
      MimeType string `json:"mimeType"`
      Size     int    `json:"size"`
  }
  ```

## Next

- Parsing paths → `parsing.md`
- Construction → `construction.md`
- Codec constants (the one win Go has) → `codecs.md`
- Cross-language differences → `../shared/divergence-matrix.md`

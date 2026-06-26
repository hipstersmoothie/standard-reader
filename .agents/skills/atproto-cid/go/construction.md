# Go — Constructing a CID

All construction paths here are synchronous — `crypto/sha256` and `go-multihash` are blocking functions. No `context` plumbing, no goroutines needed.

## 1. DAG-CBOR record → CID

If you have a record you want to encode and hash in one go, use the indigo `atproto/data` package (DRISL-strict) or `go-ipld-prime/codec/dagcbor` paired with `go-multihash`:

```go
import (
    "github.com/ipfs/go-cid"
    mh "github.com/multiformats/go-multihash"
    atdata "github.com/bluesky-social/indigo/atproto/data"
)

record := map[string]any{
    "$type":       "app.bsky.actor.profile",
    "displayName": "Alice",
}

cborBytes, err := atdata.MarshalCBOR(record)
if err != nil {
    return cid.Undef, err
}
c, err := cidFromDagCbor(cborBytes)
if err != nil {
    return cid.Undef, err
}
```

Define `cidFromDagCbor` once in your codebase:

```go
func cidFromDagCbor(bytes []byte) (cid.Cid, error) {
    h, err := mh.Sum(bytes, mh.SHA2_256, 32)
    if err != nil {
        return cid.Undef, err
    }
    return cid.NewCidV1(cid.DagCBOR, h), nil
}
```

`mh.Sum` hashes and wraps into a multihash in one call. `cid.NewCidV1` takes the codec constant and the multihash and assembles the CID. Neither step allocates more than a handful of small buffers; this is hot-path-safe.

**Never use `encoding/json` or a general-purpose CBOR library for the encode step.** `atdata.MarshalCBOR` / `dagcbor.Encode` produce DRISL-canonical bytes (sorted keys, shortest-form integers, no indefinite-length items). Non-canonical bytes produce a different digest and your CIDs will disagree with other AT Protocol implementations.

## 2. Pre-encoded DAG-CBOR bytes → CID

If you already have canonical DAG-CBOR bytes (received from the wire, already-encoded record), skip the encode step:

```go
cborBytes := /* canonical DRISL-strict CBOR */
c, err := cidFromDagCbor(cborBytes)
```

This is the hash-and-wrap path for blocks pulled out of a CAR file, or for re-computing a CID on a record you just received.

## 3. Raw blob → CID

For opaque binary content (images, video, arbitrary attachments):

```go
func cidFromRawBytes(bytes []byte) (cid.Cid, error) {
    h, err := mh.Sum(bytes, mh.SHA2_256, 32)
    if err != nil {
        return cid.Undef, err
    }
    return cid.NewCidV1(cid.Raw, h), nil
}
```

Only the codec constant changes from the dag-cbor path. `cid.Raw = 0x55` means "the content is opaque bytes, don't try to decode." Images and binary attachments in AT Protocol always use this codec.

## 4. Via `cid.Prefix`

For use cases where you want to fix the CID shape up front and stamp many payloads (e.g., hashing a stream of blocks):

```go
prefix := cid.Prefix{
    Version:  1,
    Codec:    cid.DagCBOR,
    MhType:   mh.SHA2_256,
    MhLength: 32,
}

c, err := prefix.Sum(payload)
if err != nil {
    return cid.Undef, err
}
```

`prefix.Sum(payload)` encapsulates "hash with `MhType`, wrap into multihash, build CIDv1 with `Codec`." It's the same work as the two-step version; pick the ergonomic form that matches your surrounding code.

## 5. Assemble manually from a pre-computed digest

Rare — most commonly when you have a pre-computed SHA-256 from a trusted source:

```go
import (
    "github.com/ipfs/go-cid"
    mh "github.com/multiformats/go-multihash"
)

var digestBytes [32]byte    // pre-computed SHA-256
h, err := mh.Encode(digestBytes[:], mh.SHA2_256)
if err != nil {
    return cid.Undef, err
}
c := cid.NewCidV1(cid.DagCBOR, h)
```

`mh.Encode` wraps an already-computed digest into a multihash buffer — no hashing. Reach for this only when you have a strong reason not to re-hash (trusted upstream, deterministic fixture).

## BLAKE3 (BDASL)

When the surrounding platform explicitly opts in to BDASL for blob content:

```go
import mh "github.com/multiformats/go-multihash"

h, err := mh.Sum(blobBytes, mh.BLAKE3, 32)
if err != nil {
    return cid.Undef, err
}
c := cid.NewCidV1(cid.Raw, h)
```

`go-multihash` ships `mh.BLAKE3 = 0x1e`. Keep BLAKE3 scoped to blob contexts — records, MST nodes, and commits are always SHA-256 even in a BDASL-enabled platform. The DASL gate rejects `0x1e` by default; callers that want BDASL pass `daslcid.Options{AllowBLAKE3: true}`.

Older versions of `go-multihash` didn't ship BLAKE3 by default; check that `mh.BLAKE3` exists in your pinned version. If not, upgrade rather than registering an external implementation — register-at-init is a global-state footgun.

## Serialising back out

```go
s := c.String()                 // "bafyrei..." — base32lower by default for v1
b := c.Bytes()                  // 36-byte binary form (no identity prefix)
```

Both are cheap. For emitting a CID inside a DAG-CBOR value, let the encoder handle tag 42 + identity-multibase prefix — don't hand-roll that wrapper. For emitting JSON, wrap in `{"$link": s}`, not `{"/": s}`:

```go
type Link struct{ Link string `json:"$link"` }

linkField := Link{Link: c.String()}
```

Remember the 36 vs 37 distinction: `c.Bytes()` returns 36 bytes (CAR block frame form). The 37-byte form only appears *inside* DAG-CBOR tag-42 byte strings (`0x00` identity-multibase prefix + 36 CID bytes), and the encoder produces that automatically.

## Round-trip test

This should hold for every construction path:

```go
record := map[string]any{"$type": "app.bsky.feed.post", "text": "hi"}

cborBytes, err := atdata.MarshalCBOR(record)
if err != nil { t.Fatal(err) }

viaRecord, err := cidFromDagCbor(cborBytes)
if err != nil { t.Fatal(err) }

// Decode + re-encode, rebuild:
var redecoded map[string]any
if err := atdata.UnmarshalCBOR(cborBytes, &redecoded); err != nil { t.Fatal(err) }
cborAgain, err := atdata.MarshalCBOR(redecoded)
if err != nil { t.Fatal(err) }
rebuilt, err := cidFromDagCbor(cborAgain)
if err != nil { t.Fatal(err) }

if !viaRecord.Equals(rebuilt) {
    t.Fatal("encoder is non-canonical")
}
```

If these disagree, the encoder is non-canonical — check map key sort order, integer shortest form, and indefinite-length framing (see `../shared/divergence-matrix.md` and the `atproto-repository` skill).

## Common construction mistakes

| Symptom                                              | Cause                                                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------- |
| "Same record produces different CIDs on two machines" | You used `encoding/json` or `fxamacker/cbor` (not DRISL-strict by default). Switch to the indigo `atproto/data` package or `go-ipld-prime/codec/dagcbor`. |
| `mh.Sum` returns `ErrSumNotSupported`                | You passed an unregistered hash code. SHA2-256 and BLAKE3 (recent versions) are both registered; anything else isn't DASL anyway. |
| CID has version 0                                    | You called `cid.NewCidV0(h)` instead of `cid.NewCidV1(codec, h)`. CIDv0 is never DASL. |
| Prefix mismatch (wrong codec)                        | You stamped a record CID with `cid.Raw` or a blob CID with `cid.DagCBOR`. Content type must match codec. |
| "Manual assembly produces a CID with wrong header"   | You used `mh.Sum(digest, mh.SHA2_256, 32)` where `digest` was already hashed. `mh.Sum` hashes its input; for a pre-computed digest use `mh.Encode`. |

## See also

- `parsing.md` — the reverse direction.
- `codecs.md` — where `cid.DagCBOR` and `cid.Raw` come from.
- `../shared/binary-layout.md` — the 36-byte layout `cid.NewCidV1` is producing.
- `../shared/test-vectors.md` — expected CIDs for given inputs.
- `../shared/divergence-matrix.md` — why Go construction stays synchronous and TypeScript does not.

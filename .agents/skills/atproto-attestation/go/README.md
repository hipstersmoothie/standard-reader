# Go — setup & idioms

No canonical Go library for badge.blue attestations exists at the time of writing. The stack below uses stdlib where possible and well-maintained community libraries for the gaps.

## Library stack

| Concern            | Recommended library                              | Notes                                                                           |
| ------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------- |
| DAG-CBOR           | `github.com/ipld/go-ipld-prime` + `/codec/dagcbor` | Official IPLD; canonical DAG-CBOR with sort-order guarantees.                   |
| CID                | `github.com/ipfs/go-cid` + `github.com/multiformats/go-multihash` | Canonical CIDv1 construction.                                                   |
| SHA-256            | stdlib `crypto/sha256`                           | Fine; output fed into go-multihash.                                             |
| ECDSA P-256 / P-384| stdlib `crypto/ecdsa` + `crypto/elliptic`        | Built in; curves are `elliptic.P256()`, `elliptic.P384()`.                      |
| ECDSA K-256        | `github.com/decred/dcrd/dcrec/secp256k1/v4` + `.../ecdsa` | Stdlib doesn't ship secp256k1. dcrec is the de facto Go impl.                   |
| Base64             | stdlib `encoding/base64`                         | `base64.StdEncoding` for spec compliance (not URL-safe).                        |
| TID                | `github.com/bluesky-social/indigo/atproto/syntax` (or hand-roll) | For rkey generation.                                                            |

`go.mod`:

```
require (
    github.com/ipld/go-ipld-prime v0.21.0
    github.com/ipfs/go-cid v0.4.1
    github.com/multiformats/go-multihash v0.2.3
    github.com/decred/dcrd/dcrec/secp256k1/v4 v4.3.0
)
```

Versions drift; pin to whatever resolves cleanly at `go mod tidy` time.

## ATProto record representation in Go

Records are `map[string]any` for full generality, or a typed struct with `json:"..."` tags if you know the shape. The IPLD tooling consumes either via its `node.Node` abstraction, but the JSON-path is ergonomic for most callers.

```go
type AttestedRecord = map[string]any

type InlineAttestation struct {
    Type      string        `json:"$type"`
    Key       string        `json:"key"`
    Cid       string        `json:"cid"`
    Signature BytesWrapper  `json:"signature"`
    // plus any extra metadata fields
}

type BytesWrapper struct {
    Bytes string `json:"$bytes"`
}

type RemoteAttestation struct {
    Type string `json:"$type"` // com.atproto.repo.strongRef
    Uri  string `json:"uri"`
    Cid  string `json:"cid"`
}
```

For CID computation, you'll work with `map[string]any` — the IPLD encoder handles arbitrary shapes.

## DAG-CBOR via `go-ipld-prime`

```go
import (
    "bytes"

    "github.com/ipld/go-ipld-prime/codec/dagcbor"
    "github.com/ipld/go-ipld-prime/node/bindnode"
    cbornode "github.com/ipld/go-ipld-prime/node/basicnode"
)

func encodeDagCbor(obj any) ([]byte, error) {
    // Convert obj (map[string]any) to an ipld.Node.
    node, err := toIPLDNode(obj)
    if err != nil {
        return nil, err
    }
    var buf bytes.Buffer
    if err := dagcbor.Encode(node, &buf); err != nil {
        return nil, err
    }
    return buf.Bytes(), nil
}
```

`toIPLDNode` for arbitrary JSON-like maps is the annoying part — the IPLD world prefers typed schemas. For `map[string]any` → `ipld.Node`:

```go
import (
    "github.com/ipld/go-ipld-prime"
    "github.com/ipld/go-ipld-prime/node/basicnode"
    "github.com/ipld/go-ipld-prime/fluent/qp"
)

func toIPLDNode(v any) (ipld.Node, error) {
    return qp.BuildMap(basicnode.Prototype.Any, -1, func(ma ipld.MapAssembler) {
        buildNode(ma, v)
    })
}

func buildNode(ma ipld.MapAssembler, v any) {
    // Recursive walker — implementation left to reader.
    // Key insight: go-ipld-prime will canonicalize DAG-CBOR map keys for you
    // (sorted by UTF-8 byte sequence) when you pass anything to its encoder.
}
```

Alternative: use `github.com/fxamacker/cbor/v2` with deterministic options. It doesn't enforce IPLD DAG-CBOR rules out of the box, but:

```go
em, _ := cbor.CoreDetEncOptions().EncMode()
bytes, err := em.Marshal(obj)
```

`CoreDetEncOptions` gives deterministic output with sorted keys and minimal integer encoding — close enough to DAG-CBOR for most fields. **Caveat**: CBOR tag 42 (CID links) is not emitted by fxamacker/cbor without registering custom codecs, so if your metadata contains CIDs (e.g., a `$link` wrapper that should become a tag-42 byte string), you need either go-ipld-prime or a custom MarshalerJSON-like trait. For attestation metadata that's strings-only (common case), fxamacker is fine.

Recommendation: use go-ipld-prime for correctness, fall back to fxamacker/cbor only if the toolchain cost is too steep.

## CID construction

```go
import (
    "crypto/sha256"

    "github.com/ipfs/go-cid"
    "github.com/multiformats/go-multihash"
)

func dagCborCID(dagCborBytes []byte) (cid.Cid, error) {
    hash := sha256.Sum256(dagCborBytes)
    mh, err := multihash.Encode(hash[:], multihash.SHA2_256)
    if err != nil {
        return cid.Undef, err
    }
    return cid.NewCidV1(cid.DagCBOR, mh), nil
}

// Usage:
c, _ := dagCborCID(cborBytes)
// c.String()  → "bafyrei..."
// c.Bytes()   → 36-byte binary form — THIS is what we sign
```

`cid.DagCBOR` is `0x71`. `multihash.SHA2_256` is `0x12`. Together with `cid.NewCidV1` you get the right shape.

## ECDSA with stdlib (P-256, P-384)

```go
import (
    "crypto/ecdsa"
    "crypto/elliptic"
    "crypto/rand"
    "crypto/sha256"
    "math/big"
)

priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)

digest := sha256.Sum256(cidBytes) // 32-byte digest
r, s, _ := ecdsa.Sign(rand.Reader, priv, digest[:])
// r, s are *big.Int

// P1363 encode: left-pad r and s to 32 bytes each.
rs := encodeP1363(r, s, 32)

// Low-S normalize for P-256
curveN := priv.Curve.Params().N
halfN := new(big.Int).Rsh(curveN, 1)
if s.Cmp(halfN) == 1 {
    s = new(big.Int).Sub(curveN, s)
    rs = encodeP1363(r, s, 32)
}
```

Helper:

```go
func encodeP1363(r, s *big.Int, byteLen int) []byte {
    out := make([]byte, byteLen*2)
    rb := r.Bytes()
    sb := s.Bytes()
    copy(out[byteLen-len(rb):byteLen], rb)
    copy(out[byteLen*2-len(sb):], sb)
    return out
}
```

### Why stdlib uses `SignASN1` for DER

`ecdsa.SignASN1` returns DER-encoded sigs — do **not** use this for attestations, or you'll need to convert. Use the lower-level `ecdsa.Sign` (returns `r, s *big.Int`) and P1363-encode yourself.

### Verifying

```go
verified := ecdsa.Verify(&priv.PublicKey, digest[:], r, s)
```

Go stdlib verifies are permissive (accept high-S). For strict low-S:

```go
if s.Cmp(halfN) == 1 {
    return false // reject high-S
}
verified := ecdsa.Verify(&pub, digest[:], r, s)
```

## ECDSA K-256 via `dcrec`

```go
import (
    "crypto/rand"
    "crypto/sha256"

    "github.com/decred/dcrd/dcrec/secp256k1/v4"
    k256ecdsa "github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
)

priv, _ := secp256k1.GeneratePrivateKey()
pub := priv.PubKey()

digest := sha256.Sum256(cidBytes)

// Signing — produces a low-S signature by default in dcrd's ECDSA.
sig := k256ecdsa.Sign(priv, digest[:])
r := sig.R()
s := sig.S()

rs := make([]byte, 64)
rBytes := r.Bytes()
sBytes := s.Bytes()
copy(rs[32-len(rBytes):32], rBytes)
copy(rs[64-len(sBytes):], sBytes)

// Verify
ok := sig.Verify(digest[:], pub)
```

`dcrec`'s `ecdsa.Sign` enforces low-S internally — see their source. Still, explicit:

```go
halfN := new(big.Int).Rsh(secp256k1.S256().N, 1)
if s.Cmp(halfN) == 1 {
    // should not happen with dcrd's Sign, but defensive
}
```

### `btcec`

`github.com/btcsuite/btcd/btcec/v2` is another option for secp256k1 with essentially identical API. Either works; dcrec is lighter.

## DID key encoding

```go
import (
    "github.com/multiformats/go-multibase"
    "github.com/multiformats/go-varint"
)

func formatDidKey(curve string, compressedPub []byte) (string, error) {
    var codec uint64
    switch curve {
    case "p256":
        codec = 0x1200
    case "k256":
        codec = 0xe7
    case "p384":
        codec = 0x1201
    default:
        return "", fmt.Errorf("unknown curve")
    }
    prefix := varint.ToUvarint(codec)
    buf := append(prefix, compressedPub...)
    enc, err := multibase.Encode(multibase.Base58BTC, buf)
    if err != nil {
        return "", err
    }
    return "did:key:" + enc, nil
}
```

Or use `github.com/bluesky-social/indigo/atproto/crypto` which already has this.

## Bluesky's indigo as reference

The `bluesky-social/indigo` project has Go-idiomatic atproto primitives: DID resolution, TIDs, canonical CBOR, and signing. It does **not** yet have a badge.blue attestation module, but these pieces are reusable:

- `atproto/crypto` — K-256/P-256 signing and verification (uses dcrec); has `did:key:` helpers.
- `atproto/syntax` — TID, NSID, AT-URI parsers.
- `atproto/data` — canonical DAG-CBOR (similar to our needs).

Using indigo's `atproto/crypto` saves you from hand-assembling the ECDSA primitives in this file — strong recommendation if you're building a full-stack Go atproto app.

## Error handling

Go-style: every function returns `(T, error)`. Unlike the Rust reference crate's numbered error codes, there's no convention — name your errors:

```go
var (
    ErrRecordNotObject       = errors.New("record must be a JSON object")
    ErrMetadataMissingType   = errors.New("metadata missing $type")
    ErrContentCidMismatch    = errors.New("content CID mismatch")
    ErrSignatureInvalid      = errors.New("signature verification failed")
    ErrUnsupportedKeyType    = errors.New("unsupported key type for normalization")
    ErrProofRecordCidMismatch = errors.New("proof record CID mismatch")
)
```

Wrap with `fmt.Errorf("…: %w", err)` to preserve chains.

## Concurrency

Everything in this pipeline is CPU-bound and cheap. No goroutines needed inside attestation logic. Resolvers (DID doc lookup, AT-URI fetch) are network-bound — keep them behind a `context.Context`-aware interface so callers can cancel.

## See also

- `creating.md` — inline + remote create flow.
- `verifying.md` — verification loop.
- `signatures.md` — ECDSA details across the three curves.
- `../shared/spec.md` — normative spec.
- `../shared/divergence-matrix.md` — cross-language matrix including Go's k256 story.

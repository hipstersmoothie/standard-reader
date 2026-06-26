# Go — creating attestations

No canonical library; the code below shows the end-to-end flow with stdlib + `go-ipld-prime` + `dcrec`. Consider packaging this into your own `attestation` module.

## The content CID helper

This is the single most important primitive — used by both create and verify.

```go
package attestation

import (
    "bytes"
    "crypto/sha256"
    "errors"

    "github.com/ipfs/go-cid"
    "github.com/ipld/go-ipld-prime"
    "github.com/ipld/go-ipld-prime/codec/dagcbor"
    "github.com/ipld/go-ipld-prime/fluent/qp"
    "github.com/ipld/go-ipld-prime/node/basicnode"
    "github.com/multiformats/go-multihash"
)

// ComputeContentCID implements shared/cid-computation.md.
// Returns CIDv1(dag-cbor, SHA-256(DAG-CBOR(merged))).
func ComputeContentCID(record, metadata map[string]any, repository string) (cid.Cid, error) {
    if record == nil {
        return cid.Undef, errors.New("record must be a JSON object")
    }
    if metadata == nil {
        return cid.Undef, errors.New("metadata must be a JSON object")
    }

    // Step 2: strip signatures from record
    strippedRecord := copyMapExcept(record, "signatures")

    // Step 3: prepare $sig metadata
    strippedMeta := copyMapExcept(metadata, "cid", "signature")
    strippedMeta["repository"] = repository

    // Step 4: merge
    merged := copyMap(strippedRecord)
    merged["$sig"] = strippedMeta

    // Step 5: DAG-CBOR encode
    node, err := toIPLDNode(merged)
    if err != nil {
        return cid.Undef, err
    }
    var buf bytes.Buffer
    if err := dagcbor.Encode(node, &buf); err != nil {
        return cid.Undef, err
    }

    // Step 6: SHA-256
    h := sha256.Sum256(buf.Bytes())

    // Step 7: CIDv1
    mh, err := multihash.Encode(h[:], multihash.SHA2_256)
    if err != nil {
        return cid.Undef, err
    }
    return cid.NewCidV1(cid.DagCBOR, mh), nil
}

func copyMap(m map[string]any) map[string]any {
    out := make(map[string]any, len(m))
    for k, v := range m {
        out[k] = v
    }
    return out
}

func copyMapExcept(m map[string]any, excluded ...string) map[string]any {
    out := make(map[string]any, len(m))
    skip := make(map[string]struct{}, len(excluded))
    for _, k := range excluded {
        skip[k] = struct{}{}
    }
    for k, v := range m {
        if _, ok := skip[k]; ok {
            continue
        }
        out[k] = v
    }
    return out
}

// toIPLDNode converts a map[string]any (recursively) into ipld.Node.
// Supports: map, []any, string, bool, int64, float64, nil.
// Add CID support via a typed wrapper if you need $link round-tripping.
func toIPLDNode(v any) (ipld.Node, error) {
    switch x := v.(type) {
    case nil:
        return ipld.Null, nil
    case bool:
        return basicnode.NewBool(x), nil
    case string:
        return basicnode.NewString(x), nil
    case int:
        return basicnode.NewInt(int64(x)), nil
    case int64:
        return basicnode.NewInt(x), nil
    case float64:
        return basicnode.NewFloat(x), nil
    case []byte:
        return basicnode.NewBytes(x), nil
    case map[string]any:
        return qp.BuildMap(basicnode.Prototype.Any, int64(len(x)), func(ma ipld.MapAssembler) {
            for k, kv := range x {
                qp.MapEntry(ma, k, ipldVal(kv))
            }
        })
    case []any:
        return qp.BuildList(basicnode.Prototype.Any, int64(len(x)), func(la ipld.ListAssembler) {
            for _, lv := range x {
                qp.ListEntry(la, ipldVal(lv))
            }
        })
    default:
        return nil, errors.New("unsupported IPLD type")
    }
}

// ipldVal is a qp.Assemble helper that calls toIPLDNode internally.
func ipldVal(v any) qp.Assemble {
    return func(na ipld.NodeAssembler) {
        node, err := toIPLDNode(v)
        if err != nil {
            panic(err) // qp panics are caught by qp.BuildMap/BuildList
        }
        na.AssignNode(node)
    }
}
```

Tedious, but straightforward. You only write this once.

## Inline attestation — create

```go
package attestation

import (
    "crypto/ecdsa"
    "crypto/elliptic"
    "crypto/rand"
    "crypto/sha256"
    "encoding/base64"
    "errors"
    "math/big"
)

type Curve int

const (
    CurveP256 Curve = iota
    CurveK256
)

// CreateInlineAttestation signs `record` with `privateKey`, appending the
// attestation to record["signatures"]. Returns a new record (caller may treat
// the input as immutable).
func CreateInlineAttestation(
    record map[string]any,
    metadata map[string]any,
    repository string,
    privateKey *ecdsa.PrivateKey, // P-256; use K256Private for secp256k1
) (map[string]any, error) {
    cidObj, err := ComputeContentCID(record, metadata, repository)
    if err != nil {
        return nil, err
    }
    cidBytes := cidObj.Bytes() // 36 bytes

    digest := sha256.Sum256(cidBytes)

    r, s, err := ecdsa.Sign(rand.Reader, privateKey, digest[:])
    if err != nil {
        return nil, err
    }

    // Low-S normalize
    curveN := privateKey.Curve.Params().N
    halfN := new(big.Int).Rsh(curveN, 1)
    if s.Cmp(halfN) == 1 {
        s = new(big.Int).Sub(curveN, s)
    }

    byteLen := (curveN.BitLen() + 7) / 8 // 32 for P-256, 48 for P-384
    rs := p1363Encode(r, s, byteLen)

    attestation := copyMap(metadata)
    attestation["cid"] = cidObj.String()
    attestation["signature"] = map[string]any{"$bytes": base64.StdEncoding.EncodeToString(rs)}
    delete(attestation, "repository") // paranoid — must not appear in final output

    out := copyMap(record)
    existing, _ := out["signatures"].([]any)
    out["signatures"] = append(existing, attestation)
    return out, nil
}

func p1363Encode(r, s *big.Int, byteLen int) []byte {
    out := make([]byte, byteLen*2)
    rb := r.Bytes()
    sb := s.Bytes()
    copy(out[byteLen-len(rb):byteLen], rb)
    copy(out[byteLen*2-len(sb):], sb)
    return out
}
```

### Inline with K-256 (dcrec)

The stdlib path uses `crypto/ecdsa.PrivateKey`. For K-256 you take a different path:

```go
import (
    k256 "github.com/decred/dcrd/dcrec/secp256k1/v4"
    k256ecdsa "github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
)

func CreateInlineAttestationK256(
    record map[string]any,
    metadata map[string]any,
    repository string,
    privateKey *k256.PrivateKey,
) (map[string]any, error) {
    cidObj, err := ComputeContentCID(record, metadata, repository)
    if err != nil {
        return nil, err
    }
    digest := sha256.Sum256(cidObj.Bytes())

    // dcrd's ecdsa.Sign returns low-S by default.
    sig := k256ecdsa.Sign(privateKey, digest[:])
    r := sig.R()
    s := sig.S()

    rs := make([]byte, 64)
    rBytes := r.Bytes()
    sBytes := s.Bytes()
    copy(rs[32-len(rBytes):32], rBytes)
    copy(rs[64-len(sBytes):], sBytes)

    attestation := copyMap(metadata)
    attestation["cid"] = cidObj.String()
    attestation["signature"] = map[string]any{"$bytes": base64.StdEncoding.EncodeToString(rs)}
    delete(attestation, "repository")

    out := copyMap(record)
    existing, _ := out["signatures"].([]any)
    out["signatures"] = append(existing, attestation)
    return out, nil
}
```

Consider wrapping both behind a single `Signer` interface so callers don't care about the key type at the use site.

## Remote attestation — create

```go
// CreateRemoteAttestation builds the proof record and attested record.
// Caller publishes both via com.atproto.repo.putRecord.
func CreateRemoteAttestation(
    record map[string]any,
    metadata map[string]any,
    subjectRepository string,
    attestorRepository string,
) (attestedRecord map[string]any, proofRecord map[string]any, proofUri string, err error) {
    metaType, ok := metadata["$type"].(string)
    if !ok {
        return nil, nil, "", errors.New("metadata missing $type")
    }

    contentCid, err := ComputeContentCID(record, metadata, subjectRepository)
    if err != nil {
        return nil, nil, "", err
    }

    // Proof record = metadata + {cid: contentCid}
    proofRecord = copyMap(metadata)
    proofRecord["cid"] = contentCid.String()

    // DAG-CBOR CID of the proof record (no $sig merge)
    proofCid, err := dagCborCIDOf(proofRecord)
    if err != nil {
        return nil, nil, "", err
    }

    rkey := generateTID() // see below
    proofUri = "at://" + attestorRepository + "/" + metaType + "/" + rkey

    strongRef := map[string]any{
        "$type": "com.atproto.repo.strongRef",
        "uri":   proofUri,
        "cid":   proofCid.String(),
    }

    attestedRecord = copyMap(record)
    existing, _ := attestedRecord["signatures"].([]any)
    attestedRecord["signatures"] = append(existing, strongRef)

    return attestedRecord, proofRecord, proofUri, nil
}

func dagCborCIDOf(obj map[string]any) (cid.Cid, error) {
    node, err := toIPLDNode(obj)
    if err != nil {
        return cid.Undef, err
    }
    var buf bytes.Buffer
    if err := dagcbor.Encode(node, &buf); err != nil {
        return cid.Undef, err
    }
    h := sha256.Sum256(buf.Bytes())
    mh, err := multihash.Encode(h[:], multihash.SHA2_256)
    if err != nil {
        return cid.Undef, err
    }
    return cid.NewCidV1(cid.DagCBOR, mh), nil
}
```

### TID generation

If you can pull `github.com/bluesky-social/indigo/atproto/syntax`, use `syntax.NewTID()`. Otherwise, minimal hand-roll:

```go
import (
    "fmt"
    "math/rand"
    "sync"
    "time"
)

var (
    tidAlphabet = "234567abcdefghijklmnopqrstuvwxyz"
    tidMu       sync.Mutex
    lastTidNs   int64
)

func generateTID() string {
    tidMu.Lock()
    defer tidMu.Unlock()

    now := time.Now().UnixMicro()
    if now <= lastTidNs {
        now = lastTidNs + 1
    }
    lastTidNs = now

    clock := rand.Int63n(1024)
    combined := (now << 10) | clock

    out := make([]byte, 13)
    for i := 12; i >= 0; i-- {
        out[i] = tidAlphabet[combined&31]
        combined >>= 5
    }
    return string(out)
}
```

(Production: use indigo. The above is for illustrative purposes.)

### Publish sequence

```go
attestedRecord, proofRecord, proofUri, err := CreateRemoteAttestation(
    record, metadata, "did:plc:subject", "did:plc:attestor",
)
// Split proofUri → collection, rkey
parts := strings.Split(proofUri, "/")
collection := parts[3]
rkey := parts[4]

// 1. Publish proof record first.
if err := pds.PutRecord(ctx, "did:plc:attestor", collection, rkey, proofRecord); err != nil {
    return err
}
// 2. Then publish attested record.
if err := pds.PutRecord(ctx, "did:plc:subject", subjectCollection, subjectRkey, attestedRecord); err != nil {
    return err
}
```

## Append flows

Append = validate someone else's attestation, then tack it onto your record.

### Append inline

```go
type KeyResolver interface {
    ResolveKey(ctx context.Context, keyRef string) (curve Curve, publicKey any, err error)
}

func AppendInlineAttestation(
    ctx context.Context,
    record map[string]any,
    attestation map[string]any,
    repository string,
    resolver KeyResolver,
) (map[string]any, error) {
    claimedCid, _ := attestation["cid"].(string)
    if claimedCid == "" {
        return nil, errors.New("attestation missing cid")
    }

    meta := copyMapExcept(attestation, "cid", "signature")
    computedCid, err := ComputeContentCID(record, meta, repository)
    if err != nil {
        return nil, err
    }
    if computedCid.String() != claimedCid {
        return nil, fmt.Errorf("content CID mismatch: claimed=%s computed=%s", claimedCid, computedCid)
    }

    keyRef, _ := attestation["key"].(string)
    if keyRef == "" {
        return nil, errors.New("attestation missing key")
    }
    curve, pub, err := resolver.ResolveKey(ctx, keyRef)
    if err != nil {
        return nil, err
    }

    sigWrap, _ := attestation["signature"].(map[string]any)
    sigB64, _ := sigWrap["$bytes"].(string)
    sigBytes, err := base64.StdEncoding.DecodeString(sigB64)
    if err != nil {
        return nil, fmt.Errorf("decoding signature: %w", err)
    }

    if !VerifySignature(curve, pub, computedCid.Bytes(), sigBytes) {
        return nil, errors.New("signature verification failed")
    }

    out := copyMap(record)
    existing, _ := out["signatures"].([]any)
    out["signatures"] = append(existing, attestation)
    return out, nil
}
```

(`VerifySignature` lives in `signatures.md`.)

### Append remote

```go
func AppendRemoteAttestation(
    record map[string]any,
    proofMetadata map[string]any,
    repository string,
    attestationUri string,
) (map[string]any, error) {
    claimedCid, _ := proofMetadata["cid"].(string)
    if claimedCid == "" {
        return nil, errors.New("proofMetadata missing cid")
    }

    // Content CID is computed over proofMetadata with `cid` stripped.
    stripped := copyMapExcept(proofMetadata, "cid")
    computed, err := ComputeContentCID(record, stripped, repository)
    if err != nil {
        return nil, err
    }
    if computed.String() != claimedCid {
        return nil, fmt.Errorf("content CID mismatch")
    }

    // Proof record CID is the DAG-CBOR CID of proofMetadata *with* `cid`.
    proofCid, err := dagCborCIDOf(proofMetadata)
    if err != nil {
        return nil, err
    }

    strongRef := map[string]any{
        "$type": "com.atproto.repo.strongRef",
        "uri":   attestationUri,
        "cid":   proofCid.String(),
    }

    out := copyMap(record)
    existing, _ := out["signatures"].([]any)
    out["signatures"] = append(existing, strongRef)
    return out, nil
}
```

## Common mistakes

- **Using `ecdsa.SignASN1`.** Returns DER — you'd have to unpack it. Use `ecdsa.Sign` instead.
- **Forgetting low-S normalization.** Go stdlib `ecdsa.Sign` does NOT low-S normalize. Do it yourself (P-256/P-384) or use dcrec (K-256 only) which does.
- **Signing the digest instead of the CID bytes.** The message passed to the ECDSA primitive is the 32-byte SHA-256 of `cid.Bytes()`, which internally is equivalent to "sign the 36-byte CID bytes". Don't pass `cid.String()` bytes — that's the base32 string, completely different.
- **Letting fxamacker/cbor emit non-canonical CBOR.** Use `cbor.CoreDetEncOptions()` at minimum; prefer go-ipld-prime for strict DAG-CBOR.
- **Mutating the input map in place.** Callers often reuse maps. Copy first.
- **Forgetting to delete `repository` from the final attestation.** It's only an input to CID computation — must not appear in the output. Our helpers `delete(attestation, "repository")` defensively; make sure your path does too.
- **Publishing attested before proof record.** Dangling strongRef on failure.

## See also

- `verifying.md` — inverse flow.
- `signatures.md` — all three curves in detail.
- `../shared/inline-attestation.md`, `../shared/remote-attestation.md` — spec.
- `../rust/creating.md`, `../typescript/creating.md` — peer flows.

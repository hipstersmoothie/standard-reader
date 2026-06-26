# Go — verifying attestations

One function walks `record["signatures"]` and rejects on the first failure. Dispatch on `$type == com.atproto.repo.strongRef`.

## The verifier

```go
package attestation

import (
    "context"
    "encoding/base64"
    "errors"
    "fmt"
)

const strongRefNSID = "com.atproto.repo.strongRef"

type RecordResolver interface {
    ResolveRecord(ctx context.Context, atUri string) (map[string]any, error)
}

type VerifyOptions struct {
    StrictLowS      bool // default false; matches reference Rust semantics
    VerifyProofCid  bool // default true; stricter than reference Rust
}

func VerifyRecord(
    ctx context.Context,
    record map[string]any,
    repository string,
    keyResolver KeyResolver,
    recordResolver RecordResolver,
    opts VerifyOptions,
) error {
    sigs, _ := record["signatures"].([]any)
    if len(sigs) == 0 {
        return nil // no signatures to verify
    }

    for i, sigAny := range sigs {
        entry, ok := sigAny.(map[string]any)
        if !ok {
            return fmt.Errorf("signatures[%d] must be an object", i)
        }
        t, _ := entry["$type"].(string)
        if t == "" {
            return fmt.Errorf("signatures[%d] missing $type", i)
        }

        if t == strongRefNSID {
            if err := verifyRemote(ctx, entry, record, repository, recordResolver, opts); err != nil {
                return fmt.Errorf("signatures[%d]: %w", i, err)
            }
        } else {
            if err := verifyInline(ctx, entry, record, repository, keyResolver, opts); err != nil {
                return fmt.Errorf("signatures[%d]: %w", i, err)
            }
        }
    }
    return nil
}
```

### Inline verify

```go
func verifyInline(
    ctx context.Context,
    entry map[string]any,
    record map[string]any,
    repository string,
    resolver KeyResolver,
    opts VerifyOptions,
) error {
    claimedCid, _ := entry["cid"].(string)
    if claimedCid == "" {
        return errors.New("missing cid")
    }

    // Strip cid + signature to rebuild metadata
    meta := copyMapExcept(entry, "cid", "signature")

    computed, err := ComputeContentCID(record, meta, repository)
    if err != nil {
        return err
    }
    if computed.String() != claimedCid {
        return fmt.Errorf("CID mismatch (claimed=%s computed=%s)", claimedCid, computed)
    }

    sigWrap, _ := entry["signature"].(map[string]any)
    sigB64, _ := sigWrap["$bytes"].(string)
    if sigB64 == "" {
        return errors.New("signature.$bytes missing")
    }
    sigBytes, err := base64.StdEncoding.DecodeString(sigB64)
    if err != nil {
        return fmt.Errorf("decoding signature: %w", err)
    }

    keyRef, _ := entry["key"].(string)
    if keyRef == "" {
        return errors.New("missing key")
    }
    curve, pub, err := resolver.ResolveKey(ctx, keyRef)
    if err != nil {
        return fmt.Errorf("resolving key: %w", err)
    }

    if opts.StrictLowS {
        if !isLowS(curve, sigBytes) {
            return errors.New("signature not in low-S form")
        }
    }

    if !VerifySignature(curve, pub, computed.Bytes(), sigBytes) {
        return errors.New("signature verification failed")
    }
    return nil
}
```

### Remote verify

```go
func verifyRemote(
    ctx context.Context,
    entry map[string]any,
    record map[string]any,
    repository string,
    resolver RecordResolver,
    opts VerifyOptions,
) error {
    uri, _ := entry["uri"].(string)
    if uri == "" {
        return errors.New("strongRef missing uri")
    }

    proof, err := resolver.ResolveRecord(ctx, uri)
    if err != nil {
        return fmt.Errorf("resolving proof record %s: %w", uri, err)
    }

    // Optional: verify proof record's DAG-CBOR CID matches strongRef.cid
    if opts.VerifyProofCid {
        proofCid, err := dagCborCIDOf(proof)
        if err != nil {
            return fmt.Errorf("hashing proof record: %w", err)
        }
        strongRefCid, _ := entry["cid"].(string)
        if proofCid.String() != strongRefCid {
            return fmt.Errorf("proof record CID mismatch (strongRef=%s fetched=%s)", strongRefCid, proofCid)
        }
    }

    claimedContentCid, _ := proof["cid"].(string)
    if claimedContentCid == "" {
        return errors.New("proof record missing cid")
    }

    // Content CID is over proof record with its `cid` field stripped.
    metaForCid := copyMapExcept(proof, "cid")
    computed, err := ComputeContentCID(record, metaForCid, repository)
    if err != nil {
        return err
    }
    if computed.String() != claimedContentCid {
        return fmt.Errorf("content CID mismatch (claimed=%s computed=%s)", claimedContentCid, computed)
    }
    return nil
}
```

## `KeyResolver` implementations

### Plain `did:key:` parser

```go
import (
    "fmt"
    "strings"

    "github.com/multiformats/go-multibase"
    "github.com/multiformats/go-varint"
)

type LocalKeyResolver struct{}

func (LocalKeyResolver) ResolveKey(_ context.Context, keyRef string) (Curve, any, error) {
    if !strings.HasPrefix(keyRef, "did:key:") {
        return 0, nil, fmt.Errorf("not a did:key: %s", keyRef)
    }
    _, decoded, err := multibase.Decode(strings.TrimPrefix(keyRef, "did:key:"))
    if err != nil {
        return 0, nil, fmt.Errorf("multibase decode: %w", err)
    }

    code, n, err := varint.FromUvarint(decoded)
    if err != nil {
        return 0, nil, fmt.Errorf("varint decode: %w", err)
    }
    keyBytes := decoded[n:]

    switch code {
    case 0x1200:
        // P-256 compressed (33 bytes)
        return CurveP256, parseP256Pub(keyBytes), nil
    case 0xe7:
        // K-256 compressed (33 bytes)
        return CurveK256, parseK256Pub(keyBytes), nil
    default:
        return 0, nil, fmt.Errorf("unsupported key codec 0x%x", code)
    }
}

func parseP256Pub(compressed []byte) *ecdsa.PublicKey {
    curve := elliptic.P256()
    // Go 1.22+ has elliptic.UnmarshalCompressed (deprecated in favor of ecdh).
    x, y := elliptic.UnmarshalCompressed(curve, compressed)
    return &ecdsa.PublicKey{Curve: curve, X: x, Y: y}
}

func parseK256Pub(compressed []byte) *k256.PublicKey {
    pk, _ := k256.ParsePubKey(compressed)
    return pk
}
```

### DID document lookup

```go
type DidDocResolver struct {
    // httpClient, cache, and a DID-doc fetcher belong here.
}

func (r *DidDocResolver) ResolveKey(ctx context.Context, keyRef string) (Curve, any, error) {
    if !strings.Contains(keyRef, "#") {
        return LocalKeyResolver{}.ResolveKey(ctx, keyRef)
    }
    // Split did, fetch DID doc, find verificationMethod by fragment, extract publicKeyMultibase.
    // Hand off to LocalKeyResolver with "did:key:<multibase>".
    // Full DID resolution → see atproto-identity-resolution skill.
    return 0, nil, errors.New("TODO: DID doc resolver not implemented")
}
```

## `RecordResolver` implementation

```go
type XrpcRecordResolver struct {
    // HTTPClient, DID → PDS lookup, etc.
}

func (r *XrpcRecordResolver) ResolveRecord(ctx context.Context, atUri string) (map[string]any, error) {
    m := regexp.MustCompile(`^at://([^/]+)/([^/]+)/(.+)$`).FindStringSubmatch(atUri)
    if m == nil {
        return nil, fmt.Errorf("invalid AT-URI: %s", atUri)
    }
    did, collection, rkey := m[1], m[2], m[3]

    pds, err := r.pdsForDid(ctx, did)
    if err != nil {
        return nil, err
    }

    u := fmt.Sprintf("%s/xrpc/com.atproto.repo.getRecord?repo=%s&collection=%s&rkey=%s",
        pds, url.QueryEscape(did), url.QueryEscape(collection), url.QueryEscape(rkey))

    req, _ := http.NewRequestWithContext(ctx, http.MethodGet, u, nil)
    resp, err := http.DefaultClient.Do(req)
    if err != nil {
        return nil, err
    }
    defer resp.Body.Close()
    if resp.StatusCode != 200 {
        return nil, fmt.Errorf("getRecord %s: status %d", atUri, resp.StatusCode)
    }

    var body struct {
        Value map[string]any `json:"value"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
        return nil, err
    }
    return body.Value, nil
}
```

## Strict vs permissive

- `StrictLowS`: reject high-S inline signatures. Default off.
- `VerifyProofCid`: fetch the proof record, compute its DAG-CBOR CID, compare to strongRef's `cid`. Default on. The Rust reference crate skips this, but it's a cheap integrity check that closes the "resolver lies about what's at the URI" hole.

## Helper: `isLowS`

```go
import (
    "crypto/elliptic"
    "math/big"

    k256 "github.com/decred/dcrd/dcrec/secp256k1/v4"
)

func isLowS(curve Curve, rs []byte) bool {
    if len(rs) != 64 {
        return false // length mismatch = malformed, not "normalized"
    }
    s := new(big.Int).SetBytes(rs[32:64])

    var order *big.Int
    switch curve {
    case CurveP256:
        order = elliptic.P256().Params().N
    case CurveK256:
        order = k256.S256().N
    default:
        return false
    }
    halfOrder := new(big.Int).Rsh(order, 1)
    return s.Cmp(halfOrder) <= 0
}
```

## Partial verification

No per-entry API; filter `signatures` and call `VerifyRecord`:

```go
filtered := make([]any, 0)
for _, s := range record["signatures"].([]any) {
    m := s.(map[string]any)
    if m["key"] == targetKey {
        filtered = append(filtered, s)
    }
}
subset := copyMap(record)
subset["signatures"] = filtered
err := VerifyRecord(ctx, subset, repository, keyResolver, recordResolver, opts)
```

## Common mistakes

- **Passing the wrong `repository`.** Kills every inline signature (as designed). Always use the DID you fetched the record from.
- **Forgetting to handle nil `signatures`.** A record without any attestations should verify trivially. Check `len(sigs) == 0` up front.
- **Treating resolver errors as bugs.** Proof records can be deleted. Surface them as "attestation no longer provable" to callers.
- **Using `json.Marshal` anywhere in CID computation.** The pipeline is JSON-object-in, DAG-CBOR-bytes-out. No intermediate JSON strings.
- **Not using DAG-CBOR.** Plain `fxamacker/cbor` without `CoreDetEncOptions` produces non-canonical output. CIDs won't match.
- **Running `VerifyRecord` concurrently on the same `record`.** `copyMap` et al. give you a snapshot for CID computation, but if your caller mutates `record` between calls, you get races. Defensive copy at the boundary.

## See also

- `creating.md` — the inverse flow.
- `signatures.md` — verification primitives per curve.
- `../shared/inline-attestation.md` §Verify, `../shared/remote-attestation.md` §Verify.
- `../rust/verifying.md`, `../typescript/verifying.md` — peers.

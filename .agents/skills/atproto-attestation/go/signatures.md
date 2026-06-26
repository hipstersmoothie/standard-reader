# Go — ECDSA signing & normalization

Go splits into two ecosystems: stdlib `crypto/ecdsa` (P-256, P-384) and `decred/dcrec` (K-256). Same spec rules apply — output must be 64-byte IEEE P1363 `r‖s`, low-S normalized (for P-256 and K-256).

## Unified `Signer` / `VerifySignature`

Below is a small wrapper that hides the P-256-vs-K-256 split. Everywhere else in the skill I use `VerifySignature(curve, pub, msg, sig)` — here's its implementation:

```go
package attestation

import (
    "crypto/ecdsa"
    "crypto/elliptic"
    "crypto/sha256"
    "math/big"

    k256 "github.com/decred/dcrd/dcrec/secp256k1/v4"
    k256ecdsa "github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
)

type Curve int

const (
    CurveP256 Curve = iota
    CurveK256
)

// VerifySignature verifies a 64-byte r‖s signature over msg (which is hashed with SHA-256 internally).
func VerifySignature(curve Curve, publicKey any, msg, sig []byte) bool {
    if len(sig) != 64 {
        return false
    }
    digest := sha256.Sum256(msg)

    r := new(big.Int).SetBytes(sig[:32])
    s := new(big.Int).SetBytes(sig[32:])

    switch curve {
    case CurveP256:
        pub, ok := publicKey.(*ecdsa.PublicKey)
        if !ok || pub.Curve != elliptic.P256() {
            return false
        }
        return ecdsa.Verify(pub, digest[:], r, s)
    case CurveK256:
        pub, ok := publicKey.(*k256.PublicKey)
        if !ok {
            return false
        }
        // Construct dcrd signature type from r, s. Simpler: parse compact bytes.
        return k256ecdsa.NewSignature(
            &k256.ModNScalar{},
            &k256.ModNScalar{},
        ).Verify(digest[:], pub) // stub — see note below
    default:
        return false
    }
}
```

### The dcrec Verify pain point

`k256ecdsa.Signature` doesn't expose a public constructor from `(r, s *big.Int)` in v4. Practical options:

1. **Parse compact (recommended):** encode `r‖s` into a 64-byte buffer, then round-trip through a custom `Parse` helper, or use an internal API. Pragmatic variant:

```go
sig := make([]byte, 64)
rBytes := r.Bytes()
sBytes := s.Bytes()
copy(sig[32-len(rBytes):32], rBytes)
copy(sig[64-len(sBytes):], sBytes)

// k256 doesn't have ParseCompactSignature, but we can build Signature via scalar types:
var rScalar, sScalar k256.ModNScalar
rScalar.SetByteSlice(sig[:32])
sScalar.SetByteSlice(sig[32:])
ks := k256ecdsa.NewSignature(&rScalar, &sScalar)
ok := ks.Verify(digest[:], pub)
```

2. **Use DER parsing:** `k256ecdsa.ParseSignature(derBytes)` — only if you have DER. Convert P1363 → DER first, annoying.

3. **Use `btcec/v2`:** similar API, same scalar dance.

The cleanest Go-world path is to define your own `type Signature struct { R, S *big.Int }` internally and only cross the dcrec boundary at the verify call.

## Signing

### P-256 / P-384 (stdlib)

```go
import (
    "crypto/ecdsa"
    "crypto/rand"
    "crypto/sha256"
    "math/big"
)

func SignP256(priv *ecdsa.PrivateKey, cidBytes []byte) ([]byte, error) {
    digest := sha256.Sum256(cidBytes)
    r, s, err := ecdsa.Sign(rand.Reader, priv, digest[:])
    if err != nil {
        return nil, err
    }

    // Low-S normalize
    n := priv.Curve.Params().N
    halfN := new(big.Int).Rsh(n, 1)
    if s.Cmp(halfN) == 1 {
        s = new(big.Int).Sub(n, s)
    }

    byteLen := (n.BitLen() + 7) / 8 // 32 for P-256, 48 for P-384
    return p1363Encode(r, s, byteLen), nil
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

### K-256 (dcrec)

```go
import (
    k256 "github.com/decred/dcrd/dcrec/secp256k1/v4"
    k256ecdsa "github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa"
)

func SignK256(priv *k256.PrivateKey, cidBytes []byte) []byte {
    digest := sha256.Sum256(cidBytes)
    sig := k256ecdsa.Sign(priv, digest[:])
    r := sig.R()
    s := sig.S()

    // dcrec's Sign already low-S normalizes. Extra safety:
    n := k256.S256().N
    halfN := new(big.Int).Rsh(n, 1)
    if s.Cmp(halfN) == 1 {
        s = new(big.Int).Sub(n, s)
    }

    out := make([]byte, 64)
    rb := r.Bytes()
    sb := s.Bytes()
    copy(out[32-len(rb):32], rb)
    copy(out[64-len(sb):], sb)
    return out
}
```

### P-384 caveat

The code above works for P-384 (`elliptic.P384()`). But **interop is broken**:

- Go produces a 96-byte P1363 signature. ✅ spec-conformant.
- The Rust reference crate's `normalize_signature` returns `UnsupportedKeyType` for P-384. ❌
- So a Go-produced P-384 signature won't round-trip through the Rust verify → re-sign path.

Use P-256 or K-256 until the reference crate adds P-384 normalization. See `../shared/signature-normalization.md` for the full picture.

## Verification with `isLowS` pre-check

```go
func VerifyStrict(curve Curve, pub any, msg, sig []byte) bool {
    if !isLowS(curve, sig) {
        return false
    }
    return VerifySignature(curve, pub, msg, sig)
}
```

`isLowS` is defined in `verifying.md`. Use `VerifyStrict` if your policy rejects high-S.

## DER ↔ P1363

If you receive a DER signature from another Go program or from Java/OpenSSL:

```go
import "encoding/asn1"

type ecdsaSigDER struct {
    R, S *big.Int
}

func derToP1363(der []byte, byteLen int) ([]byte, error) {
    var sig ecdsaSigDER
    if _, err := asn1.Unmarshal(der, &sig); err != nil {
        return nil, err
    }
    return p1363Encode(sig.R, sig.S, byteLen), nil
}

func p1363ToDER(rs []byte, byteLen int) ([]byte, error) {
    r := new(big.Int).SetBytes(rs[:byteLen])
    s := new(big.Int).SetBytes(rs[byteLen:])
    return asn1.Marshal(ecdsaSigDER{R: r, S: s})
}
```

## Deterministic signing (for test vectors)

Go's `ecdsa.Sign` uses `rand.Reader` — **non-deterministic**. For reproducible signatures:

```go
import "github.com/google/certificate-transparency-go/tls" // or similar RFC 6979 impl
// ... or roll your own using github.com/cloudflare/circl
```

This is one of the annoying gaps in Go stdlib. Alternatives:

- Use `github.com/decred/dcrd/dcrec/secp256k1/v4/ecdsa` — always RFC 6979 deterministic (for K-256 only).
- Use `github.com/cloudflare/circl/sign/ecdsa` — P-256/P-384 with optional deterministic mode.
- Implement RFC 6979 yourself — ~100 LOC.

For interop test vectors against the Rust reference crate (which uses RustCrypto `k256`/`p256`, both RFC 6979), you must use a deterministic signer on the Go side.

## `did:key:` encoding

```go
import (
    "github.com/multiformats/go-multibase"
    "github.com/multiformats/go-varint"
)

func FormatDidKey(curve Curve, compressedPub []byte) (string, error) {
    var codec uint64
    switch curve {
    case CurveP256:
        codec = 0x1200
    case CurveK256:
        codec = 0xe7
    default:
        return "", errors.New("unsupported curve")
    }
    prefix := varint.ToUvarint(codec)
    encoded := append(prefix, compressedPub...)
    return multibase.Encode(multibase.Base58BTC, encoded)
}
```

For P-256 compressed: `elliptic.MarshalCompressed(elliptic.P256(), priv.X, priv.Y)` returns the 33-byte form.
For K-256: `priv.PubKey().SerializeCompressed()`.

## Cross-implementation round-trip

Produce with the Rust CLI, verify in Go:

```bash
echo '{"$type":"test","x":1}' | \
  cargo run -p atproto-attestation --features clap,tokio --bin atproto-attestation-sign -- \
    inline - did:plc:test did:key:zQ3sh... \
    '{"$type":"com.example.sig","key":"did:key:zQ3sh..."}' \
  > signed.json
```

In Go:

```go
f, _ := os.ReadFile("signed.json")
var record map[string]any
json.Unmarshal(f, &record)

err := VerifyRecord(ctx, record, "did:plc:test", LocalKeyResolver{}, NullResolver{}, VerifyOptions{})
// nil = verified
```

## Common mistakes

- **Using `ecdsa.SignASN1`.** Returns DER. Always use `ecdsa.Sign`.
- **Skipping low-S normalization.** Go stdlib doesn't low-S for you. P-256 sigs are high-S ~50% of the time.
- **Using `rand.Reader` and expecting test vectors to reproduce.** Go ECDSA is non-deterministic unless you override the nonce source.
- **Comparing signatures by byte equality without low-S.** Two valid signatures of the same message can differ. Normalize before comparing (or don't compare).
- **Trusting `elliptic.UnmarshalCompressed` in Go 1.21+.** It's deprecated in favor of the `crypto/ecdh` package, but still present. If removed in a future release, switch to dedicated SEC1 decoding.
- **Mixing `btcec` and `dcrec` types.** Their `PublicKey` types aren't interchangeable even though both wrap secp256k1. Pick one and stick to it in a given module.
- **Assuming P-384 round-trips.** It doesn't — see above.

## See also

- `creating.md`, `verifying.md` — callers.
- `../shared/signature-normalization.md` — curve orders, cross-language coverage.
- `../rust/signatures.md`, `../typescript/signatures.md` — peers.
- `github.com/bluesky-social/indigo/atproto/crypto` — reference Go implementation of atproto-style signing.

# ECDSA signature normalization (low-S)

ECDSA signatures are malleable by default: for any valid signature `(r, s)`, the value `(r, n − s)` is also a valid signature for the same message and key (where `n` is the curve order). This creates two distinct byte strings that verify against the same content, which is a problem when the signature bytes are themselves content-addressed or used as an identifier.

The badge.blue spec requires signatures to be in **low-S form** — the canonical form where `s ≤ n/2`. This file documents what that means and how to implement it per curve.

## The rule

After signing, check whether `s > n/2`:

- If yes: replace with `(r, n − s)`.
- If no: leave unchanged.

Both `(r, s)` and `(r, n − s)` verify correctly; picking the low-S representative gives every message exactly one valid signature per key.

## Curve orders

| Curve  | Order `n` (hex, high bits)                                        | `n/2` (for comparison)                                         |
| ------ | ----------------------------------------------------------------- | -------------------------------------------------------------- |
| P-256  | `ffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551` | `7fffffff80000000 7fffffffffffffff de73fd56d38bcf4279dce5617e3192a8` |
| K-256  | `fffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141` | `7fffffffffffffff ffffffffffffffff 5d576e7357a4501ddfe92f46681b20a0` |
| P-384  | `ffffffffffffffffffffffffffffffffffffffffffffffffc7634d81f4372ddf 581a0db248b0a77aecec196accc52973` | (384-bit, see RFC 5639 or similar)    |

Implementations don't hand-compute this — they use a crypto library that provides a `normalize_s` primitive. The reference Rust crate uses `k256::ecdsa::Signature::normalize_s()` and `p256::ecdsa::Signature::normalize_s()`.

## Curve coverage in the reference crate

| Curve | Signing (via `atproto-identity::sign`) | Verification (via `atproto-identity::validate`) | Normalization (`normalize_signature`) |
| ----- | -------------------------------------- | ----------------------------------------------- | ------------------------------------- |
| P-256 | ✅                                      | ✅                                               | ✅                                     |
| K-256 | ✅                                      | ✅                                               | ✅                                     |
| P-384 | ✅                                      | ✅                                               | ❌ — `UnsupportedKeyType` error         |

This is a real gap. The reference crate's `normalize_signature` function explicitly returns `AttestationError::UnsupportedKeyType` for anything other than P-256 / K-256 variants. `create_inline_attestation` and `create_signature` both call `normalize_signature` unconditionally, so a P-384 key will fail signing at the normalization step even though raw signing would succeed.

**Implication**: interop across implementations should stick to P-256 or K-256 until P-384 normalization is implemented everywhere. If you need P-384, plan to contribute the normalization code to the reference crate and keep your own implementation consistent until then.

See `divergence-matrix.md` §curve-support for a per-language summary.

## Signature wire format

After normalization, the signature is emitted as **64 bytes**: `r ‖ s`, each zero-padded to 32 bytes big-endian (for P-256 and K-256). **Not** DER-encoded.

| Format | Bytes | Used by |
| ------ | ----- | ------- |
| DER (ASN.1) | 70–72 variable | OpenSSL, Go's `ecdsa.Sign`, many defaults |
| IEEE P1363 (`r‖s` fixed) | 64 | badge.blue, Web Crypto API, Rust's `k256`/`p256` (`.to_vec()`) |

If your language's crypto library returns DER, you must convert to P1363 before normalization and base64 encoding. See per-language signatures guides.

For P-384 the P1363 form is 96 bytes (48 + 48), but see above re: normalization coverage.

## Detecting high-S signatures

During verification, the spec does not mandate that implementations reject high-S signatures — only that created signatures be low-S. In practice:

- The reference Rust crate's `validate()` (from `atproto-identity`) is permissive: it accepts both low-S and high-S signatures.
- Strict implementations may reject high-S to enforce canonicalization. This is the safer default for new verifiers.

For interop, always *produce* low-S. For safety, always *accept* both on verify unless your threat model says otherwise.

## Common mistakes

- **Skipping normalization.** Some ECDSA libraries produce low-S by default (Web Crypto does; `@noble/curves` has an option); others don't (OpenSSL, older Node). If you don't know, normalize explicitly. The cost is one comparison and one subtraction.
- **DER vs P1363 confusion.** Normalizing a DER signature byte-by-byte produces garbage. Convert to P1363 first.
- **Using the wrong curve's `n`.** Copy-pasting P-256's order into a K-256 normalization (or vice versa) produces invalid signatures that happen to look superficially valid. Use library primitives.
- **Re-normalizing an already-low-S signature.** Idempotent — no harm, but don't assume it's a no-op if your library mutates the signature in place.
- **Assuming P-384 works end-to-end with the reference crate.** It doesn't — normalization is not implemented. You'll hit `UnsupportedKeyType` at create time.

## See also

- `spec.md` §8 — curve list and wire-format rule.
- `inline-attestation.md` — where normalized signatures land.
- `divergence-matrix.md` §curve-support and §signature-encoding.
- `../rust/signatures.md`, `../typescript/signatures.md`, `../go/signatures.md` — library-specific ECDSA + normalization.

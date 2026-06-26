# Rust — ECDSA signing & normalization

The crate delegates actual ECDSA to `atproto-identity::key::sign` and `…::validate`, which in turn use `k256` and `p256` (RustCrypto). Normalization is in `atproto-attestation::normalize_signature`. This file covers what each does, in what wire format, and where P-384 breaks.

## The three primitives

| Function                               | Crate                    | Input                                         | Output                                       |
| -------------------------------------- | ------------------------ | --------------------------------------------- | -------------------------------------------- |
| `sign(&KeyData, &[u8]) -> Vec<u8>`     | `atproto_identity::key`  | private key + message bytes                   | 64-byte signature (P-256/K-256), 96-byte (P-384) |
| `validate(&KeyData, &[u8], &[u8])`     | `atproto_identity::key`  | public key + signature bytes + message bytes  | `Ok(())` / `Err(KeyError)`                   |
| `normalize_signature(Vec<u8>, KeyType)`| `atproto_attestation`    | 64-byte raw sig + key type                    | 64-byte low-S sig                            |

In attestation flows the message bytes are always `content_cid.to_bytes()` — the 36-byte binary CID (see `../shared/cid-computation.md`).

## Signing a CID

```rust
use atproto_identity::key::{sign, KeyData};

let private_key: KeyData = /* ... */;
let content_cid_bytes: &[u8] = &content_cid.to_bytes(); // 36 bytes
let raw_sig: Vec<u8> = sign(&private_key, content_cid_bytes)
    .map_err(|e| AttestationError::SignatureCreationFailed { error: e })?;
// raw_sig is 64 bytes for P-256 / K-256 (IEEE P1363 r‖s, NOT DER)
```

`atproto_identity::sign` handles the `KeyType` dispatch internally and returns raw `r‖s` form. You don't need to convert from DER yourself.

## Normalizing to low-S

```rust
use atproto_attestation::normalize_signature;

let normalized = normalize_signature(raw_sig, private_key.key_type())?;
// 64 bytes, low-S form — ready for base64
```

Internally `normalize_signature` (see `src/signature.rs`):

- P-256 path: parse 64 bytes with `p256::ecdsa::Signature::from_slice`, call `.normalize_s()`, re-emit `.to_vec()`.
- K-256 path: same with `k256::ecdsa::Signature::from_slice` / `.normalize_s()` / `.to_vec()`.
- **Anything else**: `AttestationError::UnsupportedKeyType`. In particular, P-384 fails here.

### Why `unwrap_or(parsed)`

Source:

```rust
let parsed = P256Signature::from_slice(&signature)?;
let normalized = parsed.normalize_s().unwrap_or(parsed);
```

`normalize_s()` returns `Option<Signature>` — `None` if already low-S, `Some(new)` if it had to flip. `unwrap_or(parsed)` collapses both cases to "return the low-S form". This is idempotent: normalizing twice is a no-op.

### Length check before normalization

Both `normalize_p256` and `normalize_k256` reject signatures that aren't exactly 64 bytes, returning `SignatureLengthInvalid { expected: 64, actual: … }`. If you see this error and you're sure you passed P-256 or K-256, check whether your signer returned DER (usually 70–72 bytes): convert to P1363 first.

## The P-384 gap

`normalize_signature` for P-384:

```rust
other => Err(AttestationError::UnsupportedKeyType { key_type: (*other).clone() }),
```

Implications:

- `atproto_identity::key::sign` with a P-384 key succeeds and returns 96 bytes.
- `create_inline_attestation` / `create_signature` call `normalize_signature` **unconditionally** — so the flow fails at the normalization step with `UnsupportedKeyType`.
- `validate()` accepts P-384 signatures fine — verification of a P-384 signed record is possible if someone else produced it outside the Rust crate.

Practical effect: **do not use P-384 with this crate for creating attestations.** Stick to P-256 or K-256 for interop. If you need P-384 specifically, implement `normalize_s()` for `p384::ecdsa::Signature` and upstream the patch — the shape would match the other two branches exactly.

See `../shared/signature-normalization.md` for curve orders and the cross-language coverage table.

## Verification: `validate`

```rust
use atproto_identity::key::validate;

validate(&public_key, &signature_bytes, &content_cid.to_bytes())
    .map_err(|e| AttestationError::SignatureValidationFailed { error: e })?;
```

`validate` dispatches on `public_key.key_type()` and runs the matching curve's verify. It is **permissive** — it accepts both low-S and high-S signatures. If your threat model requires strict canonical (low-S only) verification:

```rust
use atproto_attestation::normalize_signature;

let normalized = normalize_signature(signature_bytes.clone(), public_key.key_type())?;
if normalized != signature_bytes {
    return Err(AttestationError::SignatureNotNormalized);
}
validate(&public_key, &signature_bytes, content_cid_bytes)?;
```

The spec only requires produced signatures to be low-S — accepting high-S on verify is compliant. Strict verifiers may reject; there's a `SignatureNotNormalized` error code reserved for this case, though the crate itself doesn't emit it today.

## Wire format details

### What 64 bytes means

For P-256 / K-256 both `r` and `s` are 256-bit integers. The wire format is big-endian, zero-padded, concatenated:

```
byte 0          byte 31 byte 32         byte 63
┌───────────────┬────────┬─────────────────────┐
│       r       │        │         s           │
└───────────────┴────────┴─────────────────────┘
```

No length tag, no ASN.1, no DER. This is IEEE P1363. `.to_vec()` on a `k256::ecdsa::Signature` or `p256::ecdsa::Signature` produces exactly this.

### Base64 wrapping

After normalization:

```rust
use base64::Engine;
let wrapper = serde_json::json!({
    "$bytes": base64::engine::general_purpose::STANDARD.encode(normalized)
});
```

**Standard base64** (alphabet `A-Za-z0-9+/`, `=` padding). Not URL-safe. `BASE64` in the crate (`src/utils.rs`) is `base64::engine::general_purpose::STANDARD`.

## Generating keys

```rust
use atproto_identity::key::{generate_key, to_public, KeyType};

// P-256 (NIST secp256r1 / prime256v1)
let priv_p256 = generate_key(KeyType::P256Private)?;
let pub_p256  = to_public(&priv_p256)?;

// K-256 (secp256k1 — Bitcoin/Ethereum curve)
let priv_k256 = generate_key(KeyType::K256Private)?;
let pub_k256  = to_public(&priv_k256)?;
```

Both return `KeyData`. `to_public` drops the private scalar. Display (`format!("{key}")`) yields `did:key:z…`.

## Going from `did:key:…` to `KeyData`

```rust
use atproto_identity::key::identify_key;

let key: KeyData = identify_key("did:key:zQ3shNzMp4oaa…")?;
// multibase + multicodec decode → public KeyData
```

This is the standard path inside a `KeyResolver` that only handles `did:key:` references.

## Round-trip sanity check

```rust
use atproto_attestation::{create_signature, AnyInput};
use atproto_identity::key::{validate, to_public, generate_key, KeyType};

let priv_k = generate_key(KeyType::P256Private)?;
let pub_k  = to_public(&priv_k)?;

let record   = serde_json::json!({"$type": "test", "x": 1});
let metadata = serde_json::json!({"$type": "com.example.sig"});
let repo     = "did:plc:self-test";

let sig = create_signature(
    AnyInput::Serialize(record.clone()),
    AnyInput::Serialize(metadata.clone()),
    repo,
    &priv_k,
)?;

// Recompute CID manually and verify:
let cid = atproto_attestation::cid::create_attestation_cid(
    AnyInput::Serialize(record),
    AnyInput::Serialize(metadata),
    repo,
)?;
validate(&pub_k, &sig, &cid.to_bytes())?;
```

This is exactly what the crate's unit tests do (`test_create_signature_returns_valid_bytes` in `attestation.rs`).

## Common mistakes

- **Forgetting to call `normalize_signature`.** If you use `sign()` directly for non-attestation signing, the result may be high-S. Low-S is an attestation-layer requirement — normalize yourself.
- **Passing `KeyType::P256Public` or `K256Public` to `normalize_signature`.** Matches the pattern, so it works — but semantically odd. The function only cares about the curve, not public/private.
- **Using `base64::encode_config(URL_SAFE)`.** URL-safe base64 decodes differently for 62 (`+`/`-`) and 63 (`/`/`_`). Spec says standard. Always standard.
- **Manually building `r‖s`.** You never need to. `sign` + `normalize_signature` hand you the exact bytes. If you're building signatures in assembly, you're off the supported path.
- **Assuming P-384 will Just Work.** It won't. See the gap above.

## See also

- `creating.md`, `verifying.md` — callers of these primitives.
- `../shared/signature-normalization.md` — curve orders, cross-language gaps.
- `../shared/cid-computation.md` — what's in the 36 bytes being signed.
- `atproto_identity` source for `sign`/`validate`/`KeyType` dispatch.

# Rust — setup & idioms

The reference implementation is the `atproto-attestation` crate in `ngerakines.me/atproto-crates`. This skill treats it as canonical — if your Rust code is interop-critical, consume that crate rather than reimplementing.

## The crate

- **Name**: `atproto-attestation`
- **Repo**: <https://tangled.org/ngerakines.me/atproto-crates/tree/main/crates/atproto-attestation>
- **Local checkout (this machine)**: `/Users/nick/conductor/workspaces/atproto-crates-studious-guide/delhi-v2/crates/atproto-attestation`
- **License, version**: see the crate's `Cargo.toml` — current `0.14.x` series at time of writing.

Pull it as a dependency (replace with the current version/source):

```toml
[dependencies]
atproto-attestation = { git = "https://tangled.org/ngerakines.me/atproto-crates", package = "atproto-attestation" }
atproto-identity = { git = "https://tangled.org/ngerakines.me/atproto-crates", package = "atproto-identity" }
atproto-client    = { git = "https://tangled.org/ngerakines.me/atproto-crates", package = "atproto-client" }
serde             = { version = "1", features = ["derive"] }
serde_json        = "1"
tokio             = { version = "1", features = ["macros", "rt-multi-thread"] }
anyhow            = "1"
```

Related crates in the same workspace you'll almost certainly also need:

- `atproto-identity` — `KeyData`, `KeyType`, `KeyResolver`, `sign`, `validate`, `to_public`, `generate_key`.
- `atproto-record` — `Tid` (for TID rkeys), lexicon type exports including `STRONG_REF_NSID`.
- `atproto-client` — `RecordResolver` trait (remote attestation fetch).
- `atproto-dasl` (under the hood) — DAG-CBOR canonical encoder used internally.

You don't have to import them directly if you only use the high-level attestation API, but you'll need `atproto-identity` at minimum for key creation.

## Public API at a glance

From `atproto_attestation::*` (see `src/lib.rs` in the crate):

| Function                       | Shape                                                                 | Purpose                                                     |
| ------------------------------ | --------------------------------------------------------------------- | ----------------------------------------------------------- |
| `create_inline_attestation`    | sync, `(record, metadata, repo, key) → Value`                         | Create + sign; returns record with appended signature.      |
| `create_remote_attestation`    | sync, `(record, metadata, repo, attestor_repo) → (Value, Value)`      | Create proof record + attested record; publish proof yourself. |
| `append_inline_attestation`    | async, `(record, attestation, repo, key_resolver) → Value`            | Validate a supplied inline attestation and append it.       |
| `append_remote_attestation`    | sync, `(record, proof_meta, repo, attestation_uri) → Value`           | Validate an already-stored proof and append strongRef.      |
| `verify_record`                | async, `(record, repo, key_resolver, record_resolver) → ()`           | Verify all signatures on a record.                          |
| `create_signature`             | sync, `(record, metadata, repo, key) → Vec<u8>`                       | Low-level: just the raw normalized signature bytes.         |
| `create_dagbor_cid`            | sync, `(&Serializable) → Cid`                                         | Raw DAG-CBOR CID — **no** `$sig` merge, for proof records.  |
| `normalize_signature`          | sync, `(Vec<u8>, KeyType) → Vec<u8>`                                  | Low-S normalization for P-256/K-256.                        |

Plus types:

- `AnyInput<S: Serialize + Clone>` — enum `{ String(String), Serialize(S) }`; the universal input wrapper.
- `AttestationError` — single error enum with numbered error codes.
- `RecordResolver` (re-exported from `atproto_client`) — trait for fetching proof records by AT-URI.

## `AnyInput` — why it exists

Every attestation function takes `AnyInput<R>` and `AnyInput<M>` rather than bare `serde_json::Value` or a typed struct. Two reasons:

1. You may have a typed lexicon struct (`#[derive(Serialize)]`) or a raw `serde_json::Value` depending on where the record came from.
2. In some tools the record arrives as a JSON **string** (stdin, HTTP body) and re-parsing into `Value` just to feed it to the library is wasteful.

Construct it one of two ways:

```rust
use atproto_attestation::AnyInput;

// from a typed value or a serde_json::Value
let input = AnyInput::Serialize(my_record);

// from a JSON string (parsed lazily)
let input: AnyInput<serde_json::Value> = AnyInput::String(raw_json.to_string());

// or via FromStr (parses eagerly into Value)
let input: AnyInput<serde_json::Value> = raw_json.parse()?;
```

Internally `TryFrom<AnyInput<S>> for Map<String, Value>` handles both variants; either way the eventual shape is a JSON object.

## Key types

From `atproto_identity::key`:

- `KeyType::P256Private` / `KeyType::P256Public`
- `KeyType::K256Private` / `KeyType::K256Public`
- `KeyType::P384Private` / `KeyType::P384Public` — **do not use for attestations**, `normalize_signature` rejects these (see `shared/signature-normalization.md`).

Key construction:

```rust
use atproto_identity::key::{generate_key, to_public, KeyType};

let private = generate_key(KeyType::P256Private)?;
let public  = to_public(&private)?;
let did_key = format!("{}", public); // → "did:key:zQ3s..." / similar
```

## Error handling

`AttestationError` is one flat enum with all failure modes. The `#[error("error-atproto-attestation-N …")]` messages carry stable numeric codes (see `src/errors.rs`) that are useful in logs when you need to grep for a specific failure mode across systems.

Common ones to handle at application boundaries:

- `RecordMustBeObject`, `MetadataMustBeObject` — upstream JSON was an array/scalar.
- `MetadataMissingType` — attestor didn't set `$type`.
- `UnsupportedKeyType` — you passed a P-384 key (or anything else) to normalization. Caller error.
- `SignatureValidationFailed` — verification failed. For inline attestations this is the "bad signature" signal.
- `RemoteAttestationCidMismatch` — the proof record's claimed CID doesn't match what you computed. Either tampering or a mismatched metadata object.
- `KeyResolutionFailed` — your `KeyResolver` couldn't map `key` → `KeyData`.
- `RemoteAttestationFetchFailed` — your `RecordResolver` couldn't fetch the proof record AT-URI.

`anyhow::Result` is fine in application code; library code generally propagates the typed error.

## Async surface

Only two functions are `async`: `append_inline_attestation` and `verify_record`. Both need to resolve a key from a `did:key:` or DID doc reference, which involves I/O in the general case (DID resolution). The other functions are synchronous — they only do CBOR/SHA/ECDSA work.

If you already have a `KeyData` in hand (e.g., the public key was embedded in a JWT or handed to you by a prior resolution step), wrap it in a trivial `KeyResolver` that returns it unconditionally — see `verifying.md` for an example.

## Two CLI binaries

The crate ships two `clap` binaries under the `clap,tokio` features:

- `atproto-attestation-sign` — create signed records from the command line.
- `atproto-attestation-verify` — verify records from the command line.

These are useful for interop testing — produce a signed record in Rust, verify it in TypeScript or Go, and vice versa. See `shared/test-vectors.md` for the round-trip recipe.

## See also

- `creating.md` — inline + remote create flow, worked examples.
- `verifying.md` — `verify_record` + writing a `KeyResolver` / `RecordResolver`.
- `signatures.md` — `sign`/`validate`/`normalize_signature` details and the P-384 gap.
- `../shared/spec.md` — normative spec.
- `../shared/divergence-matrix.md` — how Rust compares to TS/Go.

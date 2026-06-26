# Rust (atproto-dasl / cid)

The reference Rust implementation is [`atproto-dasl`](https://docs.rs/atproto-dasl) — it ships the three CID types, the DRISL-strict codec, and the multiformats constants you need. Prefer it to hand-rolling against the bare `cid` / `multihash` crates.

## Dependencies

```toml
[dependencies]
atproto-dasl = "0.1"     # reference implementation, DASL-strict (this skill tracks 0.1.x)
serde = { version = "1", features = ["derive"] }   # for record structs
```

Guidance in this directory tracks `atproto-dasl 0.1.x`. If you pull a later major version, re-check the type, function, and feature names against the current docs.rs page before trusting the snippets below.

If you need BLAKE3 (BDASL extension), enable the feature on `atproto-dasl`. If you need to interop with general-purpose IPLD CIDs outside the DASL subset, you can still reach the underlying [`cid`](https://docs.rs/cid) 0.11 and [`multihash-codetable`](https://docs.rs/multihash-codetable) crates via re-exports:

```rust
use atproto_dasl::cid::{CidCore, DAG_CBOR_CODEC, SHA256_CODE, MULTIBASE_IDENTITY};
// CidCore is the re-exported cid::Cid from the underlying crate.
```

## The three CID types — pick the right one

`atproto-dasl` exposes three wrappers; each has a different correctness contract.

| Type | When to use | Guarantees |
| --- | --- | --- |
| [`DaslCid`](https://docs.rs/atproto-dasl/latest/atproto_dasl/cid/struct.DaslCid.html) | You are handling AT Protocol data and need DASL-conformant CIDs at type level. | Construction rejects anything outside DASL (codec ∈ {0x55, 0x71}, hash SHA-256 or BLAKE3-if-BDASL, 32-byte digest, CIDv1). If you have a value of this type, it *is* a DASL CID. |
| [`Cid`](https://docs.rs/atproto-dasl/latest/atproto_dasl/cid/struct.Cid.html) | Interop waypoint — parsing CBOR / bytes from an untrusted source before validating. | Accepts arbitrary valid CIDs (including non-DASL). Call `DaslCid::new(cid.into_inner())` to promote once validated. |
| [`RawCid`](https://docs.rs/atproto-dasl/latest/atproto_dasl/cid/struct.RawCid.html) | Decoding records produced by non-DASL implementations where you must preserve bytes verbatim. | Holds the raw bytes losslessly; does not parse or validate. Use `.to_cid()` / `.to_dasl_cid()` to try promoting. |

**Rule of thumb:** for code you own, function signatures should take `DaslCid`, not `Cid`, to push validation to the boundary. Save `Cid` and `RawCid` for decoding routines that must not reject yet.

## Strictness is enforced, but verification is separate

`DaslCid::new` / `::from_bytes` rejects the wrong codec, wrong hash code, wrong digest length, and CIDv0. It does **not** hash any content. To confirm that a CID matches specific bytes, use `DaslCid::verify_bytes(&self, data: &[u8])` or the free function `verify_cid_bytes(cid, data)`. See `shared/divergence-matrix.md` §6 for why this is two steps.

## Where the source lives

Reference implementation: `atproto-dasl/src/cid/mod.rs`. Published to [docs.rs](https://docs.rs/atproto-dasl); source at <https://tangled.org/ngerakines.me/atproto-crates> (subdir `atproto-dasl`). Key items to look up in the rustdoc or the source:

- `DaslCid` struct
- `DaslCid::from_dag_cbor_sha256`, `DaslCid::from_raw_sha256`
- `compute_cid` / `compute_cid_for<T>`
- `validate_dasl_cid`
- JSON `$link` serde module

Reading that module end-to-end is the fastest way to internalize the type boundaries.

## Idioms Rust engineers expect

- **Error types are typed enums** — `DaslCidError`, `DecodeError`. Use `match` exhaustively rather than string-matching `.to_string()`.
- **`Display` is base32lower string form** — `cid.to_string()` works, and `format!("{cid}")` does too.
- **`FromStr` is implemented** — `let cid: DaslCid = "bafyrei…".parse()?;` works.
- **`serde` support is wired** — a `Cid` field in a struct serializes as `{"$link": "…"}` in JSON (via `atproto_dasl::cid::json`) and as tag 42 + identity-prefix in DAG-CBOR automatically.
- **`Clone + Copy` — not quite**: `DaslCid` is `Clone` but not `Copy` (it wraps a 36-byte structure). Pass by reference in hot paths; clone when you actually need ownership.

## Next

- Parsing paths → `parsing.md`
- Construction from content → `construction.md`
- Codec constants and BLAKE3 specifics → `codecs.md`
- Cross-language differences → `../shared/divergence-matrix.md`

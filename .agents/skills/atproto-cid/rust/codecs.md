# Rust — Codecs, Hash Codes, and BLAKE3

Rust's `cid` 0.11 removed the `Codec` enum, so values flow as `u64` constants. `atproto-dasl` ships named constants so you don't hand-write magic numbers.

## Constants to import, not retype

```rust
use atproto_dasl::cid::{
    DAG_CBOR_CODEC,        // 0x71
    RAW_CODEC,             // 0x55
    SHA256_CODE,           // 0x12
    BLAKE3_CODE,           // 0x1e
    MULTIBASE_IDENTITY,    // 0x00 (the leading byte inside DAG-CBOR tag-42 byte strings)
    CID_CBOR_TAG,          // 42 (the CBOR tag value)
};
```

All are `pub const u64` / `pub const u8`. Inlining a literal `0x71` in new code is a code smell — import the name so the intent reads.

## What the DASL subset accepts

```
codec:     DAG_CBOR_CODEC | RAW_CODEC
hash_code: SHA256_CODE                     // plain DASL
         | BLAKE3_CODE                     // BDASL extension only
digest_len: 32
version:   CIDv1
```

Anything else → `DaslCidError`. The `validate_dasl_cid(cid)` / `validate_dasl_or_bdasl_cid(cid)` free functions expose this check if you have a bare `CidCore` and want to decide whether it survives the DASL gate:

```rust
use atproto_dasl::cid::{validate_dasl_cid, validate_dasl_or_bdasl_cid, CidCore};

// Strict DASL — rejects BLAKE3
validate_dasl_cid(&cid_core)?;

// DASL + BDASL — accepts BLAKE3
validate_dasl_or_bdasl_cid(&cid_core)?;
```

## Choosing the codec

One question: is the content a structured record or an opaque blob?

| Content | Codec | Why |
| --- | --- | --- |
| ATProto record (`$type: …`) | `DAG_CBOR_CODEC` | Records are structured data, canonically encoded as DAG-CBOR. |
| MST node | `DAG_CBOR_CODEC` | MST nodes are maps of entries — canonical CBOR. |
| Commit | `DAG_CBOR_CODEC` | Same — small structured record. |
| Image, video, arbitrary file | `RAW_CODEC` | Opaque; no canonical structural interpretation. |
| CAR file | N/A — CAR is a transport, not a block type. Its blocks are dag-cbor or raw individually. |

Never mix: an `app.bsky.feed.post` record whose CID has codec `RAW_CODEC` is malformed, even if the digest is correct.

## BLAKE3 (BDASL)

BDASL extends DASL by permitting BLAKE3 (`0x1e`) as the hash function for large-file content. Keep it scoped:

- **Plain DASL contexts reject BLAKE3.** Records, MST nodes, commits are always SHA-256. Do not emit `0x1e` for these.
- **Blob contexts may emit BLAKE3** when the platform explicitly opts in. Use `compute_cid_blake3` / `compute_raw_cid_blake3` only for those.

The `atproto-dasl` crate's BLAKE3 support is feature-gated:

```toml
[dependencies]
atproto-dasl = { version = "0.1", features = ["blake3"] }
```

Without the feature, the functions exist but return an error on call. Design for BLAKE3 support behind a compile-time flag, so downstream consumers can opt out.

## Hash code discipline

- `SHA256_CODE` = `0x12`, digest length `0x20` (32). Same digest length for BLAKE3 — the hash functions differ, the output size does not.
- `InvalidHashCode { code: 0x13 }` means SHA-512; reject.
- `InvalidHashCode { code: 0x17 }` means SHA-3-256; reject.
- `InvalidHashCode { code: 0x00 }` means "identity multihash" — the digest is the input itself. This is a valid multihash in general IPLD but nowhere in DASL. Reject hard.

## Cross-language note

Rust and TypeScript both require you to either import or hand-declare codec constants. Go ships `cid.DagCBOR`, `cid.Raw`, `cid.DagPB`, etc. directly. If you are porting test fixtures between languages, use the `0x71`/`0x55`/`0x12`/`0x1e` numeric values — those are language-neutral. See `../shared/divergence-matrix.md` §codec-constants.

## See also

- `../shared/spec.md` — the normative list of allowed values.
- `../shared/binary-layout.md` — how codec and hash bytes position in the 36-byte layout.
- `construction.md` — functions that use these constants.
- `parsing.md` — errors returned when inputs fall outside them.

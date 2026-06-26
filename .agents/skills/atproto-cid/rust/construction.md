# Rust — Constructing a CID

Four construction paths. Pick the one that matches your input.

## 1. DAG-CBOR record → CID (the common case)

If you have a serde-serializable record, let `atproto-dasl` do the encode-then-hash:

```rust
use atproto_dasl::cid::{compute_cid_for, DaslCid};

#[derive(serde::Serialize)]
struct Profile {
    #[serde(rename = "$type")]
    ty: &'static str,
    display_name: String,
}

let record = Profile { ty: "app.bsky.actor.profile", display_name: "Alice".into() };
let cid_core = compute_cid_for(&record)?;       // DRISL encode + SHA-256 + CIDv1 assembly
let cid: DaslCid = DaslCid::new(cid_core)?;
```

`compute_cid_for` goes through the DRISL-strict encoder, so you get canonical bytes — same input, same CID, byte-for-byte, every time. **Never call `serde_cbor` or `ciborium` directly for this** — they do not produce canonical output and your CIDs will disagree with every other AT Protocol implementation.

## 2. Arbitrary DAG-CBOR bytes → CID

If you already have canonical DAG-CBOR bytes (e.g., a record you received over the wire and want to compute the CID of):

```rust
use atproto_dasl::cid::{compute_cid, DaslCid};

let cbor_bytes: &[u8] = /* pre-encoded DRISL-strict CBOR */;
let cid_core = compute_cid(cbor_bytes);         // dag-cbor codec + SHA-256
let cid: DaslCid = DaslCid::new(cid_core)?;
```

Or skip the intermediate step with the ergonomic helper:

```rust
let cid = DaslCid::from_dag_cbor_sha256(cbor_bytes);   // returns DaslCid directly
```

This is the hash-and-wrap path for blocks pulled out of a CAR file.

## 3. Raw blob → CID

For opaque binary content (images, video, arbitrary attachments):

```rust
use atproto_dasl::cid::{compute_raw_cid, DaslCid};

let blob_bytes: &[u8] = &std::fs::read("image.png")?;
let cid_core = compute_raw_cid(blob_bytes);     // raw codec (0x55) + SHA-256
let cid: DaslCid = DaslCid::new(cid_core)?;

// Or:
let cid = DaslCid::from_raw_sha256(blob_bytes);
```

The `raw` codec means "the content is opaque bytes, don't try to decode." Images and binary attachments in AT Protocol use this codec exclusively.

## 4. Assemble manually from (codec, digest)

For the rare case where you have a pre-computed SHA-256 (e.g., from a trusted source) and just need to build the CID wrapper:

```rust
use atproto_dasl::cid::{CidCore, DaslCid, DAG_CBOR_CODEC};
use multihash_codetable::{Code, MultihashDigest};

let digest_bytes: [u8; 32] = /* pre-computed SHA-256 */;
let mh = Code::Sha2_256.wrap(&digest_bytes)?;   // cheap — just wraps bytes
let cid_core = CidCore::new_v1(DAG_CBOR_CODEC, mh);
let cid = DaslCid::new(cid_core)?;
```

Reach for this only when you have a strong reason not to re-hash — it's the most error-prone path (wrong hash wrapping, wrong codec constant, forgetting `new_v1`), and it's the easiest to get wrong silently.

## BLAKE3 (BDASL) variants

```rust
use atproto_dasl::cid::{compute_cid_blake3, compute_raw_cid_blake3};

let dag_cbor_blake3 = compute_cid_blake3(cbor_bytes);
let raw_blake3     = compute_raw_cid_blake3(blob_bytes);
```

Same structure as the SHA-256 variants but with hash code `0x1e`. Use only when the surrounding platform explicitly opts in to BDASL — plain DASL validation rejects `0x1e` (see `codecs.md`).

## Serialising back out

Once you have a `DaslCid`, produce the outbound form for whatever layer you are in:

```rust
let s: String = cid.to_string();                       // "bafyrei..." string form
let binary: Vec<u8> = cid.to_bytes();                  // 36-byte form (no identity prefix)
let cbor: Vec<u8> = cid.to_dag_cbor_bytes();           // tag 42 + identity prefix + 36 bytes
// JSON $link form is automatic via serde — see parsing.md
```

Remember the 36 vs 37 distinction: `to_bytes()` returns 36 bytes (CAR block frame form); `to_dag_cbor_bytes()` returns the full ~41-byte CBOR envelope. See `../shared/divergence-matrix.md` and the `atproto-repository` skill.

## Round-trip test recipe

This should hold for every construction path:

```rust
let record = /* some struct */;
let cid_via_record = compute_cid_for(&record)?;
let cbor = atproto_dasl::to_vec(&record)?;
let cid_via_bytes = compute_cid(&cbor);
assert_eq!(cid_via_record, cid_via_bytes);     // same CID either way
```

If these disagree, the encoder is non-canonical — check map key sort order, integer shortest form, and indefinite-length framing (see `atproto-repository/references/drisl.md`).

## Common construction mistakes

| Symptom | Cause |
| --- | --- |
| "Same record produces different CIDs across processes" | You are not using DRISL-strict encoding. `serde_cbor` and `ciborium` default to non-canonical — use `atproto_dasl::to_vec` only. |
| "CID matches on the first insert but not the second" | Field order in your struct changed; use `#[serde(rename = "…")]` and let `atproto_dasl` sort, don't rely on struct field declaration order for CBOR output. (DRISL sorts keys regardless — but if you are hand-constructing the map, this matters.) |
| "Manual assembly produces a CID with wrong codec byte" | You used `new_v0` somewhere, or passed the codec as the multihash code. `CidCore::new_v1(codec, multihash)` is the right shape. |
| "`from_dag_cbor_sha256` accepts invalid CBOR" | It doesn't validate the input as CBOR — it just hashes. Always decode-then-re-encode through `atproto_dasl::from_slice` + `to_vec` if you want canonicality-checking before hashing. |

## See also

- `parsing.md` — the reverse direction.
- `codecs.md` — codec and hash-code constants.
- `../shared/binary-layout.md` — exact byte diagrams the construction must produce.
- `../shared/test-vectors.md` — expected CIDs for specific inputs.

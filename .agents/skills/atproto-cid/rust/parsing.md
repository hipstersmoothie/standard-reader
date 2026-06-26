# Rust — Parsing a CID

Covers the four inputs you see in practice: a string (`bafyrei…`), raw 36 bytes (CAR block frame), a DAG-CBOR payload (tag 42 wrapping), and a JSON record field (`{"$link": "…"}`).

Always prefer `DaslCid` over `Cid` at type boundaries (see `README.md`). The examples below promote to `DaslCid` as soon as possible.

## From a string

Use `FromStr` / `TryFrom<&str>`. `atproto-dasl` accepts only the base32lower `b…` form — other multibases are rejected.

```rust
use atproto_dasl::cid::DaslCid;

let s = "bafyreihunttf7a3uvtzrgbnyu2rzv24w4zx7xjwqgk4x5w7n5yvq7u7aua";
let cid: DaslCid = s.parse()?;           // FromStr
// or
let cid = DaslCid::new(s.parse()?)?;     // parse to underlying, then validate
```

`DaslCid::from_str` does the DASL gate in one step. If you want the permissive parse for interop (to *then* decide whether to reject), use `Cid::from_str` and later promote via `DaslCid::new(cid.into_inner())?`.

## From 36 raw bytes

This is the form inside a CAR block frame (no tag, no identity prefix).

```rust
use atproto_dasl::cid::DaslCid;

let bytes: &[u8] = &read_exact(reader, 36)?;
let cid = DaslCid::from_bytes(bytes)?;
```

`DaslCid::from_bytes` validates length, version byte, codec byte, hash code, and digest length. Any violation produces a typed `DaslCidError` variant.

## From a DAG-CBOR byte string (tag 42)

Inside DAG-CBOR, a CID is CBOR tag 42 wrapping a byte string of length 37 (identity multibase `0x00` + 36 CID bytes). `atproto-dasl`'s serde integration handles this for you — any struct field typed as `Cid` or `DaslCid` round-trips correctly:

```rust
#[derive(serde::Deserialize)]
struct MstEntry {
    p: u32,
    k: serde_bytes::ByteBuf,
    v: atproto_dasl::cid::DaslCid,   // tag 42 + identity prefix handled automatically
}

let entry: MstEntry = atproto_dasl::from_slice(cbor_bytes)?;
```

For hand-decoded CBOR (rare — prefer `from_slice`), use `Cid::from_dag_cbor_bytes(bytes)`. It expects the full tag-42 envelope:

```rust
use atproto_dasl::cid::Cid;

// bytes starts with 0xd8 0x2a 0x58 0x25 0x00 …
let cid = Cid::from_dag_cbor_bytes(cbor_bytes)?;
let dasl = DaslCid::new(cid.into_inner())?;
```

## From a JSON `$link`

Records in JSON form use `{"$link": "bafyrei…"}`. The `atproto_dasl::cid::json` module provides the serde bridge:

```rust
#[derive(serde::Deserialize)]
struct BlobRef {
    #[serde(rename = "$type")]
    ty: String,
    #[serde(with = "atproto_dasl::cid::json")]
    ref_: atproto_dasl::cid::Cid,       // handles {"$link": "..."} shape
    mime_type: String,
    size: u64,
}
```

For `Option<Cid>`, use `atproto_dasl::cid::json::option` instead.

Never accept a bare string — a record whose CID field is `"bafyrei…"` (not wrapped in `{"$link": "…"}`) is malformed in the AT Protocol JSON convention. Fail the parse, don't silently round-trip.

## Streaming / reader-based

For CAR block parsing where you want to read bytes incrementally, read exactly 36 bytes from the reader and parse them:

```rust
use std::io::Read;
use atproto_dasl::cid::DaslCid;

let mut reader = /* an impl Read */;
let mut buf = [0u8; 36];
reader.read_exact(&mut buf)?;
let cid = DaslCid::from_bytes(&buf)?;
```

`read_exact` handles partial reads; `DaslCid::from_bytes` enforces the full DASL subset (version, codec, hash code, digest length) in one step. If your version of `atproto-dasl` ships a `read_cid` helper that takes `&mut impl Read`, prefer it — the manual 36-byte buffer is the portable fallback.

## Error handling

```rust
use atproto_dasl::cid::DaslCidError;

match DaslCid::from_bytes(bytes) {
    Ok(cid) => /* good */,
    Err(DaslCidError::InvalidLength { expected, actual }) => /* … */,
    Err(DaslCidError::InvalidCodec { codec }) => /* 0x70 dag-pb etc. */,
    Err(DaslCidError::InvalidHashCode { code }) => /* not SHA-256/BLAKE3 */,
    Err(DaslCidError::InvalidDigestLength { length }) => /* not 32 */,
    Err(DaslCidError::InvalidVersion { version }) => /* CIDv0 */,
    Err(e) => /* catch-all */,
}
```

Exhaustive matching catches new variants added in future crate versions; prefer it to `if let` for library code.

## Validation vs verification

`from_bytes` / `from_str` / `from_dag_cbor_bytes` *validate* — they confirm the bytes describe a well-formed DASL CID. To *verify* that a CID matches content, use `DaslCid::verify_bytes(&self, data: &[u8])`:

```rust
let cid: DaslCid = "bafyrei…".parse()?;
let record_bytes = fetch_record_bytes(&cid)?;
cid.verify_bytes(&record_bytes)?;           // re-hashes and compares
```

This is the routine to run on every block you pull out of a CAR — see the `atproto-repository` skill for how it fits into a streaming verifier.

## Common parse failures

| Error | Likely cause |
| --- | --- |
| `InvalidVersion { version: 0 }` | Input is a CIDv0 `Qm…`. Reject; no lossy upgrade. |
| `InvalidCodec { codec: 0x70 }` | dag-pb. IPFS-native, not DASL. |
| `InvalidHashCode { code: 0x13 }` | SHA-512 or other unsupported hash. |
| `InvalidDigestLength { length: 20 }` | Truncated SHA-1 or old hash. Reject. |
| `Multibase(_)` / "expected prefix 'b'" | Caller passed `z…` (base58btc) or `m…` (base64). |
| `DecodeError::MissingIdentityPrefix` | Inside a DAG-CBOR tag-42 byte string the first byte is not `0x00`. Upstream encoder is broken. |

## See also

- `construction.md` — going from bytes to a CID.
- `codecs.md` — codec constants and BLAKE3.
- `../shared/spec.md` — the rules being enforced.
- `../shared/test-vectors.md` — fixtures for asserting behaviour.

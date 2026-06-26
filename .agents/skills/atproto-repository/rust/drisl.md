# Rust — DRISL encoding and decoding

`atproto-dasl` is the DRISL-strict encoder/decoder for the Rust stack. Every repo block — records, MST nodes, commits — goes through `atproto_dasl::to_vec` to encode and `atproto_dasl::from_slice` to decode. The encoder is strict by default; the decoder has both strict and legacy-reading paths.

## Entry points

```rust
use atproto_dasl::{to_vec, from_slice, from_slice_non_strict};

// Encode any `Serialize` value to DRISL-canonical DAG-CBOR bytes.
let bytes: Vec<u8> = atproto_dasl::to_vec(&my_record)?;

// Decode DRISL-canonical bytes into any `DeserializeOwned` value.
// Rejects non-canonical inputs (unsorted keys, non-shortest integers, etc.).
let value: MyRecord = atproto_dasl::from_slice(&bytes)?;

// Decode leniently — accepts non-canonical inputs. Use only for reading
// legacy / externally-sourced data. Never pair with a re-encode: the bytes
// will differ, which means a different CID, which means signature failure.
let legacy: MyRecord = atproto_dasl::from_slice_non_strict(&bytes)?;
```

`to_vec` panics on NaN / Infinity by design — those values cannot be DRISL-encoded. Every I/O or protocol-shape error is an `Err` on `EncodeError` or `DecodeError`.

## Strict rules the encoder enforces

All of these are automatic. You don't call them — you get them by using `to_vec` and `from_slice`:

- Map keys sorted **bytewise lexicographically**, not by code point.
- Integers / length prefixes in **shortest form** (five widths: immediate, 1/2/4/8 bytes).
- No indefinite-length framing.
- Floats: 64-bit only; NaN and Infinity rejected.
- Only CBOR tag 42 is permitted (CIDs). All other tags are decode errors.
- Map key type must be a text string. Integer and byte-string keys are rejected.
- Duplicate map keys rejected.
- Trailing data after the top-level value rejected.

When debugging a `DecodeError::NonCanonicalEncoding` / `MapKeysNotSorted` / `UnsupportedTag`, the producer is non-conformant. Don't try to encode around it — fix the producer.

## Working with dynamic / unknown-shape data

For records whose shape isn't known at compile time:

```rust
use atproto_dasl::from_slice;
use serde_cbor::Value;           // or atproto_dasl's own Value type

let value: Value = atproto_dasl::from_slice(&bytes)?;
// match on Value::Map(...), Value::Array(...), Value::Bytes(...), etc.
```

`atproto_dasl` exposes its own `Value`-like type for IPLD-flavored dynamism; `serde_cbor::Value` also works for simple cases. For the record layer specifically, prefer typed `#[derive(Deserialize)]` structs with `atproto-record`'s lexicon types.

## CID handling inside DAG-CBOR

`atproto_dasl::Cid` (and its DASL-strict twin `DaslCid`) has `Serialize` / `Deserialize` impls that emit the tag-42 + identity-multibase-prefix form automatically:

```rust
#[derive(Serialize, Deserialize)]
struct Commit {
    did: String,
    version: u64,
    data: atproto_dasl::Cid,                  // emits as tag 42
    rev: String,
    prev: Option<atproto_dasl::Cid>,          // `None` is `null` in output
}
```

You do **not** need to hand-roll the tag-42 byte sequence. The internal serde signal `"__cid_tag_42__"` is the name the serializer / deserializer watches for to swap the byte representation in and out — treat that as an implementation detail, never a public API.

See the `atproto-cid` skill for CID parsing, construction, and codec selection in depth.

## Config knobs

`atproto_dasl::drisl` exposes `EncodeConfig` and `DecodeConfig` in `config.rs`:

- `DecodeConfig::strict()` — default; enforces every DRISL rule.
- `DecodeConfig::non_strict()` — accepts non-canonical inputs (issues warnings through the error channel in some versions).
- `EncodeConfig::default()` — always strict; no "relaxed" encode mode exists or should exist.

For the overwhelming majority of uses, the top-level `to_vec` / `from_slice` are what you want — they're thin wrappers over the default configs.

## Round-trip invariant as a test

If you can round-trip a value strict-decode → strict-encode → byte-compare, your encoder is DRISL-conformant for that value:

```rust
let decoded: MyRecord = atproto_dasl::from_slice(&original_bytes)?;
let re_encoded = atproto_dasl::to_vec(&decoded)?;
assert_eq!(original_bytes, &re_encoded[..]);
```

Add that as a property test or fuzz target over arbitrary `MyRecord` values.

## Varints

CAR framing uses unsigned LEB128 varints for block length prefixes. You rarely touch these directly, but if you do:

```rust
use atproto_dasl::varint::{read_u64, write_u64};

let mut buf = Vec::new();
write_u64(&mut buf, 1234)?;            // writes LEB128 bytes
let (value, consumed) = read_u64(&buf)?;  // reads LEB128 from slice
```

File: `atproto-dasl/src/varint/mod.rs`. `CarReader` / `CarWriter` call these internally.

## Common errors

| Error                                            | Cause                                                                                    |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `DecodeError::NonCanonicalEncoding`              | Integer or length not in shortest form. Producer is non-conformant.                      |
| `DecodeError::MapKeysNotSorted`                  | Map keys out of bytewise order. Producer doesn't sort; read with `from_slice_non_strict` if you must, never re-encode. |
| `DecodeError::DuplicateKey`                      | Map has the same key twice.                                                              |
| `DecodeError::UnsupportedTag`                    | CBOR tag other than 42 appeared.                                                          |
| `DecodeError::IndefiniteLength`                  | Indefinite-length framing used.                                                          |
| `EncodeError::UnsupportedFloat`                  | Tried to encode NaN or ±Infinity.                                                        |
| `EncodeError::InvalidMapKey`                     | Tried to encode a map whose key isn't a text string (e.g., `HashMap<u64, _>`).          |

## File pointers

Browse these when the error path needs debugging:

| Concern                         | File                                                                    |
| ------------------------------- | ----------------------------------------------------------------------- |
| Public surface                  | `atproto-dasl/src/drisl/mod.rs`; re-exports in `src/lib.rs`             |
| Strict / non-strict config      | `atproto-dasl/src/drisl/config.rs`                                      |
| Serializer (map-key sort logic) | `atproto-dasl/src/drisl/ser/serializer.rs`                              |
| Deserializer (strict checks)    | `atproto-dasl/src/drisl/de/` and `src/drisl/cbor/decode.rs`             |
| Raw CBOR framing (shortest-form)| `atproto-dasl/src/drisl/cbor/encode.rs`                                 |
| Varint read/write               | `atproto-dasl/src/varint/mod.rs`                                        |

## See also

- `../shared/drisl.md` — the normative rules these functions enforce.
- `../shared/divergence-matrix.md` — how Rust's DRISL maps to TypeScript's `@ipld/dag-cbor` and Go's cbor-gen.
- `../atproto-cid/rust/codecs.md` (sibling skill) — CID codec constants and tag-42 wire encoding.

# DRISL — Deterministic DAG-CBOR (Reference)

Source of truth: https://dasl.ing/drisl.html

DRISL is a named subset of DAG-CBOR: CBOR restricted so that any given value has **exactly one** valid encoding. Every block in an AT Protocol repository — every record, every MST node, every commit — is DRISL-encoded. Determinism is not optional; a non-canonical encoding will hash to a different CID and the repo will fail to verify.

This file states DRISL's rules. The rest of this skill assumes a DRISL-strict encoder and a strict decoder are in place.

## 1. The rules at a glance

1. Map keys are sorted **bytewise lexicographically** (not by codepoint, not by length-first).
2. Map keys are **text strings** (CBOR major type 3). Integer or byte-string keys are forbidden.
3. Integers use **shortest encoding**: the smallest of the five CBOR widths (immediate 0–23, 1-byte, 2-byte, 4-byte, 8-byte) that holds the value.
4. Lengths on arrays, maps, and strings use **shortest encoding**, same rule.
5. **No indefinite-length items** — no `0x5f/0x7f/0x9f/0xbf` framed values.
6. Floats are **64-bit only** (major type 7, additional info 27). 16-bit and 32-bit floats are forbidden.
7. **No NaN, no Infinity**. Encoders must reject them before writing; decoders must reject them on read.
8. **The only CBOR tag allowed is tag 42** (CIDs). Every other tag is a decoder error.
9. Duplicate map keys are forbidden.
10. Trailing data after the top-level value is forbidden — a DRISL payload is exactly one value.

A single bit that breaks any of these rules changes the resulting CID.

## 2. Map key ordering in practice

Sort keys by comparing their **UTF-8 byte representation** byte-by-byte, not codepoint by codepoint, not length-first. For ASCII keys this is equivalent to lexicographic sort. For non-ASCII keys it means higher-bit sequences sort differently than a naive code-point sort would suggest.

Example set of keys and their correct order:

```
$type        (0x24 0x74 0x79 0x70 0x65)
_meta        (0x5f 0x6d 0x65 0x74 0x61)
author       (0x61 0x75 0x74 0x68 0x6f 0x72)
createdAt    (0x63 0x72 0x65 0x61 0x74 0x65 0x64 0x41 0x74)
subject      (0x73 0x75 0x62 0x6a 0x65 0x63 0x74)
```

`$` (0x24) sorts before `_` (0x5f), which sorts before lowercase letters. A common bug is alphabetising as if `$type` came after `author`; if you see `$type` in any position other than first in your records' map keys, your encoder is non-canonical.

## 3. Integer shortest form

CBOR integers use major type 0 (unsigned) or major type 1 (negative). The shortest-encoding rule says: pick the narrowest "additional info" that represents the value.

| Value                          | Additional info byte | Follow-up bytes |
| ------------------------------ | -------------------- | --------------- |
| 0–23                           | the value itself (0x00–0x17 for positive) | none |
| 24–255                         | 0x18                 | 1 byte          |
| 256–65535                      | 0x19                 | 2 bytes         |
| 65536–4294967295               | 0x1a                 | 4 bytes         |
| 4294967296–2⁶⁴−1               | 0x1b                 | 8 bytes         |

The exact same rule applies to negative integers under major type 1, and to the length prefix on strings, byte strings, arrays, and maps.

**Non-canonical example**: encoding the value `5` with an 8-byte length: `1b 00 00 00 00 00 00 00 05`. The canonical form is just `05`. A strict decoder must reject the 8-byte form.

## 4. Float handling

Every floating-point value in DRISL is encoded as a 64-bit IEEE 754 double (8 bytes after the `0xfb` prefix). The canonical form of an integer value that also fits in an integer (e.g., `1.0` vs `1`) is the integer form — but in practice, record schemas explicitly pick one or the other; don't round-trip a JSON `1` through a float intermediate.

NaN, +∞, −∞ are **encode-time and decode-time errors**. If your data model must represent "no value", use CBOR null (`0xf6`) or omit the field entirely.

## 5. CIDs as tag 42

A CID inside DRISL is encoded as:

```
d8 2a              ; tag 42
58 <length>        ; byte string, shortest length form
00                 ; identity multibase prefix (REQUIRED)
<36 bytes>         ; raw CID bytes (CIDv1, 4-byte header + 32-byte digest)
```

Full rules are in the `atproto-cid` skill. Two rules matter here for determinism:

- The inner byte string is always 37 bytes (identity prefix + 36-byte CID). Its length prefix is `58 25` — single-byte length = 37. Non-canonical length encodings (like `59 00 25` or indefinite `5f … ff`) must be rejected.
- The identity multibase prefix byte `0x00` is **required**. A decoder that sees a CID byte string whose first byte is anything else must reject.

Every other CBOR tag — 0, 1, 2, 3, 21–24, 32, 55799, anything — is a hard error.

## 6. What a strict decoder checks

On every value it reads, a DRISL-strict decoder must verify all of:

- **Additional info is shortest** for the value's width.
- **Length prefixes are shortest** for strings, byte strings, arrays, maps.
- **Map keys are strings** and appear in sorted order with no duplicates.
- **No indefinite-length framing**.
- **No forbidden tags** (only 42).
- **Floats are 64-bit and finite**.
- **Trailing data**: exactly one top-level value consumes the entire buffer.

Any violation is a decode error. The whole block is rejected — there's no "skip and continue". Partial decodes leave the reader in a broken state; restart from the next block.

## 7. Lenient / non-strict mode

Non-strict decoding exists mainly to pull records out of legacy data that predates strict enforcement. It relaxes:

- Non-shortest integer/length encodings are accepted but produce a `NonCanonicalEncoding` warning.
- Duplicate map keys are tolerated (last write wins).
- Unsorted map keys are tolerated.

Non-strict mode **must never** be used to produce repo blocks or to verify signatures. The CID of a lenient-decoded block is not what a strict encoder would produce; re-serializing produces a different CID. Treat the lenient path as one-way: read only, do not write.

## 8. Why this matters

Two implications that trip up every new implementer:

1. **The order fields are listed in your source code does not matter.** JSON serializers sometimes preserve insertion order; DRISL ignores that and imposes byte order on keys. Build your encoder around `Map<String, Value>` with a sort step, not `struct` field order.
2. **Re-encoding a decoded value must yield the exact same bytes.** If round-tripping changes the bytes, your encoder is non-canonical somewhere — the most common culprits are integer widening, float canonicalization, and map-key sort.

## 9. Reference encoder behavior

The Rust implementation (`atproto-dasl::drisl`) enforces strict mode by default:

- `to_vec(value)` — DRISL-strict encode. Panics on NaN/Infinity by design.
- `from_slice(bytes)` — DRISL-strict decode. Returns `DecodeError::NonCanonicalEncoding` / `MapKeysNotSorted` / `UnsupportedTag` on violations.
- `from_slice_non_strict(bytes)` — lenient decode for legacy reads only.

Key file paths:

- `crates/atproto-dasl/src/drisl/mod.rs` — public API.
- `crates/atproto-dasl/src/drisl/cbor/encode.rs` — the shortest-form logic.
- `crates/atproto-dasl/src/drisl/ser/serializer.rs` — the map sort / buffer logic.
- `crates/atproto-dasl/src/drisl/cbor/decode.rs` — strict decode checks.
- `crates/atproto-dasl/src/drisl/config.rs` — strict vs non-strict flags.

A handy invariant: if you can round-trip a value (decode strict → re-encode strict → byte-equal), your encoder is DRISL-conformant for that value. Add that as a fuzz target.

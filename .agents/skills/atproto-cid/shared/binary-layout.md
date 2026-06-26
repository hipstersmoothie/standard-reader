# Binary and Wire Layout

This document walks through the on-the-wire byte representation of a DASL CID in every place it appears in AT Protocol: standalone, embedded in DAG-CBOR, and embedded in JSON. It also derives the human-recognisable string prefixes (`bafyrei…` and `bafkrei…`) bit by bit so implementers can reproduce them.

## 1. The 36-byte binary CID

```
offset  0    1    2    3    4 ..................................... 35
        ┌────┬────┬────┬────┬─────────────────────────────────────────┐
        │0x01│cdc │hsh │0x20│                digest                   │
        │    │    │    │    │              (32 bytes)                 │
        └────┴────┴────┴────┴─────────────────────────────────────────┘
         ver  cdc  hsh  len
```

- `ver` (offset 0) = `0x01` — CIDv1.
- `cdc` (offset 1) = `0x55` (raw) or `0x71` (dag-cbor).
- `hsh` (offset 2) = `0x12` (SHA-256) or, under BDASL, `0x1e` (BLAKE3).
- `len` (offset 3) = `0x20` — 32-byte digest length, always.
- `digest` (offsets 4–35) — the 32-byte SHA-256 or BLAKE3 output of the content.

Example (dag-cbor + SHA-256, first record in Bluesky's `app.bsky.actor.profile` lexicon):

```
01 71 12 20  b1 a5 62 d4 71 a3 6d 7a  9f e4 2b 63 87 c1 5e 8d
             d3 c4 7e f2 90 16 88 a4  05 7b 19 cc fa 7d 4e 22
```

(Digest bytes are illustrative; the header is exact.)

## 2. DAG-CBOR wrapping (CBOR tag 42 + identity multibase)

When a CID appears as a value inside a DAG-CBOR object, it is not written as those 36 bytes directly. It is wrapped:

```
CBOR byte sequence for a 36-byte CID:

  d8 2a            ; tag(42)   — the IPLD "this is a link" marker
  58 25            ; bytes(37) — major type 2 (byte string), length 37
  00               ;            identity multibase prefix
  01 71 12 20      ;            CID header
  <32 bytes>       ;            digest
```

Key facts:

- Tag 42 (`0xd82a`) is what DAG-CBOR uses to signal "this byte string is a CID, not arbitrary bytes". Omit it and consumers will see a 37-byte blob.
- The **inner byte string is 37 bytes**, not 36. The extra leading `0x00` is the multibase "identity" prefix — it says "the following bytes are literal binary, not a text-encoded representation". IPLD requires it. Implementations that forget to emit it produce payloads other readers will reject (this is one of the most common interop bugs).
- The CBOR length header for a 37-byte string is `58 25` (major type 2, one-byte length = `0x25` = 37). This is the canonical shortest form per DAG-CBOR deterministic encoding. A non-canonical length prefix (for example a two-byte length `59 00 25`, or an indefinite-length byte string `5f … ff`) must be rejected by a strict decoder — even though such encodings are legal in generic CBOR, they are forbidden in DAG-CBOR and would let the same logical CID have multiple on-wire representations.

Round-trip pseudocode:

```
function encode_cid_dag_cbor(cid_bytes_36):
    inner = bytes([0x00]) + cid_bytes_36         # 37 bytes
    return cbor_tag(42, cbor_byte_string(inner)) # d8 2a 58 25 ...

function decode_cid_dag_cbor(cbor_payload):
    tag, payload = cbor_read_tag(cbor_payload)
    assert tag == 42                  # else: not a CID
    inner = cbor_read_byte_string(payload)
    assert inner[0] == 0x00           # else: missing identity prefix
    cid_bytes = inner[1:]             # 36 bytes
    return cid_bytes
```

## 3. JSON wrapping (`$link`)

In AT Protocol JSON, a CID-typed field is an object with a single `$link` key whose value is the string form:

```json
{"$link": "bafyreihunttf7a3uvtzrgbnyu2rzv24w4zx7xjwqgk4x5w7n5yvq7u7aua"}
```

- This format is defined by AT Protocol, not by DASL or IPLD.
- Bare strings and bare binary values are not acceptable — reject them.
- Round-tripping JSON ↔ DAG-CBOR must convert between `{"$link": "b…"}` and the tag-42 + identity-prefix wrapping above.

## 4. String form: deriving the fixed prefixes

The first four bytes of the binary CID are fixed by the header. Base32 encodes five bits per character, so the first 30 bits of the binary — all of bytes 0, 1, 2 (24 bits) plus the top 6 bits of byte 3 — map onto the first **six** data characters of the string form (characters 2 through 7, after the `b` multibase prefix). Those six characters are therefore **entirely determined** by the codec and hash choice. The seventh data character (the eighth character of the full string) depends on the digest.

Base32 encodes five bits per character. The RFC 4648 lowercase alphabet: `a`=0, `b`=1, …, `z`=25, `2`=26, `3`=27, `4`=28, `5`=29, `6`=30, `7`=31.

### Dag-cbor + SHA-256 + 32 (`01 71 12 20 …`)

```
byte layout   : 00000001 01110001 00010010 00100000 ....
bit stream    : 0000000101110001000100100010 0000 ....
split by 5    : 00000 00101 11000 10001 00100 01000 0000....
                  0     5    24    17     4     8
chars         :   a     f    y     r      e     i
string prefix : "b" + "afyrei…" = "bafyrei…"
```

So every record / MST node / commit CID in AT Protocol starts with **`bafyrei`**. The 8th character onward depends on the digest.

### Raw + SHA-256 + 32 (`01 55 12 20 …`)

```
byte layout   : 00000001 01010101 00010010 00100000 ....
bit stream    : 0000000101010101000100100010 0000 ....
split by 5    : 00000 00101 01010 10001 00100 01000 0000....
                  0     5    10    17     4     8
chars         :   a     f    k     r      e     i
string prefix : "b" + "afkrei…" = "bafkrei…"
```

So every blob CID in AT Protocol starts with **`bafkrei`**. The 8th character onward depends on the digest.

### Prefix sniff test

| First 7 chars   | Meaning                                    |
| --------------- | ------------------------------------------ |
| `bafyrei…`      | DASL dag-cbor record (valid)               |
| `bafkrei…`      | DASL raw blob (valid)                      |
| `Qm…`           | IPFS CIDv0 — **reject** (not DASL)         |
| `bafybei…` etc. | IPFS CIDv1 with non-DASL codec — **reject** (e.g. `dag-pb`) |
| `z…`, `f…`, `m…` | IPFS CIDv1 with non-base32lower multibase — **reject** |

For BDASL CIDs (BLAKE3 in place of SHA-256) the derivation changes because byte 2 becomes `0x1e` instead of `0x12`; work through the bits the same way to derive the fixed prefix characters for your deployment.

## 5. Base32 encoding / decoding mechanics

- Alphabet: `abcdefghijklmnopqrstuvwxyz234567` (32 chars).
- Each group of 5 input bits → 1 output character.
- 36 bytes = 288 bits → 288 / 5 = 57.6 → 58 characters (final character carries 2 unused trailing bits set to zero).
- No padding (`=`) even though RFC 4648 permits it — multibase base32lower is the **unpadded** variant.

Total string length for a DASL CID is therefore always:

```
1 (multibase prefix "b") + 58 (base32 chars) = 59 characters
```

If a candidate string is not exactly 59 characters long, something is wrong. That is a cheap length check to run before attempting a full base32 decode.

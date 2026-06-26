# Test Vectors for DASL / AT Protocol CIDs

The DASL CID spec itself provides no normative test vectors (see https://dasl.ing/cid.html). The vectors below are derived from the reference Rust implementation at `atproto-dasl/src/cid` and are suitable for cross-implementation fixtures. Reproduce them with your own implementation by following the procedure; if you disagree with a value, run the Rust tests to see which side is wrong.

## How to reproduce any vector

For any input byte sequence `D`:

1. Compute `H = SHA-256(D)`. (For BDASL, use `BLAKE3(D)` and substitute `0x1e` below.)
2. Assemble the 36-byte binary CID:
   - For dag-cbor content: `01 71 12 20 || H`
   - For raw content:      `01 55 12 20 || H`
3. String form: `"b" + base32lower(binary)`, unpadded.
4. DAG-CBOR form: `d8 2a 58 25 00 || binary` (tag 42 → byte string of 37 → identity prefix → binary).
5. JSON form: `{"$link": "<string form>"}`.

## Vector 1 — empty bytes, dag-cbor codec

Purpose: the simplest possible record CID (sha-256 of zero bytes).

| Field             | Value                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Input             | `b""` (zero bytes)                                                                          |
| SHA-256 digest    | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`                         |
| Binary CID (hex)  | `01 71 12 20 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`             |
| String form       | `bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku`                              |
| Binary length     | 36                                                                                           |
| String length     | 59                                                                                           |

Use this as a smoke test that your encoder rejects zero-length input in the caller where that is not meaningful (a record is never empty) but handles it deterministically where it is.

## Vector 2 — empty bytes, raw codec

Purpose: the same digest under the raw codec — shows the only bit that changes is byte 1 (codec).

| Field             | Value                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Input             | `b""` (zero bytes)                                                                          |
| SHA-256 digest    | `e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`                         |
| Binary CID (hex)  | `01 55 12 20 e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855`             |
| String form       | `bafkreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku`                              |

Vectors 1 and 2 differ only by the codec byte (`0x71` vs `0x55`) and the corresponding fourth string character (`y` vs `k`). The remaining 55 characters are identical because the digest is identical.

## Vector 3 — ASCII string, dag-cbor codec

Purpose: a non-trivial input that is easy to copy/paste into any language.

| Field             | Value                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Input             | `b"hello world"` (11 ASCII bytes)                                                           |
| SHA-256 digest    | `b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9`                         |
| Binary CID (hex)  | `01 71 12 20 b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9`             |
| String form       | `bafyreifzjut3te2nhyekklss27nh3k72ysco7y32koao5eei66wof36n5e`                              |

Use this to verify your `compute_cid(dag_cbor_bytes)` path end-to-end without involving a DAG-CBOR encoder: just feed the literal bytes `hello world` through your hashing pipeline.

## Vector 4 — ASCII string, raw codec

Purpose: a raw blob CID with a non-trivial, easy-to-reproduce input.

| Field             | Value                                                                                       |
| ----------------- | ------------------------------------------------------------------------------------------- |
| Input             | `b"raw content"` (11 ASCII bytes)                                                           |
| SHA-256 digest    | `a6e5d15bf571ca7a23fd704caad6c4c071210ba8d38ea0296dc58c3ce0a0e514`                         |
| Binary CID (hex)  | `01 55 12 20 a6e5d15bf571ca7a23fd704caad6c4c071210ba8d38ea0296dc58c3ce0a0e514`             |
| String form       | `bafkreifg4xivx5lrzj5ch7lqjsvnnrgaoeqqxkgtr2qcs3ofrq6obihfcq`                              |

## Vector 5 — rejection cases

Every one of these MUST be rejected by a conformant DASL CID parser:

| Input                                                        | Reason                                                           |
| ------------------------------------------------------------ | ---------------------------------------------------------------- |
| `"QmYwAPJzv5CZsnA625s3Xf2nemtYgPpHdWEz79ojWnPbdG"`           | CIDv0 (no multibase, legacy).                                    |
| `"zdj7WfN9c4GJ…"`                                            | CIDv1 but multibase is `z` (base58btc), not `b`.                 |
| `"BAFYREI…" `                                                | Uppercase `B` — multibase is case-sensitive; base32lower only.   |
| `"bafybeid7t3x7…"` (CIDv1 dag-pb codec `0x70`)               | Codec `0x70` is not in the DASL set.                             |
| 36-byte CID whose byte 0 is `0x00` instead of `0x01`         | CIDv0 or malformed.                                              |
| 36-byte CID whose byte 2 is `0x1e` in a DASL-only context    | BLAKE3 is BDASL, not DASL. Reject unless BDASL is explicitly on. |
| 36-byte CID whose byte 3 is `0x10` (16)                      | Wrong digest length.                                             |
| 35-byte total length                                         | Truncated digest.                                                |
| DAG-CBOR tag-42 byte string whose first inner byte is `0x01` | Missing identity multibase prefix `0x00`.                        |

## Vector 6 — DAG-CBOR wire round-trip

Purpose: confirm your CBOR encoder emits exactly the right bytes around a CID.

Input: any 36-byte binary CID, say `B`.

Expected CBOR encoding of a single-CID value:

```
d8 2a              ; tag(42)
58 25              ; bytes(37)
00                 ; identity multibase
<B>                ; 36 bytes
```

Total encoded length: 2 + 2 + 1 + 36 = 41 bytes.

Concrete example, using the binary CID from Vector 1 (empty-input dag-cbor):

```
d82a58250001711220e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

(41 bytes / 82 hex characters.) If your encoder produces any other byte sequence for this input — a different tag (`d8 2a`), a different length framing (`58 25`), a missing identity prefix (`00`), or a byte re-order — the output is non-conformant.

## Vector 7 — JSON round-trip

Purpose: confirm your JSON codec serializes and parses the `$link` form.

Serialization input: any `Cid` value `C`.

Expected JSON output:

```json
{"$link": "<C.to_string()>"}
```

Parse test: `{"$link": "bafyrei…"}` should parse to a valid CID; `"bafyrei…"` (a bare string) should NOT, and `{"cid": "bafyrei…"}` should NOT.

Concrete example, pairing with Vector 1:

```json
{"$link": "bafyreihdwdcefgh4dqkjv67uzcmw7ojee6xedzdetojuzjevtenxquvyku"}
```

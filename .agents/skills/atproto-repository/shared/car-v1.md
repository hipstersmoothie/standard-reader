# CAR v1 — Content Addressable aRchive (Reference)

Source of truth: https://dasl.ing/car.html (DASL's restatement of CAR v1, constrained for AT Protocol).

A CAR file is the on-the-wire container for one or more IPLD blocks — a header declaring the *roots* of interest, followed by a sequence of `(CID, bytes)` blocks in any order. AT Protocol's repo export, firehose commit events, and all sync endpoints frame their payloads as CAR v1.

CAR is transport, not semantics. The receiver still has to parse the blocks (commit → MST → records) once they're unpacked.

## 1. Byte layout in one picture

```
┌──────────────────────────────────────────────────────────────────────────┐
│  varint(header_len)                                                       │
├──────────────────────────────────────────────────────────────────────────┤
│  header: DAG-CBOR { version: 1, roots: [CID, …] }   (header_len bytes)    │
├──────────────────────────────────────────────────────────────────────────┤
│  varint(block_1_len)                                                      │
├──────────────────────────────────────────────────────────────────────────┤
│  block_1: cid_bytes_1 || data_bytes_1              (block_1_len bytes)    │
├──────────────────────────────────────────────────────────────────────────┤
│  varint(block_2_len)                                                      │
├──────────────────────────────────────────────────────────────────────────┤
│  block_2: cid_bytes_2 || data_bytes_2              (block_2_len bytes)    │
├──────────────────────────────────────────────────────────────────────────┤
│  …                                                                        │
└──────────────────────────────────────────────────────────────────────────┘
```

No magic number, no checksum, no footer. The file ends when the byte stream ends. A truncated CAR is detectable only by "the last varint claimed N bytes but we got M<N".

## 2. Varints

Every length in CAR v1 is an **unsigned LEB128 varint** — the same encoding used by Protocol Buffers.

- Each byte carries 7 bits of payload in the low 7 bits and a continuation bit in the high bit.
- The last byte of a varint has its high bit clear.
- The shortest-possible form is **not** strictly required by the spec, but every sane producer emits it, and lenient readers usually accept non-minimal varints silently.

Examples:

| Value     | Bytes (hex)         |
| --------- | ------------------- |
| `0`       | `00`                |
| `1`       | `01`                |
| `127`     | `7f`                |
| `128`     | `80 01`             |
| `255`     | `ff 01`             |
| `16384`   | `80 80 01`          |
| `2097151` | `ff ff 7f`          |

Cap it at 10 bytes (64-bit unsigned max) to avoid a malicious producer sending an infinite varint. The reference decoder rejects any varint that exceeds `u64::MAX`.

## 3. Header

The header is **DAG-CBOR-encoded**, so DRISL rules apply. Exactly these two keys are expected:

| Key       | Type    | Required | Value                                         |
| --------- | ------- | -------- | --------------------------------------------- |
| `roots`   | array   | yes      | One or more CIDs. Each CID is tag-42 wrapped. |
| `version` | integer | yes      | Exactly `1`.                                  |

Canonical key order (bytewise, DRISL) is `roots` then `version` — `r` (0x72) sorts before `v` (0x76).

Minimum header for a single-root AT Protocol repo:

```
a2                               ; map(2)
  65 72 6f 6f 74 73              ; "roots"
  81                             ; array(1)
    d8 2a                        ; tag 42
    58 25                        ; bytes(37)
      00                         ; identity multibase prefix
      01 71 12 20 <32 bytes>     ; dag-cbor CIDv1 + SHA-256 digest
  67 76 65 72 73 69 6f 6e        ; "version"
  01                             ; unsigned(1)
```

That's 58 bytes of header, framed by a leading varint `0x3a` (decimal 58). Breakdown: `a2` (1) + "roots" key (6) + `81` (1) + CID as tag-42 bytes (41) + "version" key (8) + `01` (1) = 58.

### What AT Protocol constrains

- **Exactly one root** in practice. The spec allows multiple, but the only root that matters for a repo CAR is the signed commit. Multi-root CARs show up in niche contexts (repo plus side-channel blobs) but never in repo exports.
- **`version` must be 1**. CAR v2 exists upstream but is not used anywhere in AT Protocol.
- **Roots must be present in the CAR body** — every root CID must correspond to a block later in the file. A CAR whose root isn't included is malformed.

## 4. Block

Each block after the header is:

```
varint(cid_len + data_len) || <CID bytes> || <data bytes>
```

The `data` portion is the raw, canonical DAG-CBOR encoding of the block value. The CID you read is the claim; the decoder is expected to re-hash `data` and check against the claimed CID.

### CID length inside a block

CAR v1 can in principle carry any IPLD codec. AT Protocol CAR files should contain **only** DASL CIDs:

- 37 raw bytes total when you see them inside DAG-CBOR (1-byte identity prefix + 36 bytes CID).
- But in the **CAR block framing**, there is **no identity multibase prefix** — the raw 36 bytes of the CID go into the block header directly. See `atproto-cid` for the byte layout; the short version is `01 71 12 20 <32-byte SHA-256 digest>` for dag-cbor blocks.

The reference Rust implementation reads the CID by:

1. Reading the multibase/version byte (`0x01`).
2. Reading the codec varint (`0x71` = dag-cbor, `0x55` = raw).
3. Reading the multihash header (`0x12 0x20` = SHA-256, 32 bytes).
4. Reading 32 bytes of digest.

Then the remainder of the block (up to `cid_len + data_len` total) is the payload.

### Codecs you'll see

| Codec byte | Codec    | When you'll see it                                       |
| ---------- | -------- | -------------------------------------------------------- |
| `0x71`     | dag-cbor | Every commit, every MST node, every record.              |
| `0x55`     | raw      | Blobs — images, video referenced from records.           |

A block whose CID codec is neither of those is invalid in an AT Protocol repo export.

## 5. CID verification on read

For every block the reader pulls out:

1. Decode the CID bytes → (codec, digest).
2. Compute `SHA-256(data_bytes)` → 32-byte digest.
3. Require that computed digest equals declared digest. Mismatch = `CidMismatch` error, whole CAR is suspect.
4. For dag-cbor blocks, additionally require that `data_bytes` round-trips through a DRISL-strict decoder cleanly. A block that decodes only in lenient mode is a corruption signal, not a silent success.

Skipping the verification step is the most common "my sync works but silently corrupts" bug. Don't.

## 6. Block ordering

Blocks may appear in **any order** in the file. The practical orderings are:

- **Root-first** (most common): commit block, then MST nodes in traversal order, then records. Makes streaming decoders happy — they can start validating the signed commit before the whole file is in memory.
- **Arbitrary**: the spec permits any order, including duplicates. A correct decoder deduplicates by CID (the second copy of the same CID must be byte-identical, otherwise the producer is broken).

Streaming decoders should buffer blocks into a block store keyed by CID, then walk the tree starting from the root. A one-pass decoder that requires topological order will break on legitimate CARs.

## 7. Streaming guidance

For large repos (a busy Bluesky account can exceed 1 GB), stream the CAR rather than buffering. Pseudocode:

```
read_varint() -> header_len
read_exact(header_len) -> header_bytes
header = dag_cbor.decode_strict(header_bytes)
require header.version == 1
require not header.roots.is_empty()

while not eof():
    read_varint() -> block_len
    start = cursor
    cid = read_cid()              # advances cursor
    data_len = block_len - (cursor - start)
    read_exact(data_len) -> data
    verify cid == dag_cbor_cid(data)   # or raw_cid for blobs
    store.put(cid, data)
```

After the loop, `store` has every block. You now do the tree walk (MST + commit) against the store.

### Backpressure

A producer (e.g. PDS `getRepo`) streams the CAR in chunks. Consumers should process blocks as they arrive and NOT wait for EOF before starting verification — for anything over a few MB, doing so is the difference between sub-second and tens-of-seconds-of-latency perceived by the user.

### Partial / incremental CARs

`com.atproto.sync.subscribeRepos` delivers event payloads whose CAR carries **only the changed blocks** since the previous commit, with the new commit as the root. The framing is identical to a full CAR; only the blocks included differ. A consumer maintaining a persistent block store MUSTN'T treat "block missing from this CAR" as an error — it's expected to be reused from the store.

## 8. Writing a CAR

To produce a CAR:

1. Compute the header bytes: `to_dag_cbor({version: 1, roots: [root_cid]})`.
2. Emit `varint(len(header_bytes)) || header_bytes`.
3. For each block you want to include, once:
   - Encode the CID as raw CID bytes (36 bytes for dag-cbor / raw DASL CIDs).
   - Emit `varint(len(cid_bytes) + len(data_bytes)) || cid_bytes || data_bytes`.
4. Flush. Done.

Two traps:

- **Don't include a CID twice.** Consumers tolerate it but producers shouldn't emit it — track a `HashSet<Cid>` while writing.
- **Don't include a block whose CID doesn't match its bytes.** That produces a CAR that fails verification on read but looks fine if you open it in a hex editor.

## 9. AT Protocol's CAR endpoints

| XRPC                                   | What the CAR contains                                               |
| -------------------------------------- | -------------------------------------------------------------------- |
| `com.atproto.sync.getRepo`             | Full repo: signed commit + all MST nodes + all records + blob CIDs. |
| `com.atproto.sync.getBlocks`           | Just the requested CIDs, in a CAR framed with the commit as root.   |
| `com.atproto.sync.getLatestCommit`     | Sometimes wrapped as a minimal CAR; sometimes a plain JSON response.|
| `com.atproto.sync.listBlobs`           | Not a CAR — a JSON cursor.                                          |
| `com.atproto.sync.subscribeRepos` (WS) | Each event payload is a tiny CAR with the new commit as root.       |

For firehose consumers, see the parallel spec material; the CAR rules are unchanged.

## 10. Reference implementation

In the `atproto-dasl` crate:

- `src/car/reader.rs` — `CarReader::new(reader)` produces a stream of `(Cid, Bytes)` pairs after parsing the header.
- `src/car/writer.rs` — `CarWriter::new(writer, roots)` accepts blocks via `.write_block(cid, data)` and handles framing.
- `src/car/varint.rs` — unsigned LEB128 varint codec.

Both reader and writer use `DrislStrict` by default for header encoding; the block payload is passed through opaquely because the CAR layer doesn't assume codec.

## 11. Common CAR errors

| Symptom                                          | Likely cause                                                  |
| ------------------------------------------------ | ------------------------------------------------------------- |
| `UnsupportedVersion`                             | Header says `version != 1`. Reject.                           |
| `InvalidHeader` / "roots missing"                | Header CBOR is not DRISL-strict or missing `roots`.           |
| `CidMismatch`                                    | Block payload's SHA-256 doesn't match the declared CID.       |
| Decoder hangs reading varint                     | Malicious or buggy producer emitting continuation bits forever; cap at 10 bytes. |
| "Reader ran out of bytes mid-block"              | Truncated CAR; the last varint overshoots available data.     |
| Duplicate CID appears with different payload     | Producer is broken. Reject, don't pick one.                   |
| Root CID has no matching block in the file       | Malformed CAR; every root must be present.                    |

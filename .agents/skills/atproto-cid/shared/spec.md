# DASL CID Specification (Reference)

Source of truth: https://dasl.ing/cid.html

This file restates the normative rules so implementers can work from a single document without leaving the skill. The paraphrase is lossless with respect to the spec's rejection conditions; if this file and https://dasl.ing/cid.html ever disagree, the upstream spec wins.

## 1. Version

A DASL CID is **CIDv1 only**. Parsing must reject any CID whose version byte is not `0x01`. Legacy CIDv0 CIDs are not accepted — there is no silent upgrade.

## 2. Codec (multicodec)

Exactly two codecs are permitted:

| Codec      | Hex    | Purpose                                   |
| ---------- | ------ | ----------------------------------------- |
| `raw`      | `0x55` | Opaque / unstructured content (blobs).    |
| `dag-cbor` | `0x71` | DRISL-conformant DAG-CBOR structures (records, commits, MST nodes). |

Any other codec — including `dag-pb` (`0x70`), `dag-json` (`0x0129`), `identity` (`0x00`), or anything else — must be rejected.

## 3. Hash function (multihash)

DASL permits **SHA-256 only**, with hash code `0x12`. Any other hash code must be rejected.

**BDASL extension.** The BDASL profile (used for large-file content) additionally permits BLAKE3 (`0x1e`). When a codec explicitly opts into BDASL it must accept both `0x12` and `0x1e`; otherwise only `0x12`.

## 4. Digest length

The digest is always exactly **32 bytes**. The multihash length byte must equal `0x20` (32). Any other length must be rejected, including a CID whose trailing bytes are shorter than the declared length.

## 5. String form (multibase)

The text representation of a DASL CID is:

```
b<base32lower(binary CID)>
```

- `b` is the multibase prefix indicating base32 with the lowercase alphabet (RFC 4648).
- The encoding is unpadded (no trailing `=`).
- No other multibase is accepted. Specifically, `z` (base58btc), `m` (base64), `f` (base16), and uppercase `B` are all rejected.

## 6. Binary form

The binary representation is the concatenation of:

```
0x01  || codec (1 byte, 0x55 or 0x71)
      || hash-code (1 byte, 0x12 [or 0x1e for BDASL])
      || digest-length (1 byte, 0x20)
      || digest (32 bytes)
```

Total length is always 36 bytes. No varint-encoded fields, no optional tags — the layout is fixed. Although multicodec and multihash codes are in principle varints, every code used in a DASL CID (`0x01`, `0x55`, `0x71`, `0x12`, `0x1e`, `0x20`) fits in a single byte, so no multi-byte varint decoding is ever required; implementers should not reach for a varint helper to parse DASL CIDs.

## 7. Validation order

Implementations should check in this order so error messages point at the first thing that is wrong:

1. String form: first character is `b`. If not, reject immediately.
2. Base32 decode succeeds and produces exactly 36 bytes.
3. Version byte = `0x01`.
4. Codec byte ∈ { `0x55`, `0x71` }.
5. Hash code byte = `0x12` (or `0x1e` if BDASL is enabled).
6. Digest length byte = `0x20`.
7. Digest is exactly 32 bytes.

Each rejection is a hard error. The spec explicitly forbids fallbacks, warnings, or "best-effort" acceptance.

## 8. Content addressing policy

The DASL project recommends **not** chunking content into a DAG or Merkle tree. Each resource is hashed as a whole and content-addressed directly. This removes canonicalization ambiguity introduced by recursive chunking strategies like UnixFS. AT Protocol follows this policy: record CIDs are computed over the whole canonical DAG-CBOR payload; blob CIDs are computed over the whole blob.

## 9. Relationship to multiformats / IPFS

Every DASL CID is a valid IPFS CIDv1, but the converse is not true. DASL removes:

- CIDv0 support.
- Multibases other than base32lower.
- Codecs other than raw and dag-cbor.
- Hash functions other than SHA-256 (DASL) and BLAKE3 (BDASL).
- Digest lengths other than 32 bytes.
- Chunked / UnixFS-style DAGs.

Interoperability goes one way: an AT Protocol service can always hand a DASL CID to an IPFS tool, but may receive IPFS CIDs that are not valid DASL and must reject them.

## 10. What this spec does *not* define

The DASL spec is deliberately narrow. It does **not** cover:

- A JSON encoding. AT Protocol defines `{"$link": "<cid string>"}` separately; see the SKILL body.
- The CBOR tag 42 wrapping used when a CID is embedded inside DAG-CBOR. That comes from the IPLD DAG-CBOR codec spec. See `binary-layout.md`.
- Block / link framing, CAR files, or signing. Those belong to adjacent specs.

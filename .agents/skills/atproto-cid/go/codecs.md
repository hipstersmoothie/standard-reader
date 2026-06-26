# Go — Codecs, Hash Codes, and BLAKE3

Go is the one ecosystem where codec constants are shipped directly off the base package. No hand-rolled tables, no per-codec imports for the numbers — just `cid.DagCBOR`, `cid.Raw`, and `mh.SHA2_256`.

## Shipped constants

```go
import (
    "github.com/ipfs/go-cid"
    mh "github.com/multiformats/go-multihash"
)

// cid package:
cid.Raw         // 0x55  — opaque binary blob
cid.DagCBOR     // 0x71  — structured CBOR record
cid.DagProtobuf // 0x70  — IPFS legacy, not DASL
cid.DagJSON     // 0x0129 — not DASL
cid.GitRaw      // 0x78  — not DASL

// multihash package:
mh.IDENTITY     // 0x00 — "digest is the input itself"; not DASL
mh.SHA2_256     // 0x12 — the DASL hash
mh.SHA2_512     // 0x13 — not DASL
mh.SHA3_256     // 0x17 — not DASL
mh.BLAKE3       // 0x1e — BDASL only
```

**Import these constants. Don't hand-write `0x71` in a call site** — use `cid.DagCBOR`. Hand-written hex numbers lose their semantic meaning and make code reviews slower.

The `cid` package exports a `cid.Codecs` map that lets you round-trip codec names (e.g., `"dag-cbor"` ↔ `0x71`). It's rarely the right tool — prefer the named constants directly.

## What DASL accepts

```
version:      cid.V1 (1)
codec:        cid.DagCBOR | cid.Raw
hash code:    mh.SHA2_256                 // plain DASL
            | mh.BLAKE3                   // BDASL extension only
digest length: 32
```

Anything else → the `daslcid.Assert` gate from `README.md` returns an error.

```go
opt := daslcid.Options{}               // strict DASL
opt = daslcid.Options{AllowBLAKE3: true} // DASL + BDASL

if err := daslcid.Assert(c, opt); err != nil {
    return err
}
```

The free-function form (not a method on `cid.Cid`) is deliberate — it keeps the strict profile composable across code paths without polluting the upstream type.

## Choosing the codec

Same question as every language: is the content a structured record or an opaque blob?

| Content                                  | Codec          | Why                                                  |
| ---------------------------------------- | -------------- | ---------------------------------------------------- |
| ATProto record (`$type: …`)              | `cid.DagCBOR`  | Structured data, canonically encoded as DAG-CBOR.    |
| MST node                                 | `cid.DagCBOR`  | MST nodes are maps of entries — canonical CBOR.      |
| Commit                                   | `cid.DagCBOR`  | Same — small structured record.                      |
| Image, video, arbitrary file             | `cid.Raw`      | Opaque; no canonical structural interpretation.      |
| CAR file                                 | N/A — CAR is a transport, not a block type. Its blocks are dag-cbor or raw individually. |

Never mix: an `app.bsky.feed.post` record whose CID has codec `cid.Raw` is malformed, even if the digest is correct. Assert the codec on parse.

## BLAKE3 (BDASL)

`go-multihash` ships `mh.BLAKE3 = 0x1e`. Recent versions register a BLAKE3 implementation by default; older ones do not. Check:

```go
// In a test or init sanity check:
_, err := mh.Sum([]byte("test"), mh.BLAKE3, 32)
if err != nil {
    // BLAKE3 not registered in this go-multihash version.
    // Upgrade rather than registering manually.
}
```

If you must support BLAKE3 with an older `go-multihash` (hard to avoid in some legacy modules), the registration is:

```go
import (
    mh "github.com/multiformats/go-multihash/core"
    blake3impl "lukechampine.com/blake3"
)

func init() {
    mh.Register(mh.BLAKE3, func() hash.Hash { return blake3impl.New(32, nil) })
}
```

`init`-time registration is global and racy — prefer upgrading `go-multihash` so the default registration picks BLAKE3 up.

Keep BLAKE3 scoped to blob contexts:

- **Plain DASL contexts reject BLAKE3.** Records, MST nodes, commits are always SHA-256. Do not emit `mh.BLAKE3` for these.
- **Blob contexts may emit BLAKE3** when the platform explicitly opts in. Pass `daslcid.Options{AllowBLAKE3: true}` at those specific gate calls.

## Hash code discipline

- `mh.SHA2_256` = `0x12`, digest length 32. Same digest length for BLAKE3 — the hash functions differ, the output size does not.
- `mh.SHA2_512` = `0x13` — reject.
- `mh.SHA3_256` = `0x17` — reject.
- `mh.IDENTITY` = `0x00` — the "digest is the input itself" case. Valid multihash in general IPLD but never DASL. Reject hard, regardless of length.

The `Assert` gate enforces all of this.

## Cross-language note

When porting codec constants between languages:

| Codec   | Hex    | Go                 | Rust                                | TypeScript                                 |
| ------- | ------ | ------------------ | ----------------------------------- | ------------------------------------------ |
| dag-cbor| 0x71   | `cid.DagCBOR`      | `atproto_dasl::cid::DAG_CBOR_CODEC` | `@ipld/dag-cbor` → `dagCbor.code`          |
| raw     | 0x55   | `cid.Raw`          | `atproto_dasl::cid::RAW_CODEC`      | `multiformats/codecs/raw` → `raw.code`     |
| dag-pb  | 0x70   | `cid.DagProtobuf`  | *(not shipped; reject)*             | `@ipld/dag-pb` → `dagPb.code` *(reject)*   |
| sha-256 | 0x12   | `mh.SHA2_256`      | `atproto_dasl::cid::SHA256_CODE`    | `multiformats/hashes/sha2` → `sha256.code` |
| blake3  | 0x1e   | `mh.BLAKE3`        | `atproto_dasl::cid::BLAKE3_CODE`    | *(third-party adapter)*                    |

The numeric values are the language-neutral reference — fixtures move across stacks by hex. See `../shared/divergence-matrix.md` §codec-constants.

## See also

- `../shared/spec.md` — the normative list of allowed values.
- `../shared/binary-layout.md` — how codec and hash bytes position in the 36-byte layout.
- `construction.md` — functions that use these constants.
- `parsing.md` — errors (sentinel values) returned when inputs fall outside them.

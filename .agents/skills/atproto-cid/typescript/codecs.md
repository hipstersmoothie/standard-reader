# TypeScript — Codecs, Hash Codes, and BLAKE3

TypeScript's `multiformats` package **does not ship a central registry** of codec constants. Codec codes live on the per-codec package, and you import them alongside the codec's encode/decode functions.

## Where the numbers live

```ts
import * as dagCbor from '@ipld/dag-cbor'         // dagCbor.code === 0x71
import * as raw from 'multiformats/codecs/raw'    // raw.code === 0x55
import * as dagJson from '@ipld/dag-json'         // 0x0129 — not DASL
import * as dagPb from '@ipld/dag-pb'             // 0x70 — not DASL, IPFS only
import { sha256 } from 'multiformats/hashes/sha2' // sha256.code === 0x12
```

Each codec module exposes `{ code, name, encode, decode }`. That's the object you pass as the `codec:` argument to `Block.encode` / `Block.decode`, or the `.code` you feed to `CID.createV1`. The number is never typed nominally — it's just a `number` — so your DASL gate is the only thing between a stray `0x70` and acceptance.

**Do not hand-write literals in call sites.** Use `dagCbor.code` / `raw.code`. If you find yourself writing `0x71` inline, import `dagCbor` instead.

## DASL-acceptable values (mirror Rust and Go)

```ts
const DAG_CBOR = 0x71 as const   // dagCbor.code
const RAW      = 0x55 as const   // raw.code
const SHA256   = 0x12 as const   // sha256.code
const BLAKE3   = 0x1e as const   // see "BLAKE3" below — not in multiformats core

const DASL_CODECS = new Set<number>([DAG_CBOR, RAW])
const DASL_HASHES = new Set<number>([SHA256])
const BDASL_HASHES = new Set<number>([SHA256, BLAKE3])
```

These live next to the `assertDasl` gate from `README.md`. Inline them there, not in every consumer.

## Choosing the codec

Same rules as every language:

| Content                   | Codec       | Why                                                 |
| ------------------------- | ----------- | --------------------------------------------------- |
| ATProto record            | `dagCbor`   | Structured data, DRISL-canonical CBOR.              |
| MST node                  | `dagCbor`   | Map of entries, canonical CBOR.                     |
| Commit                    | `dagCbor`   | Small structured record.                            |
| Image, video, attachment  | `raw`       | Opaque bytes, no structural interpretation.         |

A record's CID must have codec `dag-cbor`. A blob's CID must have codec `raw`. A `raw` CID on a structured-record field is malformed even if the digest is correct.

## Canonical DAG-CBOR encoder

`@ipld/dag-cbor` is DRISL-compliant: keys sorted bytewise, integers in shortest form, no indefinite-length items, tag 42 for CIDs. **Do not substitute `cbor-x`, `cbor`, or `borc`** — they emit non-canonical output and your CIDs will not match the AT Protocol reference implementations.

```ts
import * as dagCbor from '@ipld/dag-cbor'

const bytes = dagCbor.encode({ b: 2, a: 1 })
// bytes starts with a2 (map, 2 pairs) 61 61 01 61 62 02
// keys sorted to "a" before "b" regardless of insertion order
```

If you need to double-check a record against ground truth, call `lexicon-garden`'s `create_record_cid`.

## BLAKE3 (BDASL)

`multiformats` does **not** ship a BLAKE3 hasher. To emit BDASL CIDs from TypeScript you bring a third-party BLAKE3:

```ts
import { blake3 } from '@noble/hashes/blake3'       // one option — synchronous
import { from } from 'multiformats/hashes/hasher'

const blake3Hasher = from({
  name: 'blake3',
  code: 0x1e,
  encode: (input: Uint8Array) => blake3(input, { dkLen: 32 }),
})

// Use with Block.encode:
const block = await Block.encode({ value, codec: dagCbor, hasher: blake3Hasher })
```

`from()` adapts any sync or async byte-in/byte-out function into a `MultihashHasher`. Keep BLAKE3 scoped to blob contexts: records, MST nodes, and commits are always SHA-256 even in a BDASL-enabled platform.

Parsing a BLAKE3 CID does not require the hasher to be registered — `CID.parse` / `CID.decode` do not verify; they only read structure. The hasher is needed only when you are *computing* a CID from bytes, or when you are *verifying* one (re-hashing the content and comparing).

## Hash code discipline

- `sha256.code` = `0x12`, digest length 32.
- BLAKE3 = `0x1e`, digest length 32 (same size, different function).
- `0x13` (SHA-512), `0x17` (SHA3-256), `0x00` (identity) — all must be rejected by `assertDasl`.
- Do not trust a 32-byte digest alone; many hash codes produce 32 bytes. Match the `code` explicitly.

## Multibase constants

The multibase layer governs *string* output, not binary. Import only when you need to decode a non-default prefix:

```ts
import { base32 } from 'multiformats/bases/base32'
import { base58btc } from 'multiformats/bases/base58'
import { base64 } from 'multiformats/bases/base64'
```

For DASL output you need none of these — `cid.toString()` defaults to base32lower (`b…`) for v1. For DASL input, `CID.parse(str)` recognizes the `b` prefix automatically. Import a base decoder only when you must parse a producer that sends non-default prefixes (and then reject them via the gate anyway).

## Cross-language note

Codec constants are only shipped as named values in **Go** (`cid.DagCBOR`, `cid.Raw`, `cid.DagPB`). In **Rust**, `atproto-dasl` ships constants; otherwise you hand-write. In **TypeScript**, each codec package provides its own `.code`. When porting a fixture, the numeric values are the language-neutral reference:

| Codec   | Hex    | Import (TS)                               | Import (Rust)                       | Import (Go)       |
| ------- | ------ | ----------------------------------------- | ----------------------------------- | ----------------- |
| dag-cbor| 0x71   | `@ipld/dag-cbor` → `dagCbor.code`         | `atproto_dasl::cid::DAG_CBOR_CODEC` | `cid.DagCBOR`     |
| raw     | 0x55   | `multiformats/codecs/raw` → `raw.code`    | `atproto_dasl::cid::RAW_CODEC`      | `cid.Raw`         |
| dag-pb  | 0x70   | `@ipld/dag-pb` → `dagPb.code` *(reject)*  | *(not shipped)*                     | `cid.DagProtobuf` |
| sha-256 | 0x12   | `multiformats/hashes/sha2` → `sha256.code`| `atproto_dasl::cid::SHA256_CODE`    | `multihash.SHA2_256` |
| blake3  | 0x1e   | *(third-party adapter)*                   | `atproto_dasl::cid::BLAKE3_CODE`    | `multihash.BLAKE3` |

See `../shared/divergence-matrix.md` §codec-constants for the full table.

## See also

- `../shared/spec.md` — the normative list of allowed codecs and hashes.
- `../shared/binary-layout.md` — where the codec byte sits in the 36-byte layout.
- `construction.md` — async CID creation using these codecs.
- `parsing.md` — error surfaces when inputs fall outside the allowed set.

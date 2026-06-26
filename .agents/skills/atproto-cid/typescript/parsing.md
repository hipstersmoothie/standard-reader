# TypeScript — Parsing a CID

Always pair `CID.parse` / `CID.decode` with the `assertDasl` gate from `README.md`. The bare parse accepts non-DASL inputs (CIDv0, dag-pb, wrong hash) — the gate narrows the type to `DaslCid`.

## From a string

```ts
import { CID } from 'multiformats/cid'
import { assertDasl } from './dasl-gate'

const s = 'bafyreihunttf7a3uvtzrgbnyu2rzv24w4zx7xjwqgk4x5w7n5yvq7u7aua'
const cid = CID.parse(s)                       // CID (may be v0 or non-DASL)
assertDasl(cid)                                // narrows to DaslCid
// cid.version === 1, cid.code ∈ {0x71, 0x55}, cid.multihash.code === 0x12, .size === 32
```

`CID.parse` sniffs the multibase prefix: `b` → base32lower (DASL default), `z` → base58btc (CIDv0), `m` → base64, etc. For DASL CIDs you never want to accept `z` / `m` / `f` — `assertDasl` rejects them implicitly because CIDv0 fails the `version !== 1` check.

### Parsing non-base32 multibase

If a producer you don't control sends `zQm…` (base58btc), `CID.parse` needs an explicit base decoder:

```ts
import { base58btc } from 'multiformats/bases/base58'
const cid = CID.parse('zQm…', base58btc)
// assertDasl will still reject — CIDv0 is not DASL.
```

For DASL-only ingestion, skip the explicit decoder and let `CID.parse` fail on anything other than `b…`.

## From 36 raw bytes (CAR block frame)

```ts
import { CID } from 'multiformats/cid'
import { assertDasl } from './dasl-gate'

const bytes: Uint8Array = readExact(reader, 36)
const cid = CID.decode(bytes)                 // strict — rejects trailing bytes
assertDasl(cid)
```

`CID.decode` expects the CID bytes exactly. If there is trailing data, use `CID.decodeFirst` instead:

```ts
const [cid, remainder] = CID.decodeFirst(buffer)
assertDasl(cid)
// remainder: Uint8Array — bytes after the CID
```

`decodeFirst` is the right tool for CAR block framing where the block-length varint tells you the CID + data total length but the CID byte count is only known after parsing. You read once, consume the CID, and the remainder is the payload.

## From a DAG-CBOR byte string (tag 42)

`@ipld/dag-cbor` handles CID unwrapping automatically during decode:

```ts
import * as dagCbor from '@ipld/dag-cbor'
import { CID } from 'multiformats/cid'
import { assertDasl } from './dasl-gate'

type MstEntry = { p: number; k: Uint8Array; v: CID; t?: CID }

const node = dagCbor.decode<{ e: MstEntry[]; l?: CID }>(cborBytes)

for (const entry of node.e) {
  assertDasl(entry.v)
  if (entry.t) assertDasl(entry.t)
}
```

Inside `dagCbor.decode`, any CBOR tag-42 byte string becomes a `CID` object. The identity multibase prefix is stripped for you. Hand-decoding CBOR and hunting for tag 42 manually is almost never the right move — use `dagCbor.decode`.

If you must hand-decode (debugging a malformed payload), `multiformats` does not expose a public CID-from-tag-42 helper. Extract the 37-byte tag-42 byte string, drop the first byte (the `0x00` identity prefix), and pass the remaining 36 bytes to `CID.decode`.

## From a JSON `$link`

AT Protocol's JSON convention is `{"$link": "bafyrei…"}`. `multiformats` does not know about `$link` directly — `JSON.parse` gives you a string, and you feed that to `CID.parse`:

```ts
type BlobRef = {
  $type: 'blob'
  ref: { $link: string }
  mimeType: string
  size: number
}

const decoded: BlobRef = JSON.parse(responseBody)
const cid = CID.parse(decoded.ref.$link)
assertDasl(cid)
```

When *emitting* JSON, mirror the convention: `{ $link: cid.toString() }`. Never emit a bare string for a CID field — the DAG-JSON convention is `{"/": "…"}` but **AT Protocol uses `$link`**, not `/`.

If the producer handed you a bare string instead of `{"$link": "…"}`, treat it as malformed and reject. Silent promotion breaks canonicalization downstream.

## Streaming / incremental

For CAR parsing, consume bytes in chunks and hand them to `CID.decodeFirst`:

```ts
import { CID } from 'multiformats/cid'

async function* parseBlocks(reader: AsyncIterable<Uint8Array>) {
  let buf = new Uint8Array(0)
  for await (const chunk of reader) {
    buf = concat(buf, chunk)
    // ... read varint length, slice block ...
    const [cid, payload] = CID.decodeFirst(block)
    yield { cid, payload }
  }
}
```

You own the block-length framing; `CID.decodeFirst` handles the CID-vs-data split inside one framed block. No built-in "read a CID from a Node.js `Readable`" — you'd pull bytes as needed and call `decodeFirst` when enough are buffered.

## Error handling

`multiformats` throws plain `Error` / `TypeError` with string messages. There is no typed error enum. Practical pattern:

```ts
try {
  const cid = CID.parse(input)
  assertDasl(cid)
  return cid
} catch (err) {
  if (err instanceof TypeError && err.message.includes('Unknown multihash code')) {
    throw new BadCidError('unsupported hash function', { cause: err })
  }
  throw new BadCidError(`invalid CID: ${input}`, { cause: err })
}
```

Wrap in a typed error class for your caller's sake. The upstream `.message` strings are not stable across `multiformats` versions; do not string-match them in long-lived production code if you can avoid it.

## Validation vs verification

Parsing confirms *shape*. To confirm *content*:

```ts
import { sha256 } from 'multiformats/hashes/sha2'
import { CID } from 'multiformats/cid'

async function verifyCid(cid: CID, data: Uint8Array): Promise<boolean> {
  const hash = await sha256.digest(data)                    // async
  const expected = CID.createV1(cid.code, hash)
  return cid.equals(expected)
}
```

The `await` on `sha256.digest` is unavoidable — see `construction.md`. Use `cid.equals(other)`, never string or `===` comparison.

## Common parse failures

| Symptom | Cause |
| --- | --- |
| `TypeError: Unsupported codec: 0x70` | dag-pb CID; not DASL. |
| `TypeError: Unknown multihash code: 0x13` | SHA-512 or similar. |
| `RangeError` on `CID.decode` | Buffer is not exactly a CID — use `CID.decodeFirst` for framed inputs. |
| `Error: Unexpected end of data` | Truncated bytes; the 4-byte header is incomplete. |
| `assertDasl` throws "CID version 0 not allowed" | Input is `Qm…` CIDv0. Reject, don't try `cid.toV1()` — the lossless upgrade would give you dag-pb codec, still not DASL. |

## See also

- `construction.md` — building CIDs, all async.
- `codecs.md` — per-codec package imports.
- `../shared/spec.md` — rules the gate enforces.
- `../shared/divergence-matrix.md` — why the DASL gate exists only in TypeScript/Go but not Rust.

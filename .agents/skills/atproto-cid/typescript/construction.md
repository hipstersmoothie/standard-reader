# TypeScript — Constructing a CID (async)

Every construction path in this file is `async` because `sha256.digest` returns a `Promise`. Do not try to hide this — the propagation is structural, not cosmetic.

## 1. DAG-CBOR record → CID

Use `multiformats/block` — it wraps encode + hash + CID creation into one async call.

```ts
import * as Block from 'multiformats/block'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from 'multiformats/hashes/sha2'
import { assertDasl } from './dasl-gate'

const block = await Block.encode({
  value: { $type: 'app.bsky.actor.profile', displayName: 'Alice' },
  codec: dagCbor,
  hasher: sha256,
})

assertDasl(block.cid)
// block.cid    : CID (DaslCid after assert)
// block.bytes  : Uint8Array — canonical DRISL CBOR
// block.value  : the original value
```

The three pieces (`cid`, `bytes`, `value`) are what you want for most AT Protocol flows — you almost always need both the CID and the encoded bytes (for CAR framing, for storage, for re-emission).

## 2. Pre-encoded DAG-CBOR bytes → CID

If you already have DRISL-canonical bytes (received from the wire, already-encoded record), hash them directly:

```ts
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagCbor from '@ipld/dag-cbor'
import { assertDasl } from './dasl-gate'

const bytes: Uint8Array = /* canonical CBOR */
const digest = await sha256.digest(bytes)
const cid = CID.createV1(dagCbor.code, digest)    // 0x71
assertDasl(cid)
```

`CID.createV1` is synchronous; the hashing step is the only async surface.

## 3. Raw blob → CID

For opaque binary content (images, video, arbitrary attachments):

```ts
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as raw from 'multiformats/codecs/raw'
import { assertDasl } from './dasl-gate'

const blob: Uint8Array = await file.arrayBuffer().then(b => new Uint8Array(b))
const digest = await sha256.digest(blob)
const cid = CID.createV1(raw.code, digest)       // 0x55
assertDasl(cid)
```

Or use `Block.encode` with `codec: raw`:

```ts
const block = await Block.encode({ value: blob, codec: raw, hasher: sha256 })
```

For raw bytes, `block.value` is the bytes themselves; the round-trip is a no-op.

## 4. Assemble manually from (codec, digest)

Rare — most commonly when you have a pre-computed SHA-256 from a trusted source:

```ts
import { CID } from 'multiformats/cid'
import { create as createMultihash } from 'multiformats/hashes/digest'

const digestBytes = new Uint8Array(32) // pre-computed SHA-256
const mh = createMultihash(0x12, digestBytes)     // wrap as multihash, sync
const cid = CID.createV1(0x71, mh)
```

`createMultihash` is synchronous — it wraps existing bytes, does not hash. Reach for this path only when you have a strong reason not to re-hash (trusted upstream, deterministic fixture).

## Why async propagates

`sha256.digest` in `multiformats/hashes/sha2` delegates to the platform's SubtleCrypto:

- In the browser: `crypto.subtle.digest('SHA-256', bytes)` — returns a `Promise`.
- In Node 20+: `crypto.subtle` mirrors the Web API, also returns a `Promise`.

A "synchronous SHA-256" exists in Node (`crypto.createHash('sha256').update(bytes).digest()`), but using it defeats the point of `multiformats`'s platform-isomorphic design and breaks browser targets. Accept the `await`.

A few caller-side consequences:

- **Your "compute record CID" helper is async.** So every caller becomes async.
- **Hot paths can batch.** `Promise.all(chunks.map(c => sha256.digest(c)))` parallelises hashing across cores (in Node) or uses the event loop efficiently (in browsers).
- **Synchronous caches still work.** Once you have the `Promise<CID>`, you can memoize. Cache keys by the input bytes (or a fingerprint thereof), not by async identity.

## JSON `$link` emission

When emitting AT Protocol JSON, wrap the CID string yourself:

```ts
type BlobRef = {
  $type: 'blob'
  ref: { $link: string }
  mimeType: string
  size: number
}

const ref: BlobRef = {
  $type: 'blob',
  ref: { $link: cid.toString() },             // base32lower, b-prefixed
  mimeType: 'image/png',
  size: bytes.byteLength,
}
```

`cid.toString()` defaults to base32lower for v1 — exactly the DASL form. No extra configuration needed.

## Round-trip test

This should hold regardless of path:

```ts
const value = { $type: 'app.bsky.feed.post', text: 'hi' }
const block = await Block.encode({ value, codec: dagCbor, hasher: sha256 })
const redecoded = dagCbor.decode(block.bytes)
const rebuilt = await Block.encode({ value: redecoded, codec: dagCbor, hasher: sha256 })
if (!block.cid.equals(rebuilt.cid)) throw new Error('encoder is non-canonical')
```

Failure means either `@ipld/dag-cbor` was replaced by a non-canonical encoder, or the value contained a non-deterministic field (e.g., a `Map` with insertion-order keys). DRISL sorts map keys regardless, so this should only fail if the CBOR library itself was swapped.

## Common construction mistakes

| Symptom | Cause |
| --- | --- |
| `cid.bytes is not a function` | `.bytes` is a **property**, not a method. Write `cid.bytes`, not `cid.bytes()`. |
| "Same record produces different CIDs on two machines" | You used `JSON.stringify` + `TextEncoder.encode` as a CBOR replacement. Not canonical, not CBOR. Use `dagCbor.encode`. |
| "Await is not allowed here" | Caller is sync. Make it async, or handle the `Promise<CID>` with `.then` — do not downgrade to synchronous hashing. |
| CID round-trips but doesn't match Rust / Go output | Your CBOR input had `undefined` values (DAG-CBOR disallows), or a `Map` with unordered keys, or bigints encoded as strings. Match the canonical form exactly. |
| `Block.encode` accepts a value but the CID doesn't match your server | The value's field order is fine (DRISL sorts), but any `Date` / `BigInt` / function was silently dropped or coerced. DAG-CBOR supports: string, number, boolean, null, Uint8Array, Array, Map, plain objects, and CIDs (tag 42). Nothing else. |

## See also

- `parsing.md` — the reverse direction.
- `codecs.md` — where `dagCbor.code` and `raw.code` come from.
- `../shared/binary-layout.md` — the 36-byte layout `CID.createV1` is producing.
- `../shared/test-vectors.md` — expected CIDs for given inputs.
- `../shared/divergence-matrix.md` — why async propagation is TypeScript-specific.

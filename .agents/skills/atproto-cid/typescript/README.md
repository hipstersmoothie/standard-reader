# TypeScript (multiformats / @ipld/dag-cbor)

The TypeScript ecosystem for CIDs is the [`multiformats`](https://www.npmjs.com/package/multiformats) package — the reference IPLD library that Bluesky's own `@atproto/*` packages depend on transitively. For DAG-CBOR encoding/decoding, pair it with [`@ipld/dag-cbor`](https://www.npmjs.com/package/@ipld/dag-cbor).

Unlike Rust's `atproto-dasl`, there is **no shipped DASL-strict wrapper** in TypeScript. DASL validation is always a caller-owned gate on top of the permissive `multiformats` CID.

## Dependencies

```bash
npm install multiformats @ipld/dag-cbor
```

Both packages are ESM-only. Set `"type": "module"` in `package.json` (or use a bundler that handles ESM — Vite, esbuild, modern Webpack). If you are stuck on CommonJS, import via dynamic `import()` or pin to older versions (not recommended — the old multiformats 9.x API is different).

TypeScript tsconfig hints:

```json
{
  "compilerOptions": {
    "module": "Node16",
    "moduleResolution": "Node16",
    "target": "ES2022",
    "strict": true
  }
}
```

`ES2022` gives you `Uint8Array`'s methods out of the box and avoids polyfill surface for `crypto.subtle`.

## Core imports

```ts
import { CID } from 'multiformats/cid'
import { sha256 } from 'multiformats/hashes/sha2'
import * as dagCbor from '@ipld/dag-cbor'
import * as raw from 'multiformats/codecs/raw'
```

That is the full surface you need for DASL CIDs. No `multiformats/bases/base32` import needed — base32lower is the default for v1 string output and for parsing `b…` prefixes.

## The DASL gate — your validator

Because `multiformats` accepts any valid multiformats CID, you need a tiny gate function:

```ts
import { CID } from 'multiformats/cid'

export type DaslCid = CID & { readonly __dasl: true }

const DAG_CBOR = 0x71 as const
const RAW      = 0x55 as const
const SHA256   = 0x12 as const
const BLAKE3   = 0x1e as const

export function assertDasl(cid: CID, { allowBlake3 = false } = {}): asserts cid is DaslCid {
  if (cid.version !== 1) throw new TypeError(`CID version ${cid.version} not allowed (DASL requires v1)`)
  if (cid.code !== DAG_CBOR && cid.code !== RAW) {
    throw new TypeError(`Codec 0x${cid.code.toString(16)} not allowed (expected dag-cbor or raw)`)
  }
  const hashCode = cid.multihash.code
  const hashOk = hashCode === SHA256 || (allowBlake3 && hashCode === BLAKE3)
  if (!hashOk) throw new TypeError(`Hash 0x${hashCode.toString(16)} not allowed (expected SHA-256${allowBlake3 ? ' or BLAKE3' : ''})`)
  if (cid.multihash.size !== 32) throw new TypeError(`Digest length ${cid.multihash.size} not 32`)
}
```

Call `assertDasl(cid)` immediately after every `CID.parse` / `CID.decode` / `CID.asCID` on CIDs from untrusted sources. The branded `DaslCid` type propagates the guarantee through your codebase so internal functions can take `DaslCid` instead of `CID` and trust the shape.

This is the single most important adapter to write in a TypeScript codebase. Copy-paste it; test it against the fixtures in `../shared/test-vectors.md`.

## Block helpers — the ergonomic option

`multiformats/block` wraps hashing + encoding + CID creation into a single async call:

```ts
import * as Block from 'multiformats/block'
import * as dagCbor from '@ipld/dag-cbor'
import { sha256 } from 'multiformats/hashes/sha2'

const block = await Block.encode({
  value: { $type: 'app.bsky.actor.profile', displayName: 'Alice' },
  codec: dagCbor,
  hasher: sha256,
})
// block.cid        → CID (validate with assertDasl)
// block.bytes      → Uint8Array (canonical CBOR)
// block.value      → original value, round-tripped
```

Use `Block.encode` for the "record → CID + bytes" flow and `Block.decode` for the reverse. It is a thin wrapper but handles the three-step dance (encode, hash, assemble CID) you would otherwise write inline. See `construction.md` for when to use it vs raw `CID.createV1`.

## Canonical encoding

`@ipld/dag-cbor`'s `encode(value)` is DRISL-compliant: keys sorted bytewise, integers shortest form, no indefinite-length items, tag 42 for CIDs. Do **not** use the general-purpose `cbor-x`, `cbor`, or `borc` packages — they emit non-canonical output and your CIDs will not match other AT Protocol implementations.

```ts
import * as dagCbor from '@ipld/dag-cbor'

const bytes: Uint8Array = dagCbor.encode({ b: 2, a: 1 })
// → a2 61 61 01 61 62 02 (keys sorted to a, b — not b, a)
```

If you need to double-check a record against the reference implementation, call the `lexicon-garden` MCP tool's `create_record_cid` — that's ground truth.

## Async is unavoidable

`sha256.digest(bytes)` returns a `Promise<MultihashDigest>` because it delegates to `crypto.subtle.digest` under the hood. Every function that builds a CID from bytes ends up `async`. See `construction.md` for the propagation pattern and why a synchronous shim is a bad idea.

## Idioms TypeScript engineers expect

- **Errors are thrown, not returned.** The `assertDasl` example throws `TypeError`. Your codebase might wrap these in a typed `Result<T, E>` or `neverthrow`-style abstraction — the pattern is yours to choose, but the underlying multiformats API throws.
- **CIDs are compared with `cid.equals(other)`** — not `===` (object identity) and not `cid.toString() === other.toString()` (string comparison is fragile if the string forms drift). `cid.equals` compares the binary bytes.
- **`cid.bytes` is a property**, not a method. Reading `cid.bytes()` is a runtime error (`cid.bytes is not a function`).
- **String parsing is synchronous.** Only the hashing path is async. `CID.parse(str)` and `CID.decode(bytes)` are synchronous; you can call them at module load time.
- **`JSON.stringify(cid)` emits a string with `{"/": "bafyrei…"}` shape** — that is the dag-json convention, *not* AT Protocol's `{"$link": "…"}`. For AT Protocol JSON, serialize CIDs manually or via [`@ipld/dag-json`](https://www.npmjs.com/package/@ipld/dag-json) with a post-process rename. Reference implementations typically hand-roll: `{ $link: cid.toString() }`.

## Next

- Parsing paths → `parsing.md`
- Construction (async) → `construction.md`
- Codec constants and per-codec imports → `codecs.md`
- Cross-language differences → `../shared/divergence-matrix.md`

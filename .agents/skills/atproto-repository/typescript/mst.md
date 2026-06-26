# TypeScript — `MST` class (immutable Merkle Search Tree)

The TS `MST` is **immutable**: every mutation (`add`, `update`, `delete`) returns a **new** `MST` with `outdatedPointer = true`; the old value is still valid and still reflects its pre-mutation state. This is the biggest deviation from Rust (mutable in place, fed to a `BlockStorage`) and Go (mutable `Tree` with a `Root *Node` pointer).

Source: `packages/repo/src/mst/mst.ts`.

## Node shape on the wire

```typescript
type NodeData = {
  l: Cid | null            // left-most subtree pointer
  e: TreeEntry[]           // entries
}

type TreeEntry = {
  p: number                // prefix length shared with previous key
  k: Uint8Array            // rest of key (ASCII bytes after the prefix)
  v: Cid                   // leaf value CID
  t: Cid | null            // right subtree pointer for this leaf
}
```

The schemas live as zod types in `mst.ts:50-56`. Field names (`l`, `e`, `p`, `k`, `v`, `t`) match Rust and Go — the wire format is identical across implementations.

Each `TreeEntry` carries a leaf *and* the subtree to its right. The leftmost subtree is the top-level `l` field. Prefix compression: `key = lastKey.slice(0, p) + asciiDecode(k)`.

## In-memory types

```typescript
type NodeEntry = MST | Leaf

class Leaf {
  key: string      // collection/rkey, e.g. "app.bsky.feed.post/3k2..."
  value: Cid
  isTree(): this is MST
  isLeaf(): this is Leaf
}

class MST {
  storage: ReadableBlockstore
  pointer: Cid               // may be outdated after mutation
  entries: NodeEntry[] | null // null if lazily loaded
  layer: number | null
  outdatedPointer: boolean
}
```

An `MST` is either loaded (entries in memory) or lazy (`entries === null`, `pointer` valid). `getEntries()` resolves lazy by reading the node block from `storage` and deserializing.

## Construction

```typescript
// Empty tree in a fresh storage.
const tree = await MST.create(storage)

// Tree pointing at an existing CID (lazy — no storage read).
const tree = MST.load(storage, rootCid)

// Tree with entries already known.
const tree = await MST.fromData(storage, nodeData)
```

`MST.create` computes the CID for an empty entry list. `MST.load` is the usual entry point for verification — it defers the storage read until the first traversal.

## Read API — all async

```typescript
async get(key: string): Promise<Cid | null>
async getEntries(): Promise<NodeEntry[]>
async getPointer(): Promise<Cid>                  // re-serializes if pointer is outdated
async getLayer(): Promise<number>

async *walk(): AsyncIterable<NodeEntry>            // depth-first
async *walkFrom(key: string): AsyncIterable<NodeEntry>
async *walkLeavesFrom(key: string): AsyncIterable<Leaf>
async leaves(): Promise<Leaf[]>
async leafCount(): Promise<number>
async list(count?, after?, before?): Promise<Leaf[]>
async listWithPrefix(prefix: string, count?): Promise<Leaf[]>

async serialize(): Promise<{ cid: Cid; bytes: Uint8Array }>
async getUnstoredBlocks(): Promise<{ root: Cid; blocks: BlockMap }>
async cidsForPath(key: string): Promise<Cid[]>
async getCoveringProof(key: string): Promise<BlockMap>
```

Everything is async because MST entries may not be loaded yet — any traversal might hit storage. `get(key)` returns `null` if the key doesn't exist, a `Cid` if it does.

## Write API — immutable

```typescript
async add(key: string, value: Cid, knownZeros?: number): Promise<MST>  // throws if key exists
async update(key: string, value: Cid): Promise<MST>                    // throws if key absent
async delete(key: string): Promise<MST>                                // throws if key absent
```

Each returns a **new** `MST` instance. The `outdatedPointer` flag is set to `true`; `getPointer()` / `serialize()` will re-hash on demand.

Usage:

```typescript
let tree = await MST.create(storage)
tree = await tree.add('app.bsky.feed.post/abc', recordCid1)
tree = await tree.add('app.bsky.feed.post/xyz', recordCid2)
tree = await tree.update('app.bsky.feed.post/abc', recordCid3)
// At this point `tree` reflects 2 entries. The earlier tree values are also still valid.
const rootCid = await tree.getPointer()
```

`add`'s `knownZeros` parameter lets you skip re-hashing the key to determine its layer when you already know it (the internal recursion uses this).

## Key format and validation

Keys are `${collection}/${rkey}` strings. Enforced by `ensureValidMstKey`:

```typescript
// Total length ≤ 1024 chars
// Exactly two segments separated by '/'
// Each segment non-empty
// Characters matching /^[a-zA-Z0-9_~\-:.]*$/
```

Source: `mst/util.ts`. `InvalidMstKeyError` is thrown on violation.

Go and Rust enforce `MAX_KEY_BYTES = 1024` but don't enforce the two-segment structure at the MST layer. TS is stricter — it rejects any key that isn't `<collection>/<rkey>` shape.

## Height (layer) computation

```typescript
export const leadingZerosOnHash = async (key: string | Uint8Array) => {
  const hash = await sha256(key)
  let leadingZeros = 0
  for (let i = 0; i < hash.length; i++) {
    const byte = hash[i]
    if (byte < 64) leadingZeros++
    if (byte < 16) leadingZeros++
    if (byte < 4) leadingZeros++
    if (byte === 0) { leadingZeros++ } else { break }
  }
  return leadingZeros
}
```

Source: `mst/util.ts:24`. Counts leading **pairs of zero bits** in the sha-256 hash — fanout 4, matching Rust and Go (despite Go's misleading `// fanout: 16` comment). The key is hashed as **ASCII bytes of the string**, not UTF-8 — this matters only for keys with non-ASCII characters, which are rejected by `ensureValidMstKey` anyway.

## Diff API

```typescript
import { DataDiff } from '@atproto/repo'

const diff = await DataDiff.of(newerTree, olderTree)
// Or: await DataDiff.of(newerTree, null) — diff against an empty tree (used for full-repo verification).

diff.addList()      // { key, cid }[]
diff.updateList()   // { key, cid, prev }[]
diff.deleteList()   // { key, cid }[]
diff.newMstBlocks   // BlockMap — new MST node blocks produced by this diff
diff.newLeafCids    // CidSet — new leaf (record) CIDs referenced but not computed
diff.removedCids    // CidSet — MST nodes and leaves removed
```

`DataDiff` walks both trees in parallel and emits the minimum set of changes. The `newMstBlocks` is what gets written into the CAR for a delta export; `newLeafCids` tells you which record blocks still need to be included.

Source: `packages/repo/src/data-diff.ts`.

## Serialization

```typescript
const { cid, bytes } = await tree.serialize()
// Equivalent: await cidForLex(data), where data = { l, e: [...] }
```

`serialize()` calls `getEntries()`, refreshes any outdated subtree pointers, builds a `NodeData` via `util.serializeNodeData`, encodes through `@atproto/lex-cbor`, and hashes.

`getUnstoredBlocks()` recursively collects every MST block (self + subtrees) that isn't already in `storage`. Use this to materialize the MST into a `BlockMap` for CAR writing:

```typescript
const { root, blocks } = await tree.getUnstoredBlocks()
// blocks contains every new MST node. Merge with record blocks before writing CAR.
```

## Partial trees

A "partial tree" is an `MST` whose some subtrees reference CIDs that aren't in `storage`. Firehose delta CARs produce this state: unchanged subtrees are referenced by CID but their blocks aren't included.

**TS semantics**: any operation that tries to load a missing subtree throws a `MissingBlockError` (from `packages/repo/src/error.ts`). There's no `ErrPartialTree` sentinel like Go, and no `is_partial()` method like Rust.

To operate safely against a possibly-partial tree, you either:

- Use `DataDiff.of(newerTree, olderTree)` where `olderTree` has the missing blocks — `DataDiff` only loads subtrees that actually differ, so untouched subtrees are never resolved.
- Use `verifyDiff` with a `SyncStorage` that falls through to the prior repo's store (see `car.md`).
- Catch `MissingBlockError` and treat it as "this operation can't complete without more blocks".

## Covering proofs

```typescript
const proofBlocks = await tree.getCoveringProof(key)
// BlockMap containing every node on the path to `key`, plus the leaf block.
// Suitable for producing an inclusion proof CAR.
```

Used by `com.atproto.sync.getRecord` to return a minimal CAR that proves a specific record exists in the committed MST.

## Structural validation

Unlike Go's `Tree.Verify` (which checks ascending keys, correct heights, no-sibling-children), **TypeScript does not ship a top-level structural verifier**. Trees built through the public API are always valid by construction: `add`/`update`/`delete` maintain invariants, `getEntries` reconstructs keys from prefix data and rejects invalid keys via `ensureValidMstKey`.

For adversarial input, the invariants you care about are usually enforced at CBOR decode (via zod) or at traversal time (missing blocks throw, invalid keys throw). There's no standalone `verify()` call.

## File pointers

| Concern                        | File                                     |
| ------------------------------ | ---------------------------------------- |
| `MST` class                    | `packages/repo/src/mst/mst.ts`           |
| `Leaf` class                   | `packages/repo/src/mst/mst.ts`           |
| `NodeData`, `TreeEntry` schema | `packages/repo/src/mst/mst.ts:50-56`     |
| `leadingZerosOnHash`           | `packages/repo/src/mst/util.ts:24`       |
| `ensureValidMstKey`            | `packages/repo/src/mst/util.ts`          |
| `serializeNodeData`, `deserializeNodeData` | `packages/repo/src/mst/util.ts` |
| `DataDiff`                     | `packages/repo/src/data-diff.ts`         |
| `MissingBlockError`            | `packages/repo/src/error.ts`             |
| Walker                         | `packages/repo/src/mst/walker.ts`        |
| Diff algorithm                 | `packages/repo/src/mst/diff.ts`          |

## Common errors

| Error                             | Cause                                                                  |
| --------------------------------- | ---------------------------------------------------------------------- |
| `InvalidMstKeyError: <key>`       | Key isn't `<collection>/<rkey>`, or contains invalid chars, or > 1024. |
| `There is already a value at key: <key>` | `add` called on an existing key. Use `update` instead.          |
| `Could not find a record with key: <key>` | `update` / `delete` called on a non-existent key.               |
| `MissingBlockError`               | Tried to load an MST node whose block isn't in `storage` (partial tree). |
| `Not a valid node: two subtrees next to each other` | Serialization invariant violated — bug or corrupt in-memory tree. |

## See also

- `../shared/mst.md` — language-neutral MST algorithm and node format.
- `drisl.md` — canonical encoding of `NodeData`.
- `car.md` — writing MST blocks to a CAR; partial-tree handling in firehose events.
- `commit.md` — `commit.data` is `tree.getPointer()`.
- `../shared/divergence-matrix.md` §mst — immutable (TS) vs mutable (Rust/Go).

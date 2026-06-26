# TypeScript — CAR v1 reading and writing

`@atproto/repo` ships a complete CAR v1 reader **and** writer — unlike Go (reader only) and Rust (writer available in `atproto-dasl`). The reader verifies CID-to-content on ingest by default, which is the most important divergence from the other implementations.

## Reading — `readCar` and friends

Four public entry points, all in `packages/repo/src/car.ts`:

```typescript
readCar(bytes, opts?): Promise<{ roots: Cid[]; blocks: BlockMap }>
readCarWithRoot(bytes, opts?): Promise<{ root: Cid; blocks: BlockMap }>      // asserts 1 root
readCarStream(iter, opts?): Promise<{ roots: Cid[]; blocks: CarBlockIterable }>  // async-iterable input
readCarReader(reader, opts?): Promise<{ roots: Cid[]; blocks: CarBlockIterable }>  // low-level
```

Everything flows through `readCarReader`, which:

1. Reads a varint, interprets it as the header byte length.
2. Decodes the header as DAG-CBOR via `cbor.decode`, validates against zod schema `{ version: 1, roots: Cid[] }`. **CAR v1 only** — any other version fails the schema.
3. Returns a block iterator. Each block: varint length, 36-byte binary CID, block bytes.
4. Wraps the iterator with `verifyIncomingCarBlocks` unless `opts.skipCidVerification` is true.

`readCar` / `readCarWithRoot` eagerly drain the iterator into a `BlockMap`. `readCarStream` / `readCarReader` give you the iterator so you can stream blocks into an arbitrary store. For large inputs prefer the streaming variants.

## CID verification on ingest — the default

```typescript
export async function* verifyIncomingCarBlocks(
  car: AsyncIterable<CarBlock>,
): AsyncGenerator<CarBlock, void, unknown> {
  for await (const block of car) {
    if (!(await isCidForBytes(block.cid, block.bytes))) {
      throw new Error(`Not a valid CID for bytes (${block.cid.toString()})`)
    }
    yield block
  }
}
```

Source: `car.ts:177`. Every block on the way in is re-hashed via sha-256 and compared to its declared CID.

**This is the main TS-vs-rest divergence:**

- Go's `LoadRepoFromCAR` has `// TODO: not verifying CID` (`repo.go:65`). Content is trusted.
- Rust's `CarReader` doesn't verify by default either.
- TS does, by default.

If you want to skip it (e.g., for trusted input, or when the CIDs are already verified by an upstream):

```typescript
const { root, blocks } = await readCarWithRoot(carBytes, { skipCidVerification: true })
```

## `BlockMap` — the in-memory block store

```typescript
class BlockMap {
  add(value: LexValue): Promise<Cid>    // encode, hash, set. Returns the new CID.
  set(cid: Cid, bytes: Uint8Array): void
  get(cid: Cid): Uint8Array | undefined
  has(cid: Cid): boolean
  delete(cid: Cid): void
  getMany(cids: Cid[]): { blocks: Map<Cid, Uint8Array>; missing: Cid[] }
  addMap(other: BlockMap): void
  clear(): void
  entries(): Iterable<{ cid: Cid; bytes: Uint8Array }>
  keys(): Iterable<Cid>
  values(): Iterable<Uint8Array>
  forEach(fn): void
  [Symbol.iterator](): Iterator<...>

  readonly size: number
  readonly byteSize: number
}
```

In-memory only; unbounded. For very large exports, either stream via `readCarReader` into your own persistent store (see below), or rely on the caller to limit input size.

## Storage implementations

From `packages/repo/src/storage/`:

- `ReadableBlockstore` — interface used by `ReadableRepo` / `MST`. Methods: `getBytes`, `has`, `readObj`, `attemptReadRecord`, `getBlocks`.
- `MemoryBlockstore` — wraps a `BlockMap`.
- `RepoStorage` — read/write variant used by mutable `Repo`. Adds `applyCommit`, `getRoot`, `updateRoot`.
- `SyncStorage` — composes two block sources (staged + prior). Used during diff verification so lookups fall through to the prior-repo store.

```typescript
import { MemoryBlockstore, ReadableRepo } from '@atproto/repo'

const { root, blocks } = await readCarWithRoot(carBytes)
const storage = new MemoryBlockstore(blocks)
const repo = await ReadableRepo.load(storage, root)
```

## Streaming into a custom store

```typescript
import { readCarReader } from '@atproto/repo'

const { roots, blocks } = await readCarReader(reader)   // async iterator
for await (const block of blocks) {
  await customStore.put(block.cid, block.bytes)
}
// Or: await blocks.dump() to close without consuming.
```

`CarBlockIterable` is an `AsyncGenerator` with an extra `dump()` method that cancels the iteration and closes the underlying reader without throwing.

## Writing

```typescript
import { writeCarStream, blocksToCarStream, blocksToCarFile } from '@atproto/repo'

// Stream: suitable for piping to a response or file
const stream = writeCarStream(root, asyncIterableOfBlocks)
for await (const chunk of stream) response.write(chunk)

// From a BlockMap, streaming
const stream2 = blocksToCarStream(root, blockMap)

// From a BlockMap, fully buffered (returns Uint8Array)
const carBytes = await blocksToCarFile(root, blockMap)
```

`writeCarStream` emits:

1. Varint(header length) || header (CBOR-encoded `{ version: 1, roots: [root] }`, or `roots: []` if `root === null`).
2. For each block: varint(CID bytes + block bytes) || CID bytes (36) || block bytes.

Matches the CAR v1 spec byte-for-byte. Consumers don't rely on block order; duplicate CIDs are *not* deduplicated — dedupe before passing in if you care (`BlockMap` dedupes automatically because `add` returns the existing CID).

## Block framing on the wire

Per block, same as Go / Rust:

```
varint(cid_len + data_len) || cid_bytes(36) || data_bytes
```

where `cid_bytes` is the 36-byte binary CID (`0x01 0x71 0x12 0x20 <sha-256>`), not the 37-byte tag-42 form. TS handles this correctly; relevant only for raw-byte debugging.

See `../shared/car-v1.md` for the spec-level framing and `../../atproto-cid/shared/binary-layout.md` for the 36-vs-37-byte distinction.

## Firehose framing

Each `#commit` and `#sync` event carries a `blocks` field of type `Uint8Array`. Pass it directly to `readCarWithRoot`:

```typescript
const { root, blocks } = await readCarWithRoot(msg.blocks)
const storage = new MemoryBlockstore(blocks)
const repo = await ReadableRepo.load(storage, root)
```

The CAR only contains blocks that changed in this commit — the commit block, new/changed MST nodes, and new/changed record blocks. Unchanged MST subtrees are referenced by CID but their blocks aren't in the CAR.

**Partial-tree handling:** when the `MST` later tries to descend into a subtree whose block isn't in `storage`, it throws a `MissingBlockError`. This is different from Go and Rust, which treat partial subtrees as a normal state (`ErrPartialTree` / returning `Ok` with missing children). In TS, operations that need the missing blocks fail loudly.

For firehose delta verification, use `verifyDiff(priorRepo, newBlocks, newRoot, did, signingKey)` — it composes a `SyncStorage` that falls through to the prior repo's store, so unchanged subtree lookups succeed against the old state.

## End-to-end verified ingest

```typescript
import { verifyRepoCar, verifyDiffCar } from '@atproto/repo'

// Full repo CAR from com.atproto.sync.getRepo
const verified: VerifiedRepo = await verifyRepoCar(carBytes, did, didKey)
// verified.creates is the full record listing; verified.commit holds cid/rev/prev.

// Delta CAR (e.g. a firehose event)
const diff: VerifiedDiff = await verifyDiffCar(priorRepo, carBytes, did, didKey)
// diff.writes is the RecordWriteDescript[]; diff.commit is the new state.
```

Both accept `did?: string` and `signingKey?: string` (the `did:key:…` form of the current `#atproto` signing key). When passed, they verify `commit.did` matches and the signature is valid. When omitted, they skip those checks — use only for trusted input or when you've verified elsewhere.

Caller owns DID → didKey resolution. See `commit.md` §verification.

## Common errors

| Error                                         | Cause                                                                  |
| --------------------------------------------- | ---------------------------------------------------------------------- |
| `Could not parse CAR header`                  | Header bytes don't decode to DAG-CBOR or don't match `{ version: 1, roots: [...] }`. |
| `Not a valid CID for bytes (<cid>)`           | Block content hash doesn't match the declared CID. Corruption or forgery. |
| `Expected one root, got N`                    | `readCarWithRoot` called on a CAR with zero or multiple roots.         |
| `could not parse varint`                      | Truncated CAR or invalid varint framing.                               |
| `Invalid repo did: <did>`                     | `verifyRepo`: the commit's `did` doesn't match the expected DID.       |
| `Invalid signature on commit: <cid>`          | `verifyRepo`: signature check failed under `signingKey`.               |
| `missing leaf blocks: <cids>`                 | `verifyDiff` with `ensureLeaves: true`: new leaves referenced in MST but block not in CAR. |

## File pointers

| Concern                            | File                                                |
| ---------------------------------- | --------------------------------------------------- |
| `readCar*`                         | `packages/repo/src/car.ts`                          |
| `writeCarStream`, `blocksToCar*`   | `packages/repo/src/car.ts`                          |
| `verifyIncomingCarBlocks`          | `packages/repo/src/car.ts:177`                      |
| `BlockMap`                         | `packages/repo/src/block-map.ts`                    |
| `ReadableBlockstore` / `MemoryBlockstore` / `SyncStorage` | `packages/repo/src/storage/`     |
| `verifyRepoCar` / `verifyDiffCar`  | `packages/repo/src/sync/consumer.ts`                |
| CAR header schema                  | `packages/repo/src/types.ts` (`schema.carHeader`)   |

## See also

- `../shared/car-v1.md` — byte-level CAR v1 spec.
- `drisl.md` — canonical DAG-CBOR underlying every block.
- `mst.md` — `MST` + partial-tree semantics.
- `commit.md` — `verifyCommitSig` / `verifyRepo` / `verifyDiff` on top of a CAR.
- `../shared/divergence-matrix.md` §car — TS verifies CIDs by default; Go and Rust don't.

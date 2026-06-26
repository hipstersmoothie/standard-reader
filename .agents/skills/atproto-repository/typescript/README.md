# TypeScript — `@atproto/repo` overview

The reference TypeScript implementation of AT Protocol repository format is split across four packages in the `bluesky-social/atproto` monorepo:

| Package              | Purpose                                                                         |
| -------------------- | ------------------------------------------------------------------------------- |
| `@atproto/repo`      | `Repo` / `ReadableRepo`, `MST`, `BlockMap`, CAR reader/writer, commit signing.  |
| `@atproto/lex-cbor`  | Canonical DAG-CBOR (`encode`, `decode`), `cidForLex`, `sha256RawToCid`.         |
| `@atproto/lex-data`  | `Cid` class, `LexMap`/`LexValue` types, `decodeCid`, `isCidForBytes`.           |
| `@atproto/crypto`    | `Secp256k1Keypair`, `P256Keypair`, `verifySignature`.                           |
| `@atproto/syntax`    | DID / TID / NSID / AT-URI parsing, `RecordKeyString`, `NsidString`.             |
| `@atproto/common-web`| `TID.nextStr()` for revision generation.                                        |

Pin via `npm install @atproto/repo @atproto/crypto @atproto/lex-data`; the others are transitive deps. Check `https://www.npmjs.com/package/@atproto/repo` for the current version — the package is actively maintained.

## Public surface of `@atproto/repo`

Re-exported from `index.ts`:

- **Repo types** — `Repo`, `ReadableRepo`
- **Trees** — `MST`, `Leaf`, `NodeEntry`, `NodeData`
- **Blocks** — `BlockMap`, `CarBlock`, `CidSet`
- **Commits** — `Commit`, `UnsignedCommit`, `LegacyV2Commit`, `VersionedCommit`, `CommitData`, `RepoUpdate`
- **Writes** — `WriteOpAction`, `RecordWriteOp`, `RecordCreateOp`, `RecordUpdateOp`, `RecordDeleteOp`, `RecordWriteDescript`, `WriteLog`
- **Signing** — `signCommit`, `verifyCommitSig`
- **CAR** — `readCar`, `readCarWithRoot`, `readCarStream`, `readCarReader`, `writeCarStream`, `blocksToCarFile`, `blocksToCarStream`, `verifyIncomingCarBlocks`
- **Parsing** — `getAndParseRecord`, `getAndParseByDef`, `cborToLex`, `cborToLexRecord`
- **Storage** — `ReadableBlockstore`, `MemoryBlockstore`, `RepoStorage`, `SyncStorage`
- **Diffs** — `DataDiff`
- **Sync verification** — from `./sync`: `verifyRepoCar`, `verifyRepo`, `verifyDiffCar`, `verifyDiff`, `verifyProofs`, `verifyRecords`

## Reading a CAR → Repo

```typescript
import { readCarWithRoot, ReadableRepo } from '@atproto/repo'
import { MemoryBlockstore } from '@atproto/repo'

const { root, blocks } = await readCarWithRoot(carBytes)
// blocks is a BlockMap. CIDs are verified against their bytes by default.
const storage = new MemoryBlockstore(blocks)
const repo = await ReadableRepo.load(storage, root)

console.log(repo.did, repo.commit.rev)
const record = await repo.getRecord('app.bsky.feed.post', 'abc123')
```

`ReadableRepo.load` reads the commit object via `storage.readObj(root, def.versionedCommit)`, upgrades any legacy v2 commit through `ensureV3Commit`, and constructs the MST lazily (`MST.load(storage, commit.data)` doesn't touch storage — entries load on first traversal).

## Building a Repo → writing a CAR

```typescript
import {
  Repo,
  MemoryBlockstore,
  WriteOpAction,
  blocksToCarFile,
} from '@atproto/repo'
import { Secp256k1Keypair } from '@atproto/crypto'

const storage = new MemoryBlockstore()
const keypair = await Secp256k1Keypair.create()
const repo = await Repo.create(storage, 'did:plc:example', keypair, [])

const update = await repo.formatCommit(
  {
    action: WriteOpAction.Create,
    collection: 'app.bsky.feed.post',
    rkey: TID.nextStr(),
    record: { $type: 'app.bsky.feed.post', text: 'hello', createdAt: now },
  },
  keypair,
)

// update.newBlocks contains the commit + all MST + record blocks.
const carBytes = await blocksToCarFile(update.cid, update.newBlocks)
```

`Repo.create` signs a genesis commit via `formatInitCommit`; `Repo.formatCommit` takes one or more `RecordWriteOp`s, applies them to the MST, and returns a fresh `CommitData` with `newBlocks` holding everything that needs to be persisted.

## Idioms to watch for

- **Immutable MST** — every mutation returns a *new* `MST` value. The old value is still valid. Rust and Go use mutation; TS does not. See `mst.md`.
- **`prev` always serialized** — `Commit.prev` is `Cid | null`, and the field is always present in the serialized map (matches Go, diverges from the Rust reference impl). See `commit.md` §prev.
- **CAR reader verifies CIDs on ingest** — `readCar*` runs `verifyIncomingCarBlocks` by default, re-hashing every block and throwing on mismatch. Go's `LoadRepoFromCAR` does NOT verify. Rust's `CarReader` doesn't by default either. See `car.md`.
- **`LexMap` vs raw map** — records round-trip as `LexMap` (a plain object with lex-aware types for CIDs, bytes, blobs). Use `cborToLexRecord` to decode block bytes into a `LexMap`.
- **Caller owns DID → didKey resolution** — `verifyRepo`/`verifyCommitSig` take a `didKey: string` (the `did:key:…` form of the atproto signing key), not a DID document. Resolve separately (see the `atproto-identity-resolution` skill).
- **No inductive firehose verifier** — TS does not ship an equivalent of Go's `VerifyCommitMessage` (op inversion to reproduce `prevData`). Use `verifyDiff(repo, newBlocks, newRoot, did, signingKey)` against the prior repo state for equivalent guarantees.
- **async/await everywhere** — most APIs are async because the storage interface is async. Even pure-ish helpers (`MST.get`, `MST.add`) are async because MST entries load on demand.

## When to reach for which API

| Task                                              | Use                                                                    |
| ------------------------------------------------- | ---------------------------------------------------------------------- |
| Read a signed CAR export, check it end to end     | `verifyRepoCar(carBytes, did, signingKey)` → `VerifiedRepo`            |
| Verify a delta CAR relative to the prior repo     | `verifyDiffCar(repo, carBytes, did, signingKey)` → `VerifiedDiff`      |
| Inspect records without verification              | `readCarWithRoot` + `ReadableRepo.load` + `repo.getRecord`             |
| Produce a new commit for a set of writes          | `Repo.formatCommit(ops, keypair)` → `RepoUpdate`                       |
| Produce a firehose `#commit` delta CAR            | `blocksToCarFile(update.cid, update.newBlocks)` — only changed blocks  |
| Seed a fresh repo                                 | `Repo.create(storage, did, keypair, initialWrites)`                    |
| Check a specific record inclusion proof           | `verifyProofs(carBytes, claims, did, didKey)`                          |
| Walk the MST directly                             | `repo.data.walk()` or `repo.data.walkLeavesFrom(key)`                  |

## File pointers (monorepo)

| Concern                         | File                                                  |
| ------------------------------- | ----------------------------------------------------- |
| Public barrel                   | `packages/repo/src/index.ts`                          |
| `Repo` / `ReadableRepo`         | `packages/repo/src/repo.ts`, `readable-repo.ts`       |
| `MST`                           | `packages/repo/src/mst/mst.ts`                        |
| `MST` util (hash, key-validity) | `packages/repo/src/mst/util.ts`                       |
| CAR reader / writer             | `packages/repo/src/car.ts`                            |
| Block store                     | `packages/repo/src/block-map.ts`, `src/storage/`      |
| Commit types & schema           | `packages/repo/src/types.ts`                          |
| `signCommit` / `verifyCommitSig`| `packages/repo/src/util.ts`                           |
| Sync verification               | `packages/repo/src/sync/consumer.ts`                  |
| Data diff                       | `packages/repo/src/data-diff.ts`                      |

## See also

- `drisl.md` — canonical DAG-CBOR via `@atproto/lex-cbor`.
- `car.md` — CAR v1 reading / writing and firehose framing.
- `mst.md` — the immutable `MST` class and its on-wire node shape.
- `commit.md` — commit signing, verification, and the `prev` divergence.
- `../shared/divergence-matrix.md` — where TS differs from Rust and Go.

# TypeScript — commit record, signing, and verification

TS sits between Rust (everything caller-owned) and Go (fully wired end-to-end). `@atproto/repo` provides `signCommit` / `verifyCommitSig` as primitives, `verifyRepo` / `verifyDiff` as bundled checks on top of CAR input, but **DID → didKey resolution is still the caller's job**. Pass the resolved `did:key:…` string into the verifier; the package does not resolve DIDs.

Source: `packages/repo/src/types.ts`, `packages/repo/src/util.ts`, `packages/repo/src/sync/consumer.ts`.

## Commit shape

Defined as zod schemas in `types.ts`:

```typescript
const unsignedCommit = z.object({
  did: z.string(),
  version: z.literal(3),
  data: cidSchema,
  rev: z.string(),
  prev: cidSchema.nullable(),
})
export type UnsignedCommit = z.infer<typeof unsignedCommit> & { sig?: never }

const commit = z.object({
  did: z.string(),
  version: z.literal(3),
  data: cidSchema,
  rev: z.string(),
  prev: cidSchema.nullable(),
  sig: z.instanceof(Uint8Array),
})
export type Commit = z.infer<typeof commit>
```

`prev: cidSchema.nullable()` — **not optional**. `prev` is **always** present as a map key. Genesis commits have `prev: null`; non-genesis have `prev: <cid>`.

There's also a `LegacyV2Commit` type for reading (`version: 2`, `rev` optional) and `VersionedCommit = Commit | LegacyV2Commit` as a discriminated union. `ensureV3Commit(commit)` in `util.ts` upgrades a v2 commit by filling `rev = commit.rev ?? TID.nextStr()`.

## `prev`: null vs omitted

**Same divergence as Go-vs-Rust.**

TS always serializes `prev`. Genesis commit on the wire: 5-entry map (CBOR header `a5`), `prev` key with CBOR null (`0xF6`) as value. Matches the spec-strict form and matches Go's output.

The Rust reference impl (`atproto-repo`) uses `#[serde(skip_serializing_if = "Option::is_none")]` on `prev`, so a genesis commit has 4 entries (`a4` header) and no `prev` key. **A commit signed by Rust's reference impl will not verify via `verifyCommitSig` after round-tripping through TS's `UnsignedCommit`**, because re-encoding adds `prev: null` and produces different bytes.

Practical implication: TS-to-TS and TS-to-Go verification is fine. Rust-signed genesis commits need special handling — ideally verify against the raw commit bytes from the CAR without re-encoding, but `verifyCommitSig` doesn't expose that path. You'd have to CBOR-decode, strip the `sig` key, and re-encode manually.

See `../shared/commit-and-signing.md` §1.1.

## DAG-CBOR field order

TS uses `@atproto/lex-cbor`, which sorts map keys **bytewise** on encode. Bytewise order of the commit fields: `data, did, prev, rev, sig, version`. This matches the DRISL canonical order — TS is always canonical on the wire.

(Go's cbor-gen sorts by struct declaration order — which happens to match bytewise for the commit struct but only by luck. See `go/drisl.md`.)

## Signing

```typescript
import { signCommit } from '@atproto/repo'
import { Secp256k1Keypair } from '@atproto/crypto'

const keypair = await Secp256k1Keypair.create()         // or .import(privateBytes)

const unsigned: UnsignedCommit = {
  did: 'did:plc:example',
  version: 3,
  data: mstRootCid,
  rev: TID.nextStr(),
  prev: null,          // or previous commit CID
}

const commit: Commit = await signCommit(unsigned, keypair)
// commit.sig is a Uint8Array of raw r||s bytes, low-S normalized.
```

Source: `util.ts`:

```typescript
export const signCommit = async (
  unsigned: UnsignedCommit,
  keypair: Keypair,
): Promise<Commit> => {
  const encoded = cbor.encode(unsigned)
  const sig = await keypair.sign(encoded)
  return { ...unsigned, sig }
}
```

The `Keypair` interface (from `@atproto/crypto`) guarantees `sign` returns raw `r||s` bytes, low-S normalized — the atproto signature shape.

## Verification — low-level

```typescript
import { verifyCommitSig } from '@atproto/repo'

const valid: boolean = await verifyCommitSig(commit, didKey)
// didKey is the did:key:... string for the current #atproto signing key.
// Returns boolean; does not throw on bad signature.
```

Source: `util.ts`:

```typescript
export const verifyCommitSig = async (
  commit: Commit,
  didKey: string,
): Promise<boolean> => {
  const { sig, ...rest } = commit
  const encoded = cbor.encode(rest)
  return crypto.verifySignature(didKey, encoded, sig)
}
```

`crypto.verifySignature` from `@atproto/crypto` dispatches to k-256 or p-256 based on the multibase prefix inside `didKey`. Low-S normalization is applied.

**The `{ sig, ...rest }` destructuring** is what makes this work for `prev: null` commits — it re-encodes the commit-minus-sig through the same canonical encoder that signed it. Round-tripping is safe because both sign and verify go through `cbor.encode`. The failure mode is cross-implementation: a commit signed by something with different encoding rules (e.g., Rust omitting `prev`) won't verify here.

## Verification — bundled against a CAR

```typescript
import { verifyRepoCar, verifyRepo, verifyDiffCar, verifyDiff } from '@atproto/repo'

// Full repo CAR, e.g. from com.atproto.sync.getRepo
const verified: VerifiedRepo = await verifyRepoCar(carBytes, did, didKey)
// verified.creates: RecordCreateDescript[] — every record in the repo
// verified.commit: CommitData
```

```typescript
// Delta CAR: firehose #commit event or #sync event
const verified: VerifiedDiff = await verifyDiffCar(priorRepo, carBytes, did, didKey)
// verified.writes: RecordWriteDescript[] — creates/updates/deletes vs priorRepo
// verified.commit: CommitData (cid, rev, since, prev, newBlocks, ...)
```

Behaviour:

1. `readCarWithRoot(carBytes)` — CAR-level CID verification on every block (see `car.md`).
2. Load commit via `storage.readObj(root, def.commit)` — zod validates commit shape.
3. If `did` passed: assert `commit.did === did`.
4. If `didKey` passed: `verifyCommitSig(commit, didKey)` — fails with `RepoVerificationError` if invalid.
5. `DataDiff.of(newTree, priorTree)` — compute the change set.
6. Assert leaf blocks referenced by new MST nodes are present (unless `opts.ensureLeaves === false`).

`did` and `didKey` are optional — pass both for full verification, omit for reading only.

## Inductive firehose verification

**Go has `VerifyCommitMessage` that inverts each op, reapplies to a copied tree, and compares the resulting root to `msg.PrevData`. TypeScript does not ship this.**

TS's equivalent is `verifyDiff(priorRepo, newBlocks, newRoot, did, signingKey)`: it computes the diff between the new tree and the prior repo's tree (via `SyncStorage` that reads from the prior store for unchanged subtrees), producing the same `RecordWriteDescript[]` that a firehose event would declare. If the diff doesn't match the ops in the event, the caller catches the discrepancy manually by comparing `verified.writes` to `msg.ops`. There's no single-call "inductive verification" helper.

If you're reimplementing Go's flow manually:

```typescript
// 1. Load delta CAR into the existing repo's storage.
const { root, blocks } = await readCarWithRoot(msg.blocks)
const storage = new SyncStorage(new MemoryBlockstore(blocks), priorRepo.storage)

// 2. Verify sig.
const newRepo = await ReadableRepo.load(storage, root)
await verifyCommitSig(newRepo.commit, didKey)

// 3. Compute diff and compare to msg.ops.
const diff = await DataDiff.of(newRepo.data, priorRepo.data)
const writes = await diffToWriteDescripts(diff)
// compare `writes` vs `msg.ops` to catch op fabrication.

// 4. If msg includes prevData, check priorRepo.data root equals it.
// (This is the analog of Go's "inverted tree root == msg.PrevData".)
```

Caller writes the glue.

## Key rotation — verifying older commits

`didKey` is the **current** signing key. Older commits were signed under historical keys. `verifyCommitSig` fails on rotation with `return false`.

No TS helper wires historical-key lookup into commit verification. For `did:plc`, walk the operation log via `@atproto/identity` (or a direct HTTP call to `plc.directory/<did>/log/audit`) and retry with the historic didKey. For `did:web`, historical documents aren't retrievable; older commits are permanently unverifiable post-rotation.

See `../shared/commit-and-signing.md` §7 and the `atproto-identity-resolution` skill.

## Producing a new commit

The higher-level flow, combining MST, blocks, and signing:

```typescript
import { Repo, WriteOpAction } from '@atproto/repo'

const repo = await Repo.load(storage)   // or Repo.create(...) for genesis

const update = await repo.formatCommit(
  [
    {
      action: WriteOpAction.Create,
      collection: 'app.bsky.feed.post',
      rkey: TID.nextStr(),
      record: { $type: 'app.bsky.feed.post', text: 'hi', createdAt: now },
    },
  ],
  keypair,
)
// update: RepoUpdate { cid, rev, prev, since, newBlocks, relevantBlocks, removedCids, ops }

await storage.applyCommit(update)
// update.newBlocks now persisted; repo root updated to update.cid.
```

`Repo.formatCommit` does:

1. Apply each `RecordWriteOp` to the MST (immutable returns — tracked internally).
2. Collect new MST nodes and new record blocks into `newBlocks`.
3. Build the `UnsignedCommit` with `data = newTree.getPointer()`, `prev = repo.cid`, `rev = TID.nextStr()`.
4. `signCommit(unsigned, keypair)` — produce signature.
5. Add the signed commit block to `newBlocks`; return `RepoUpdate`.

`Repo.formatInitCommit` / `Repo.create` do the genesis equivalent with `prev: null`.

## File pointers

| Concern                              | File                                                 |
| ------------------------------------ | ---------------------------------------------------- |
| `Commit`, `UnsignedCommit`, schemas  | `packages/repo/src/types.ts`                         |
| `signCommit`, `verifyCommitSig`      | `packages/repo/src/util.ts`                          |
| `ensureV3Commit`                     | `packages/repo/src/util.ts`                          |
| `verifyRepo`, `verifyDiff`, `verifyProofs` | `packages/repo/src/sync/consumer.ts`           |
| `RepoVerificationError`              | `packages/repo/src/sync/consumer.ts`                 |
| `Repo.formatCommit`, `Repo.formatInitCommit` | `packages/repo/src/repo.ts`                  |
| `Keypair` interface                  | `packages/crypto/src/` (external)                    |
| `crypto.verifySignature`             | `packages/crypto/src/` (external)                    |

## Common errors

| Error                                           | Cause                                                                  |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| zod validation error on `Commit` schema         | Commit bytes don't match `{ did, version: 3, data, rev, prev, sig }`. Usually v2 (run through `ensureV3Commit`) or corruption. |
| `RepoVerificationError: Invalid repo did: <did>` | `verifyRepo` / `verifyProofs`: `commit.did` doesn't match the expected `did`.      |
| `RepoVerificationError: Invalid signature on commit: <cid>` | `verifyCommitSig` returned false. Rotation, or prev-null divergence, or bad didKey. |
| `verifyCommitSig` returns `false`               | Sig invalid under given didKey. Diagnose: check didKey is current, or try historical keys for rotated accounts. |
| `missing leaf blocks: <cids>`                   | `verifyDiff` with `ensureLeaves: true` and new MST nodes reference leaves whose blocks aren't in the CAR. |

## See also

- `../shared/commit-and-signing.md` — language-neutral commit & signing rules (includes §1.1 prev divergence).
- `drisl.md` — `cbor.encode(unsigned)` is what `signCommit` signs.
- `mst.md` — `tree.getPointer()` produces `commit.data`.
- `car.md` — end-to-end verification against a CAR.
- `../shared/divergence-matrix.md` §commit — TS vs Rust (`prev` omit) vs Go (fully wired via `VerifyCommitSignatureFromCar`).
- `atproto-identity-resolution` skill — resolving DIDs to `did:key:…` signing keys.

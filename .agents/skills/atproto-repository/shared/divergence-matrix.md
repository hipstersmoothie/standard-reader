# Cross-Language Divergence Matrix (ATProto Repository)

Language-neutral. Captures the real behavioural differences between the Rust (`atproto-repo` + `atproto-dasl` + `atproto-record`), TypeScript (`@atproto/repo`), and Go (`indigo/atproto/repo`) stacks that anyone porting code or operating cross-stack needs to know about.

Every per-language file (`rust/*.md`, `typescript/*.md`, `go/*.md`) links back here instead of restating the matrix.

## Library map

| Layer             | Rust                                   | TypeScript                            | Go                                          |
| ----------------- | -------------------------------------- | ------------------------------------- | ------------------------------------------- |
| Canonical DAG-CBOR | `atproto-dasl` (DRISL-strict)         | `@atproto/lex-cbor`                   | `cbor-gen` typed + `atproto/atdata` generic |
| CID               | `atproto-dasl::Cid` (DASL-strict)     | `@atproto/lex-data` → `Cid` class     | `github.com/ipfs/go-cid`                    |
| CAR               | `atproto-dasl::{CarReader,CarWriter}` | `@atproto/repo/car.ts` (reader + writer) | `github.com/ipld/go-car` + `atproto/repo/car.go` (reader only) |
| MST               | `atproto-repo::Mst`                   | `@atproto/repo::MST`                  | `atproto/repo/mst::Tree`                    |
| Commit            | `atproto-repo::{Commit, UnsignedCommit}` | `@atproto/repo::Commit`            | `atproto/repo::Commit`                      |
| Signing/verify    | **Caller-owned** — k256/p256 crates   | `signCommit`, `verifyCommitSig` — caller resolves didKey | **Fully wired**: `VerifyCommitSignatureFromCar` resolves DID → key → verify |
| Identity wiring   | `atproto-identity` (separate crate)   | `@atproto/identity` (separate package) | `atproto/identity.Directory` (plumbed into repo package) |
| Record types      | `atproto-record` (separate crate)     | Lex schemas in individual packages   | `atproto/atdata` + typed client packages    |

The shape of the trade-off: **Go ships the most end-to-end, Rust ships the most primitive, TS sits in the middle.** Go's `VerifyCommitSignatureFromCar` will resolve the DID, pull the signing key, and check the signature in one call. Rust gives you `Commit::signing_bytes()` and expects you to bring your own everything. TS ships `verifyRepo(carBytes, did, didKey)` where the didKey is already resolved.

---

## §drisl — canonical DAG-CBOR

| Aspect                              | Rust (`atproto-dasl`)                  | TypeScript (`@atproto/lex-cbor`)    | Go (`cbor-gen` + `atdata`)                    |
| ----------------------------------- | -------------------------------------- | ----------------------------------- | --------------------------------------------- |
| Map key sort on encode              | Bytewise                               | Bytewise                            | **Struct declaration order** (cbor-gen quirk) |
| Strict canonical decode             | No (permissive like go-ipld-cbor)      | No                                  | No                                            |
| CID in memory                       | `atproto_dasl::Cid` (DASL-strict)      | `Cid` class                         | `cid.Cid` or `atdata.CIDLink` wrapper         |
| Typed bytes wrapper                 | `atproto_dasl::Bytes`                  | Plain `Uint8Array`                  | `atdata.Bytes`                                |
| Blob wrapper                        | `atproto_record::Blob`                 | Plain object (`{$type: "blob", ref, mimeType, size}`) | `atdata.Blob`            |
| Size limits enforced at CBOR layer  | Configurable in `atproto-dasl`         | **None** — enforced at PDS/XRPC only | Hard-coded in `atdata/const.go` (1 MiB record, 128k container, 1 MiB string, 8 KiB key) |
| Generic `Value`-style path          | `atproto_dasl::Value`                  | `LexValue` (from `@atproto/lex-data`) | `atdata.UnmarshalCBOR` → `map[string]any`   |

**Practical bug one**: Go's cbor-gen sorts by **struct declaration order**, not bytewise. The indigo `Commit` struct happens to have fields in an order that produces canonical output, but this is a coincidence — add a cbor-gen struct yourself and if the declaration order doesn't match bytewise, your output is non-canonical and the CID won't match other implementations.

**Practical bug two**: Size limits aren't consistently enforced at the CBOR layer. Go rejects >1 MiB records at `atdata.UnmarshalCBOR`; TS and Rust don't. If you're reading potentially-adversarial CAR input in TS or Rust, wrap the input with a size cap before decoding.

---

## §car — CAR v1 framing

| Aspect                              | Rust                                   | TypeScript                         | Go                                            |
| ----------------------------------- | -------------------------------------- | ---------------------------------- | --------------------------------------------- |
| Reader                              | `atproto-dasl::CarReader`              | `readCar` / `readCarReader` / `readCarStream` | `repo.LoadRepoFromCAR` / `LoadCommitFromCAR` + `go-car` directly |
| Writer                              | `atproto-dasl::CarWriter`              | `writeCarStream` / `blocksToCarFile` / `blocksToCarStream` | **None shipped** — use `go-car` directly       |
| CID verification on ingest          | **Off** by default                     | **On** by default (`verifyIncomingCarBlocks`); toggle via `skipCidVerification: true` | **Off** (`// TODO: not verifying CID` in `repo.go:65`) |
| Blockstore surface                  | `MemoryStorage`, `SpillableBuffer` for on-disk spill | `BlockMap` (unbounded map), `MemoryBlockstore`, `SyncStorage` (composed) | `TinyBlockstore` (unbounded `map[string]blocks.Block`); swap via `RepoBlockSource` |
| Streaming support                   | `CarReader` is streaming; `SpillableBuffer` for memory cap | `readCarStream` streaming; `BlockMap` in-memory only | `go-car.NewCarReader` streaming; `TinyBlockstore` in-memory |
| Block framing (on the wire)         | `varint(cid_len + data_len) ‖ cid ‖ bytes`, 36-byte CID | Same                          | Same                                          |

**Practical bug one**: **TS verifies CIDs on ingest. Go and Rust don't.** A CAR that passes through Go or Rust unmodified may carry corrupted blocks; TS will reject it. For trusted internal transport, TS's verification is extra CPU you can skip with `skipCidVerification: true`. For untrusted input, TS is the only implementation that protects you by default.

**Practical bug two**: Go has no built-in CAR writer. Reaching for "how do I write a CAR in indigo" leads you to `go-car` directly. Rust (`atproto-dasl::CarWriter`) and TS (`writeCarStream` / `blocksToCarFile`) ship writers.

**Practical bug three**: `TinyBlockstore` (Go) and `BlockMap` (TS) are **unbounded in-memory maps**. Large repo exports OOM. Rust's `SpillableBuffer` has on-disk spillover for large inputs; Go and TS leave it to the caller to implement.

---

## §mst — Merkle Search Tree

| Aspect                              | Rust (`atproto_repo::Mst`)             | TypeScript (`MST`)                  | Go (`mst.Tree`)                               |
| ----------------------------------- | -------------------------------------- | ----------------------------------- | --------------------------------------------- |
| Mutability                          | Mutable in place                       | **Immutable** — `add`/`update`/`delete` return new `MST` | Mutable in place                    |
| Key validation                      | `MAX_KEY_BYTES = 1024`, character set  | **Stricter**: `<collection>/<rkey>` shape enforced, char set `[a-zA-Z0-9_~\-:.]` | `MAX_KEY_BYTES = 1024`, character set |
| Node on wire                        | `{l, e: [{p, k, v, t}]}`               | Same                                | Same                                          |
| Height (layer) computation          | SHA-256 leading zero-bit pairs (fanout 4) | Same                            | Same (despite `// fanout: 16` comment — misleading) |
| Previous-value semantics on write   | Returns `Option<Cid>` on `insert`/`remove`/`delete` | Returns new `MST` (no prev value) | Returns `(prevValue, error)` on `Insert`/`Remove` |
| Partial tree semantics              | `is_partial()` method; ops on missing blocks error gracefully | `MissingBlockError` thrown — no soft mode | `IsPartial()`, `Stub` flag; `ErrPartialTree` sentinel — expected for firehose |
| Cross-height insert (same call)     | **Not supported** — bottom-up only    | Supported (recursion handles splits) | Supported (recursion handles splits)         |
| Diff API                            | `diff_entries` → `MstDiff::{Add,Update,Delete}` | `DataDiff.of(newTree, oldTree)` → `addList/updateList/deleteList` | `WriteToMap` + manual comparison (no first-party flat diff) |
| Structural verify                   | `Mst::verify`                          | **Not shipped** — invariants maintained by construction | `Tree.Verify`                  |

**Practical bug one**: **Rust's `insert_recursive` can't cross heights in a single call.** If you're building a large tree, you must bottom-up from the leaves, not top-down from the root. TS and Go handle cross-height splits internally.

**Practical bug two**: **TS's MST is immutable.** `let tree = await MST.create(); tree.add(k, v)` silently discards the result — you need `tree = await tree.add(k, v)`. Rust and Go mutate in place, so this pattern is foreign to TS callers.

**Practical bug three**: Partial trees are **expected** in Go (firehose events return them normally) but **exceptional** in TS (a `MissingBlockError` throws). If you're porting Go firehose code to TS, wrap subtree traversals in try/catch or use `SyncStorage` that falls through to a prior store.

**Practical bug four**: Go's `HeightForKey` comment says `// fanout: 16` but the algorithm counts pairs of zero bits (fanout 4). Don't trust the comment. All three implementations agree on fanout 4; cross-implementation trees interop correctly.

---

## §commit — commit record and signatures

| Aspect                              | Rust                                   | TypeScript                         | Go                                            |
| ----------------------------------- | -------------------------------------- | ---------------------------------- | --------------------------------------------- |
| `prev` for genesis commit           | **Omitted** (`#[serde(skip_serializing_if)]`) — 4-entry map `a4` | Always present as null — 5-entry map `a5` | Always present as null — 5-entry map `a5` (comment at `commit.go:18` explicit) |
| Spec conformance                    | Reference-impl divergent from spec    | Spec-strict                         | Spec-strict                                   |
| Signing bytes API                   | `UnsignedCommit::signing_bytes()`      | `cbor.encode(unsigned)` inside `signCommit` | `Commit::UnsignedBytes()` (re-marshals through cbor-gen) |
| Signature format                    | Caller-supplied (k256/p256 raw r‖s, low-S) | `Keypair.sign()` from `@atproto/crypto` — raw r‖s, low-S | `atcrypto.PrivateKey.HashAndSign` — raw r‖s, low-S |
| Signature verification API          | **Caller-owned** — resolve DID + verify yourself | `verifyCommitSig(commit, didKey)` — caller resolves didKey | `commit.VerifySignature(pubkey)` + `VerifyCommitSignatureFromCar(ctx, dir, carBytes)` — fully wired |
| Inductive firehose verification     | Not provided                           | Not provided (use `verifyDiff` + manual op compare) | `VerifyCommitMessage` — op inversion + compare to `prevData` |
| Rotation handling helpers           | None                                   | None                                | None                                          |
| Version-2 legacy support            | Not in `Commit` type                   | `LegacyV2Commit` + `ensureV3Commit` upgrade | Validates `Version == 3` only, no upgrade helper |

**Practical bug one** — the big one: **`prev` is sometimes omitted, sometimes null.** A Rust reference-impl genesis commit has 4 fields on the wire (`prev` skipped). Go and TS always serialize `prev: null` (5 fields). **A Rust-signed genesis commit won't verify if you re-marshal it through Go's `UnsignedBytes()` or TS's `signCommit` encoder.** If you see signatures fail on genesis commits only, suspect this. The workaround is to verify against the raw commit block bytes from the CAR — strip the `sig` field without re-encoding the others — but TS's `verifyCommitSig` and Go's `commit.VerifySignature` both re-marshal, so they don't expose a raw-bytes verification path. You have to build it manually.

See `shared/commit-and-signing.md` §1.1 for the full treatment.

**Practical bug two**: **Go has a fully wired `VerifyCommitSignatureFromCar`; TS and Rust don't.** Go takes a CAR, resolves the DID via `identity.Directory`, pulls the signing key, and verifies — single call. TS takes a pre-resolved `didKey: string`. Rust expects you to do all of it yourself. When porting Go verification code, you'll need to add DID resolution as a separate step in TS / Rust.

**Practical bug three**: **None of the implementations handle key rotation automatically.** All three return "signature invalid" when a commit was signed under a historical key. You must resolve the PLC operation log, find the key that was active at `commit.rev`, and retry verification. For `did:web` this is not recoverable — rotated accounts lose verifiability of old commits.

**Practical bug four**: **TS upgrades v2 commits transparently via `ensureV3Commit`**; Go rejects anything but v3; Rust doesn't ship a `LegacyV2Commit` type. If you're reading ancient CARs, only TS copes out of the box.

---

## §validation — what each implementation checks

| Check                                    | Rust                                    | TypeScript                            | Go                                     |
| ---------------------------------------- | --------------------------------------- | ------------------------------------- | -------------------------------------- |
| CID → content matches on CAR read        | No (caller's job)                       | **Yes** by default                    | No (`// TODO: not verifying CID`)      |
| Commit structure (version, DID, sig, rev) | `commit.validate()`                     | zod schema on decode                  | `commit.VerifyStructure()`             |
| MST key validity                         | Char set + length                       | Char set + **`<collection>/<rkey>` shape** | Char set + length                   |
| MST structural invariants (heights, order) | `Mst::verify`                          | Not shipped                           | `Tree.Verify`                          |
| Commit signature                         | Caller                                  | `verifyCommitSig(commit, didKey)`     | `commit.VerifySignature(pubkey)`       |
| Commit signature wired to DID resolution | Caller                                  | Caller resolves didKey first          | **`VerifyCommitSignatureFromCar`** — wired |
| MST → record block presence              | Caller                                  | `verifyDiff({ ensureLeaves: true })`  | Implicit via `GetRecordBytes` miss     |
| Ops match committed MST                  | Caller                                  | `verifyDiff` + manual op-vs-diff comparison | `VerifyCommitMessage` (full inductive) |

**Practical takeaway**: if you need end-to-end verification of an incoming firehose event and you can only use one implementation — Go. `VerifyCommitSignature` + `VerifyCommitMessage` together cover every check that matters (CID integrity is the one gap). TS gets most of the way with `verifyDiffCar` but lacks the op-inversion check against `prevData`.

---

## When porting, the order of surprises

1. **`prev: null` vs absent** — trips everyone. Always check this first when sigs fail.
2. **TS MST is immutable** — `tree.add(k, v)` returns a new tree; you must reassign.
3. **Go cbor-gen sorts by declaration order** — if you add a struct, audit the field order.
4. **TS verifies CIDs on CAR ingest** — toggle off with `skipCidVerification` for speed or trusted input.
5. **Rust MST insertions can't cross heights** — build bottom-up, not top-down.
6. **Partial trees are normal in Go/Rust, exceptional in TS** — catch `MissingBlockError`.
7. **Go has `VerifyCommitSignatureFromCar`; others don't** — port adds DID resolution as a distinct step.
8. **Size limits at the CBOR layer are Go-only** — TS and Rust rely on higher layers.

## Related

- `shared/drisl.md` — normative canonical DAG-CBOR rules.
- `shared/car-v1.md` — normative CAR v1 framing.
- `shared/mst.md` — normative MST algorithm.
- `shared/commit-and-signing.md` — normative commit + signing rules, including §1.1 on `prev`.
- `shared/test-vectors.md` — fixtures for cross-language agreement testing.
- `{rust,typescript,go}/{README,drisl,car,mst,commit}.md` — per-language detail with back-references to this matrix.

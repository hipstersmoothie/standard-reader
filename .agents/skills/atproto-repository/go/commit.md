# Go — commit record, signing bytes, and verification wiring

`indigo/atproto/repo` ships a full end-to-end commit flow: the `Commit` struct, `UnsignedBytes()` for signing, `Sign` / `VerifySignature` for the crypto, and `VerifyCommitSignatureFromCar` which resolves the DID and wires it all together. Unlike the Rust crate, **Go provides the whole pipeline in-box** — you don't need to assemble your own verification loop unless you want custom identity resolution.

## Commit shape

```go
type Commit struct {
    DID     string   `json:"did" cborgen:"did"`
    Version int64    `json:"version" cborgen:"version"`   // always 3
    Prev    *cid.Cid `json:"prev" cborgen:"prev"`         // NOTE: no omitempty — see §prev-null-vs-omitted
    Data    cid.Cid  `json:"data" cborgen:"data"`
    Sig     []byte   `json:"sig,omitempty" cborgen:"sig,omitempty"`
    Rev     string   `json:"rev,omitempty" cborgen:"rev,omitempty"`
}

const ATPROTO_REPO_VERSION = 3
```

Source: `atproto/repo/commit.go:15`.

Struct-declaration order is `did, version, prev, data, sig, rev`. cbor-gen emits fields in declaration order, but the DRISL canonical order is bytewise: `data, did, prev, rev, sig, version`. **This mismatch is unexpected but harmless in practice**, because all indigo-produced commits round-trip through `MarshalCBOR` / `UnmarshalCBOR`, and verification re-marshals the same way via `UnsignedBytes()`. Cross-implementation verification still works because every implementation is canonical on the wire — only the Rust / Go serialization-time ordering differs, and each side verifies against its own re-marshal.

**However**, if you hand-construct a commit and feed it through a non-cbor-gen encoder (e.g. `atdata.MarshalCBOR` with a `map[string]any`), you'll get bytewise order — which is still valid DRISL, but the byte output will differ from cbor-gen's. Pick one path and stick to it.

## `prev`: null vs omitted

**Divergence that breaks cross-implementation signature verification if you miss it.**

The Go `Commit.Prev` field is `*cid.Cid` with `cborgen:"prev"` and **no `omitempty`**. The source comment at `commit.go:18` is explicit:

```go
Prev *cid.Cid `json:"prev" cborgen:"prev"` // NOTE: omitempty would break signature verification for repo v3
```

This means **Go always serializes `prev` as a key**. For a genesis commit (`Prev == nil`), the serialized map has 5 entries and the CBOR header is `a5`, with `prev` set to CBOR null (`0xF6`). Go matches the spec-strict shape.

The Rust reference impl does the opposite — it uses `#[serde(skip_serializing_if = "Option::is_none")]`, so a genesis commit has 4 entries (`a4` header) and no `prev` key at all.

Implications:

- If you're verifying a genesis commit produced by a Rust-based signer, re-marshaling through `Commit.UnsignedBytes()` will add `prev: null` and produce different bytes → signature won't verify.
- Strategy: for untrusted input, **verify from the raw signed-commit block bytes** — strip only the `sig` key without re-serializing other fields. Go's `UnsignedBytes()` does a full re-marshal, which defeats this.
- No in-box helper for sig-strip-from-raw-bytes exists. If you need it, walk the CBOR manually (decode to `atdata.UnmarshalCBOR`, delete `sig`, re-encode — but `atdata` canonicalizes on re-encode, which may still re-order keys relative to the original).
- For the 99% case (verifying commits produced by Go-based PDSes, which is most of atproto), `Commit.VerifySignature` works fine.

See `../shared/commit-and-signing.md` §1.1.

## Structural validation

```go
err := commit.VerifyStructure()
```

Checks:

1. `Version == 3` (otherwise `"unsupported repo version: N"`).
2. `len(Sig) != 0` (otherwise `"empty commit signature"`).
3. `DID` parses via `syntax.ParseDID` (full DID syntax, not just `did:` prefix).
4. `Rev` parses via `syntax.ParseTID` (13-char base32-sortable).

Does **not** verify the signature or the MST root. Runs structural/syntactic checks only.

Source: `atproto/repo/commit.go:25-41`.

## Signing bytes

```go
b, err := commit.UnsignedBytes()    // []byte
```

Behavior (`commit.go:61`):

- If `c.Sig == nil`: marshals `c` directly (the nil `Sig` field is omitted due to `omitempty`). Used when building a new commit before signing.
- If `c.Sig != nil`: constructs a temporary `Commit` copy with `Sig` zeroed but all other fields preserved, then marshals that. Used during verification.

Both paths produce the same bytes for the same logical unsigned commit.

**Warning**: because `UnsignedBytes` re-marshals through cbor-gen, the output reflects the indigo struct-declaration order. This is the "prev-null-vs-omitted" hook — the bytes are what cbor-gen emits, not necessarily what the original signer emitted.

## Signing

```go
import "github.com/bluesky-social/indigo/atproto/atcrypto"

priv, _ := atcrypto.GeneratePrivateKeyK256()   // or P-256; or load from PEM
commit := &repo.Commit{
    DID:     "did:plc:ewvi7nxzyoun6zhxrhs64oiz",
    Version: 3,
    Data:    mstRootCID,
    Prev:    nil,                               // genesis
    Rev:     syntax.NewTIDNow(0).String(),
}
if err := commit.Sign(priv); err != nil { return err }
// commit.Sig is now populated; the signature is raw r||s, low-S normalized.
```

`Sign` calls `privkey.HashAndSign(b)` on the unsigned bytes. `atcrypto` abstracts K-256 and P-256 — `PrivateKey` is an interface. `HashAndSign` handles the SHA-256 + ECDSA + low-S normalization + raw `r||s` encoding required by atproto.

Source: `atproto/repo/commit.go:83` and `atproto/atcrypto/`.

## Verification — low-level (you have the pubkey)

```go
if err := commit.VerifyStructure(); err != nil { return err }
if err := commit.VerifySignature(pubkey); err != nil {
    // Signature mismatch or corrupted commit.
    return err
}
```

`VerifySignature(pubkey atcrypto.PublicKey)` calls `pubkey.HashAndVerify(unsignedBytes, c.Sig)`. Returns `nil` on success, an error otherwise.

Source: `atproto/repo/commit.go:97`.

## Verification — wired end-to-end

```go
import (
    "github.com/bluesky-social/indigo/atproto/identity"
    "github.com/bluesky-social/indigo/atproto/repo"
)

dir := identity.DefaultDirectory()                    // or a cached/configured directory
commit, err := repo.VerifyCommitSignatureFromCar(ctx, dir, carBytes)
if err != nil { return err }
// commit is structurally valid AND signature-verified.
```

`VerifyCommitSignatureFromCar` (`atproto/repo/sync.go:179`) does:

1. `LoadCommitFromCAR` — parses the commit from the CAR (see `car.md`).
2. `commit.VerifyStructure()`.
3. `syntax.ParseDID(commit.DID)`.
4. `dir.LookupDID(ctx, did)` — resolves the DID document via the configured `identity.Directory` (DNS + well-known + PLC, with whatever caching the directory provides).
5. `ident.PublicKey()` — extracts the `#atproto` Multikey from the DID doc.
6. `commit.VerifySignature(pubkey)`.

Single call; no bespoke glue.

For firehose `#sync` events: `VerifySyncMessage(ctx, dir, msg)` wraps `VerifyCommitSignatureFromCar` over `msg.Blocks`.
For firehose `#commit` events (sig only): `VerifyCommitSignature(ctx, dir, msg)` — same thing for commits.

## Verification — inductive firehose (`VerifyCommitMessage`)

For `subscribeRepos #commit` events, there's more to verify than just the signature — you need to check that the operations in the event actually match the committed MST, and that inverting the operations reproduces the previous tree root. `VerifyCommitMessage` (`atproto/repo/sync.go:19`) handles this:

```go
repo, err := repo.VerifyCommitMessage(ctx, msg)
if err != nil { return err }
// repo is the new state with records accessible.
```

What it does:

1. Parses `did`, `rev`, `time` via `syntax.*`.
2. `LoadRepoFromCAR(ctx, msg.Blocks)` — parses the commit + MST + changed record blocks (partial tree OK; see `car.md`).
3. Checks `commit.Rev == msg.Rev` and `commit.DID == msg.Repo`.
4. For each `create`/`update` op, loads the referenced record from the blockstore and verifies the MST contains a matching CID at the op's path.
5. Parses `msg.Ops` into `Operation` values, normalizes, inverts each one against `repo.MST.Copy()`.
6. Computes the root of the inverted tree and compares to `msg.PrevData`.

Catches event fabrication: a relay can't forge ops that produce the committed MST root without holding the signing key, and `PrevData` check catches subtle corruption / replay.

**Does NOT verify the commit signature** — that's separate. Typically chain them:

```go
if err := repo.VerifyCommitSignature(ctx, dir, msg); err != nil { return err }
newRepo, err := repo.VerifyCommitMessage(ctx, msg)
```

Legacy-event handling: if any `delete` or `update` op has no `Prev`, the event predates the firehose format upgrade and the inductive check can't run. The function bails early with a log line (not an error) and returns the loaded repo.

## Rotation — verifying older commits

`dir.LookupDID` returns the **current** DID document. Older commits were signed under historical keys. `VerifyCommitSignatureFromCar` fails on key rotation with a signature mismatch.

indigo does not ship a historical-key lookup helper that's wired into the commit flow. To handle rotation yourself:

```go
// Pseudocode. See atproto-identity-resolution skill for PLC log walking.
if err := commit.VerifySignature(currentPubkey); err != nil {
    historicalKey := plcAuditLog.KeyAt(commit.Rev)   // requires your own PLC client
    if err := commit.VerifySignature(historicalKey); err == nil {
        // Verified under historical key.
    }
}
```

For `did:web`, historical DID documents aren't retrievable once rotated — those commits become permanently unverifiable.

## Sign → CAR flow

```go
import (
    "github.com/bluesky-social/indigo/atproto/repo"
    "github.com/bluesky-social/indigo/atproto/repo/mst"
    "github.com/bluesky-social/indigo/atproto/atcrypto"
    "github.com/bluesky-social/indigo/atproto/syntax"
    "github.com/ipld/go-car"
    blocks "github.com/ipfs/go-block-format"
)

// 1. Build/load the MST.
tree := mst.NewEmptyTree()
for _, op := range createsInAscendingKeyOrder {
    if _, err := tree.Insert(op.Path, op.Value); err != nil { return err }
}
rootCID, err := tree.RootCID()
if err != nil { return err }

// 2. Build commit.
commit := &repo.Commit{
    DID:     userDID,
    Version: 3,
    Data:    *rootCID,
    Prev:    prevCommitCID,    // nil for genesis
    Rev:     syntax.NewTIDNow(0).String(),
}
if err := commit.Sign(priv); err != nil { return err }

// 3. Serialize commit block.
commitBytes, err := commit.MarshalCBOR(...)   // via indigo's cbor-gen method
// or: buf := new(bytes.Buffer); commit.MarshalCBOR(buf); commitBytes = buf.Bytes()
commitCID, err := cidForBytes(commitBytes)    // compute CID via atcrypto or ipld helpers

// 4. Write CAR: header with roots=[commitCID], then commit block, then MST blocks, then record blocks.
header := car.CarHeader{Version: 1, Roots: []cid.Cid{commitCID}}
car.WriteHeader(&header, w)
car.WriteNode(w, blocks.NewBlockWithCid(commitBytes, commitCID))
// ... write MST diff blocks via tree.WriteDiffBlocks, then record blocks.
```

See `car.md` §"Writing — no first-party helper" for the CAR assembly, and `mst.md` §"Writing diffs" for the MST block stream.

## File pointers

| Concern                          | File                                               |
| -------------------------------- | -------------------------------------------------- |
| `Commit` struct + cborgen tags   | `atproto/repo/commit.go:15`                        |
| `VerifyStructure`                | `atproto/repo/commit.go:25`                        |
| `UnsignedBytes`                  | `atproto/repo/commit.go:61`                        |
| `Sign` / `VerifySignature`       | `atproto/repo/commit.go:83` / `:97`                |
| `ATPROTO_REPO_VERSION = 3`       | `atproto/repo/repo.go`                             |
| `VerifyCommitSignatureFromCar`   | `atproto/repo/sync.go:179`                         |
| `VerifyCommitMessage`            | `atproto/repo/sync.go:19`                          |
| `VerifySyncMessage` / `VerifyCommitSignature` | `atproto/repo/sync.go:167-177`        |
| `parseCommitOps`                 | `atproto/repo/sync.go:125`                         |
| Operation inversion              | `atproto/repo/operation.go`                        |
| `atcrypto.PrivateKey` / `PublicKey` | `atproto/atcrypto/`                             |
| `identity.Directory.LookupDID`   | `atproto/identity/`                                |
| `syntax.ParseDID` / `ParseTID`   | `atproto/syntax/`                                  |

## Common errors

| Error                                           | Cause                                                                                        |
| ----------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `unsupported repo version: N`                   | `Version != 3`. Legacy v2 commit or corruption.                                              |
| `empty commit signature`                        | `Commit.Sig` is nil/empty. `UnsignedCommit` submitted as `Commit`, or sig stripped.          |
| `invalid commit data: <did err>`                | `DID` doesn't parse via `syntax.ParseDID`. Truncated, malformed, or not a DID.               |
| `invalid commit data: <tid err>`                | `Rev` isn't a valid 13-char base32-sortable TID.                                             |
| `can not verify unsigned commit`                | Called `VerifySignature` on a commit with nil `Sig`.                                         |
| Sig verify fails under current key              | Account rotated; walk historical keys (PLC log) or accept unverifiable (did:web).            |
| Sig verify fails even with correct key          | Signer used DER-wrapped ECDSA. Must be raw `r‖s`, low-S. Or: prev-null-vs-omitted divergence. |
| `inverted tree root didn't match prevData`      | `VerifyCommitMessage`: ops don't reproduce `msg.PrevData`. Forged or corrupted event.         |
| `record op doesn't match MST tree value`        | `VerifyCommitMessage`: op's CID doesn't match what the committed MST contains at that path.   |

## See also

- `../shared/commit-and-signing.md` — language-neutral commit / signing rules, including §1.1 on `prev`.
- `drisl.md` — cbor-gen ordering notes and the `atdata` generic path.
- `mst.md` — `Tree.RootCID()` produces `commit.Data`.
- `car.md` — CAR assembly around the signed commit.
- `../shared/divergence-matrix.md` §commit — how this compares to Rust (reference-impl omits prev) and TypeScript.
- `atproto-identity-resolution` skill — `identity.Directory` configuration and PLC log walking for rotation.

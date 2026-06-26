# Go — `indigo/atproto/repo` setup

The Go reference lives in Bluesky's indigo monorepo at `github.com/bluesky-social/indigo/atproto/repo` plus the `mst` sub-package and the adjacent `atdata` and `atcrypto` packages. The doc comment on the `repo` package says it straight: *"works for processing a sync firehose, including validation of 'inductive firehose'. It does not yet work for implementing a repository host (PDS)."* Treat it as a strong **consumer** library — firehose verification, repo CAR loading, op inversion — rather than a PDS-side writer.

## Install

```bash
go get github.com/bluesky-social/indigo/atproto/repo
go get github.com/bluesky-social/indigo/atproto/repo/mst
go get github.com/bluesky-social/indigo/atproto/atdata
go get github.com/bluesky-social/indigo/atproto/atcrypto
go get github.com/bluesky-social/indigo/atproto/identity   # for sig verification
go get github.com/bluesky-social/indigo/atproto/syntax     # DID, TID, NSID, RecordKey parsing
```

The indigo module publishes multiple sub-packages. You'll pull a transitive chunk of `github.com/ipfs/*` (go-cid, go-block-format, go-ipfs-blockstore, go-ipld-format), `github.com/ipld/go-car`, and `github.com/whyrusleeping/cbor-gen`. That's expected — the package stands on the IPFS/IPLD Go ecosystem.

## Package map

| Package                                           | Handles                                                                             | See file              |
| ------------------------------------------------- | ----------------------------------------------------------------------------------- | --------------------- |
| `repo`                                            | `Repo`, `Commit`, `Operation`, CAR load, firehose sync verification.                 | `car.md`, `commit.md` |
| `repo/mst`                                        | `Tree`, `Node`, `NodeEntry`, on-wire `NodeData`/`EntryData`, insert/remove/verify.   | `mst.md`              |
| `atdata`                                          | `CIDLink`, `Bytes`, `Blob`; generic record decode (`UnmarshalJSON` / `UnmarshalCBOR`). | `drisl.md`          |
| `atcrypto`                                        | `PublicKey` / `PrivateKey` interfaces with `HashAndSign` / `HashAndVerify`.          | `commit.md`           |
| `syntax`                                          | `DID`, `TID`, `NSID`, `RecordKey`, `TIDClock`.                                      | (see `atproto-identity-resolution` skill) |

## Dependency surface (indirect, but worth knowing)

- `github.com/ipfs/go-cid` — CIDs. See `atproto-cid` skill for handling.
- `github.com/ipfs/go-block-format` (`blocks.Block`) — `(cid, bytes)` pair. `repo.RepoBlockSource.Get` returns these.
- `github.com/ipfs/go-ipfs-blockstore` (`blockstore.Blockstore`) — richer interface with `Put`. `Tree.WriteDiffBlocks` writes into one of these.
- `github.com/ipfs/go-ipld-format` — `ipld.ErrNotFound` is what `MSTBlockSource.Get` returns for missing blocks; `ipld.IsNotFound(err)` distinguishes "partial tree" from real errors.
- `github.com/ipld/go-car` — CAR v1 reader. The `repo` package uses it directly; you rarely touch it, but **it's v1-only** and v2 CARs aren't supported here.
- `github.com/whyrusleeping/cbor-gen` — generator for DAG-CBOR marshal/unmarshal. Generated code is checked in as `cbor_gen.go` in each package. If you add a new struct you serialize over the wire, you run `go generate` to regenerate.

## Public surface at a glance

From `atproto/repo/repo.go`:

```go
const ATPROTO_REPO_VERSION int64 = 3

type Repo struct {
    DID         syntax.DID
    Clock       *syntax.TIDClock
    RecordStore RepoBlockSource
    MST         mst.Tree
}

type RepoBlockSource interface {
    Get(ctx context.Context, cid cid.Cid) (blocks.Block, error)
}

var ErrNotFound = errors.New("record not found in repository")

func (r *Repo) GetRecordCID(ctx context.Context, collection syntax.NSID, rkey syntax.RecordKey) (*cid.Cid, error)
func (r *Repo) GetRecordBytes(ctx context.Context, collection syntax.NSID, rkey syntax.RecordKey) ([]byte, *cid.Cid, error)
func (r *Repo) Commit() (*Commit, error)   // snapshots the CURRENT state as an UNSIGNED Commit
```

From `atproto/repo/commit.go`:

```go
type Commit struct {
    DID     string   `cborgen:"did"`
    Version int64    `cborgen:"version"`   // 3
    Prev    *cid.Cid `cborgen:"prev"`       // NOTE: omitempty would break v3 sig verification
    Data    cid.Cid  `cborgen:"data"`
    Sig     []byte   `cborgen:"sig,omitempty"`
    Rev     string   `cborgen:"rev,omitempty"`
}

func (c *Commit) VerifyStructure() error
func (c *Commit) UnsignedBytes() ([]byte, error)
func (c *Commit) Sign(priv atcrypto.PrivateKey) error
func (c *Commit) VerifySignature(pub atcrypto.PublicKey) error
```

From `atproto/repo/car.go`:

```go
var ErrNoRoot = errors.New("CAR file missing root CID")
var ErrNoCommit = errors.New("no commit")

func LoadRepoFromCAR(ctx context.Context, r io.Reader) (*Commit, *Repo, error)
func LoadCommitFromCAR(ctx context.Context, r io.Reader) (*Commit, *cid.Cid, error)
```

From `atproto/repo/sync.go`:

```go
func VerifyCommitMessage(ctx context.Context, msg *comatproto.SyncSubscribeRepos_Commit) (*Repo, error)
func VerifyCommitSignature(ctx context.Context, dir identity.Directory, msg *comatproto.SyncSubscribeRepos_Commit) error
func VerifyCommitSignatureFromCar(ctx context.Context, dir identity.Directory, car []byte) (*Commit, error)
func VerifySyncMessage(ctx context.Context, dir identity.Directory, msg *comatproto.SyncSubscribeRepos_Sync) (*Commit, error)
```

From `atproto/repo/mst/tree.go`:

```go
type Tree struct { Root *Node }

var ErrInvalidKey   = errors.New("bytestring not a valid MST key")
var ErrPartialTree  = errors.New("MST is not complete")
var ErrInvalidTree  = errors.New("invalid MST structure")

func NewEmptyTree() Tree
func LoadTreeFromMap(m map[string]cid.Cid) (*Tree, error)
func LoadTreeFromStore(ctx context.Context, bs MSTBlockSource, root cid.Cid) (*Tree, error)

func (t *Tree) Insert(key []byte, val cid.Cid) (*cid.Cid, error)   // returns previous value
func (t *Tree) Remove(key []byte) (*cid.Cid, error)                 // returns previous value
func (t *Tree) Get(key []byte) (*cid.Cid, error)                    // nil if not found (not an error)
func (t *Tree) Walk(f func(key []byte, val cid.Cid) error) error
func (t *Tree) WriteToMap(m map[string]cid.Cid) error
func (t *Tree) RootCID() (*cid.Cid, error)
func (t *Tree) IsEmpty() bool
func (t *Tree) IsPartial() bool
func (t *Tree) Copy() Tree
func (t *Tree) Verify() error
func (t *Tree) WriteDiffBlocks(ctx context.Context, bs blockstore.Blockstore) (*cid.Cid, error)
```

## Typical wiring — load and read a repo CAR

```go
import (
    "context"
    "os"
    "github.com/bluesky-social/indigo/atproto/repo"
    "github.com/bluesky-social/indigo/atproto/syntax"
)

ctx := context.Background()
f, _ := os.Open("repo.car")
defer f.Close()

commit, r, err := repo.LoadRepoFromCAR(ctx, f)
if err != nil {
    return err
}
_ = commit  // *Commit, already structurally verified

recordMap := map[string]cid.Cid{}
_ = r.MST.WriteToMap(recordMap)

for path, cid := range recordMap {
    nsid, rkey, _ := syntax.ParseRepoPath(path)
    bytes, _, _ := r.GetRecordBytes(ctx, nsid, rkey)
    _ = bytes  // raw DAG-CBOR — decode with atdata.UnmarshalCBOR for generic map, or a typed struct
}
```

`LoadRepoFromCAR` calls `VerifyStructure` internally. The blockstore is a `TinyBlockstore` — an in-memory `map[string]blocks.Block`, unbounded; for big repos allocate your own `blockstore.Blockstore` and stream blocks in yourself.

## Typical wiring — verify a firehose commit

```go
import (
    "context"
    comatproto "github.com/bluesky-social/indigo/api/atproto"
    "github.com/bluesky-social/indigo/atproto/identity"
    "github.com/bluesky-social/indigo/atproto/repo"
)

dir := identity.DefaultDirectory()

// Structural + op invertibility check:
r, err := repo.VerifyCommitMessage(ctx, commitEvent)    // *SyncSubscribeRepos_Commit
if err != nil {
    return err
}

// Signature verification (resolves DID, pulls #atproto key, verifies):
if err := repo.VerifyCommitSignature(ctx, dir, commitEvent); err != nil {
    return err
}
_ = r
```

`VerifyCommitMessage` does a lot of work: loads the CAR, verifies commit structure, checks every record op's CID matches what's in the MST, parses ops, normalizes, inverts against the tree, and compares the post-inversion tree root to `msg.PrevData`. That's the "inductive firehose" check — a verifier that doesn't need the previous commit.

## Idioms

- **`context.Context` everywhere.** Every operation that could do I/O or be cancelled takes a `ctx`. Pass it through; don't use `context.TODO()` in production code.
- **Keys are `[]byte`, not `string`.** `Tree.Insert` / `Get` / `Remove` take `[]byte`. Convert with `[]byte(path)` where `path` is `<collection>/<rkey>`.
- **Previous-value return.** `Insert` and `Remove` return the pre-mutation CID as `*cid.Cid`. Use this to distinguish create / update / delete without a separate `Get` — the `Operation` struct in `repo/operation.go` depends on this.
- **Errors are values, not classes.** Package-level sentinels (`ErrNotFound`, `ErrNoRoot`, `ErrNoCommit`, `mst.ErrInvalidKey`, `mst.ErrPartialTree`, `mst.ErrInvalidTree`). Match with `errors.Is`. Other errors wrap with `fmt.Errorf("...: %w", err)`.
- **Partial trees are a feature.** A `Tree` can reference subtrees by CID only (`NodeEntry{ChildCID: ..., Child: nil}`). Methods that need the full tree return `ErrPartialTree`. This is how firehose events work: each event's CAR contains only the subtrees that changed.
- **Dirty bits drive writes.** `Node.Dirty` and `NodeEntry.Dirty` mark what's been mutated. `WriteDiffBlocks` writes only dirty nodes.

## When to use which package

| Want to…                                 | Use…                                                                                                       |
| ---------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Load a CAR and get records               | `repo.LoadRepoFromCAR` → `r.GetRecordBytes`                                                                |
| Pull just the commit out of a CAR        | `repo.LoadCommitFromCAR`                                                                                   |
| Verify a firehose `#commit` event        | `repo.VerifyCommitMessage` + `repo.VerifyCommitSignature`                                                  |
| Build an MST from a map of records       | `mst.LoadTreeFromMap(map[string]cid.Cid)` then `tree.RootCID()`                                            |
| Serialize / parse MST node bytes         | `mst.NodeData.Bytes()` / `mst.NodeDataFromCBOR(r)`                                                         |
| Decode a record to a generic `map`       | `atdata.UnmarshalCBOR(bytes)` or `atdata.UnmarshalJSON(bytes)`                                             |
| Sign / verify a commit                   | `commit.Sign(priv)` / `commit.VerifySignature(pub)`                                                        |

## Tests as ground-truth oracle

The interop tests under `atproto/repo/` and `atproto/repo/mst/` are the best cross-language oracles — they load CARs and MST fixtures from `testdata/` and check byte-exact output.

- `atproto/repo/inductive_interop_test.go` — end-to-end firehose commit verification against captured fixtures.
- `atproto/repo/mst/mst_interop_test.go` — MST node encode/decode and root-CID computation against fixtures.
- `atproto/repo/mst/util_interop_test.go` — `HeightForKey` + `CountPrefixLen` fixtures.
- `atproto/repo/mst/mst_test.go` — full `Tree.Insert` / `Remove` / `Get` / `Verify` round-trips.
- `atproto/repo/operation_test.go` — `ApplyOp` / `InvertOp` / `NormalizeOps`.
- `atproto/repo/sync_test.go` — firehose event verification.
- `atproto/repo/testdata/` and `atproto/repo/mst/testdata/` — fixture CARs and golden outputs usable from any language.

## See also

- `drisl.md` — `atdata` package, DAG-CBOR encoding, cbor-gen round-tripping.
- `car.md` — `LoadRepoFromCAR`, `LoadCommitFromCAR`, `TinyBlockstore`.
- `mst.md` — `Tree`, `Node`, `NodeEntry`, `HeightForKey`, partial-tree semantics.
- `commit.md` — `Commit`, `UnsignedBytes`, `Sign`, `VerifySignature`, end-to-end sig verification.
- `../shared/drisl.md`, `../shared/car-v1.md`, `../shared/mst.md`, `../shared/commit-and-signing.md` — language-neutral specs.
- `../shared/divergence-matrix.md` — how this compares to Rust (`atproto-dasl` / `atproto-repo`) and TypeScript (`@atproto/repo`).

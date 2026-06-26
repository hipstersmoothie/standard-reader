# Go — CAR v1 reading with `go-car` + indigo helpers

Go reads CARs through `github.com/ipld/go-car` (version 1 reader) and wraps repo-specific loading in `indigo/atproto/repo`. Writing CARs isn't in the consumer surface indigo exposes today — there's no `repo.CarWriter`. The supported flow is: **read a CAR, get a `*Repo`, get records out of it**. For writing, use `go-car` directly.

## Reading — `repo.LoadRepoFromCAR`

The high-level entry point:

```go
import (
    "context"
    "os"
    "github.com/bluesky-social/indigo/atproto/repo"
)

ctx := context.Background()
f, err := os.Open("repo.car")
if err != nil { return err }
defer f.Close()

commit, r, err := repo.LoadRepoFromCAR(ctx, f)    // *Commit, *Repo, error
if err != nil { return err }
```

What it does internally:

1. Creates a `repo.TinyBlockstore` (in-memory `map[string]blocks.Block`, unbounded).
2. Opens a `car.NewCarReader(r)` from `github.com/ipld/go-car`. **Only CAR v1** — `header.Version != 1` returns an error.
3. Requires `len(header.Roots) >= 1`. The first root is the commit CID.
4. Drains every block into the blockstore in sequence.
5. Fetches `commitCID` from the blockstore, unmarshals it as a `Commit`, calls `commit.VerifyStructure()`.
6. Loads the MST from `commit.Data` via `mst.LoadTreeFromStore` (see `mst.md`).
7. Returns `(*Commit, *Repo, error)` where `Repo.RecordStore` is the blockstore and `Repo.MST` is the loaded tree.

Source: `atproto/repo/car.go`.

Important notes:

- **`TinyBlockstore` is an unbounded `map[string]blocks.Block`.** For a multi-gigabyte repo export, this will OOM. If you expect large input, don't use `LoadRepoFromCAR`; open the CAR yourself (see §"Reading — lower-level" below) and stream blocks into a `blockstore.Blockstore` with spillover.
- **The CAR is fully drained before the commit is verified.** There's no early abort on a malformed mid-stream block — the reader will error at that block, but blocks that arrived earlier have already been stored. For untrusted input, wrap with a size cap on the reader (`io.LimitReader`) before passing to `LoadRepoFromCAR`.
- **Record CIDs aren't verified against their bytes.** `repo.go:65` has an explicit `// TODO: not verifying CID` — `GetRecordBytes` trusts the blockstore. If you need content verification, re-hash bytes yourself and compare to the CID after reading.

## Reading — just the commit

When you only care about the commit (e.g., to verify a signature before loading records):

```go
commit, commitCID, err := repo.LoadCommitFromCAR(ctx, f)    // *Commit, *cid.Cid, error
```

Walks blocks until it finds one whose CID equals `header.Roots[0]`, unmarshals it, verifies structure, returns. Remaining blocks are drained and discarded. Use this for signature verification without paying the full repo load cost.

Sentinel errors from both loaders:

- `repo.ErrNoRoot` — CAR header has empty `roots`.
- `repo.ErrNoCommit` — commit block not found in the CAR (only from `LoadCommitFromCAR`).
- Generic `fmt.Errorf` wraps for structure / version failures; match by substring if you have to, but `errors.Is` on `ErrNoRoot` / `ErrNoCommit` covers the common cases.

## Reading — lower-level (`go-car`)

When you need streaming control (bounded memory, progress reporting, per-block inspection):

```go
import (
    "github.com/ipld/go-car"
    "github.com/ipfs/go-cid"
    blocks "github.com/ipfs/go-block-format"
    "io"
)

cr, err := car.NewCarReader(r)
if err != nil { return err }

if cr.Header.Version != 1 {
    return fmt.Errorf("unsupported CAR version: %d", cr.Header.Version)
}
if len(cr.Header.Roots) < 1 {
    return repo.ErrNoRoot
}
commitCID := cr.Header.Roots[0]

for {
    blk, err := cr.Next()    // blocks.Block
    if err == io.EOF { break }
    if err != nil { return err }

    cid := blk.Cid()
    data := blk.RawData()
    // Inspect, store, filter as needed.
}
```

`blocks.Block` is `github.com/ipfs/go-block-format` — a (CID, bytes) pair. Content verification is not done by the reader; each block's CID on the wire is read from the frame, not re-computed. To verify, re-hash `data` through a CID builder (see `atproto-cid` skill) and compare.

`go-car` is CAR **v1 only** when using `car.NewCarReader`. For CAR v2 input, use `github.com/ipld/go-car/v2` — but AT Protocol repo CARs are all v1.

## Firehose framing

Each `com.atproto.sync.subscribeRepos` `#commit` event carries a `Blocks` field containing a minimal CAR. The framing is identical to a full repo CAR; the only difference is scope:

- Header with the new commit's CID in `roots`.
- Blocks: the new commit, changed MST subtree blocks, and new/changed record blocks.

Consumers pass `msg.Blocks` (a `[]byte`) directly to `LoadRepoFromCAR`:

```go
import (
    "bytes"
    comatproto "github.com/bluesky-social/indigo/api/atproto"
    "github.com/bluesky-social/indigo/atproto/repo"
)

commit, r, err := repo.LoadRepoFromCAR(ctx, bytes.NewReader([]byte(msg.Blocks)))
```

**Partial-tree gotcha:** the CAR carries only blocks that changed. MST subtrees that didn't change are referenced by CID but not included. `mst.LoadTreeFromStore` treats missing child blocks as "partial tree" (not an error) — it detects `ipld.ErrNotFound` and continues, leaving a `NodeEntry` with `ChildCID` set but `Child == nil`. Operations that walk partial trees return `mst.ErrPartialTree`. See `mst.md` §"Partial trees".

For firehose verification, the `repo.VerifyCommitMessage` helper handles the partial-tree dance automatically — see `commit.md`.

## Writing — no first-party helper

`indigo/atproto/repo` does not ship a CAR writer. To write a repo CAR yourself, use `go-car`:

```go
import (
    "github.com/ipld/go-car"
    blocks "github.com/ipfs/go-block-format"
)

header := car.CarHeader{
    Version: 1,
    Roots:   []cid.Cid{commitCID},
}
if err := car.WriteHeader(&header, w); err != nil { return err }

for _, blk := range allBlocksInRepo {
    if err := car.WriteNode(w, blk); err != nil { return err }
}
```

`car.WriteNode` writes each block as `varint(cid_len + data_len) || cid_bytes || data_bytes`. The `go-car` package handles varint framing and CID encoding; you provide ordered (CID, bytes) pairs.

Order: commit block first (or anywhere — the roots header declares which CID to find), then MST nodes in traversal order, then record blocks. Consumers don't rely on order; any permutation is valid. Dedupe by CID before writing — `go-car` doesn't check for duplicates.

For large exports from a real PDS, write to an `os.File` and use `bufio.Writer` to batch syscalls.

## Writing — producing a firehose delta CAR

Firehose `#commit` events carry only the blocks that changed between the previous commit and the new one: the new commit block, any MST nodes on the path from root to a changed leaf, and the new/changed record blocks themselves. Producing one from Go is a three-step dance:

```go
import (
    "bytes"
    "github.com/ipld/go-car"
    "github.com/ipfs/go-cid"
    blocks "github.com/ipfs/go-block-format"
)

// 1. Compute the block set. The caller has the prior MST root CID and the
//    new MST root CID. DiffTrees walks both and emits the adds/removals.
diff, err := mst.DiffTrees(ctx, bs, prevRootCID, newRootCID)
if err != nil { return nil, err }

// 2. Collect every CID that belongs in the delta CAR: the new commit block,
//    every "added" / "modified" MST node, and every new/changed record.
cids := []cid.Cid{newCommitCID}
for _, op := range diff.Adds      { cids = append(cids, op.NewCID) }
for _, op := range diff.Modifies  { cids = append(cids, op.NewCID) }

// 3. Write them out. Header roots = [newCommitCID]; blocks in any order.
var buf bytes.Buffer
header := car.CarHeader{Version: 1, Roots: []cid.Cid{newCommitCID}}
if err := car.WriteHeader(&header, &buf); err != nil { return nil, err }

for _, c := range cids {
    blk, err := bs.Get(ctx, c)
    if err != nil { return nil, err }
    if err := car.WriteNode(&buf, blk); err != nil { return nil, err }
}

deltaCar := buf.Bytes()   // use as msg.Blocks in a subscribeRepos #commit frame
```

`mst.DiffTrees` (in `atproto/repo/mst`) returns the structural delta. For a full producer pipeline a real PDS also emits the XRPC message framing around `Blocks` (sequence number, ops list, rev, commit CID) — out of scope here; see `indigo/atproto/data/firehose` for the framing helper.

Dedupe CIDs before writing (a record may be referenced by the commit data pointer and by an MST leaf). `go-car` does not dedupe.

## Blockstore backends

`repo.LoadRepoFromCAR` pins you to `TinyBlockstore`. To use a different blockstore (e.g., disk-backed), open the CAR yourself and stream blocks into your chosen store:

```go
import (
    blockstore "github.com/ipfs/go-ipfs-blockstore"
    "github.com/ipfs/go-datastore"
    leveldbds "github.com/ipfs/go-ds-leveldb"
)

ds, _ := leveldbds.NewDatastore("/path/to/blocks", nil)
bs := blockstore.NewBlockstore(ds)

cr, _ := car.NewCarReader(r)
for {
    blk, err := cr.Next()
    if err == io.EOF { break }
    if err != nil { return err }
    if err := bs.Put(ctx, blk); err != nil { return err }
}

commitBlk, _ := bs.Get(ctx, cr.Header.Roots[0])
var commit repo.Commit
_ = commit.UnmarshalCBOR(bytes.NewReader(commitBlk.RawData()))

tree, _ := mst.LoadTreeFromStore(ctx, bs, commit.Data)
r := &repo.Repo{
    DID: syntax.DID(commit.DID),
    MST: *tree,
    RecordStore: bs,    // any RepoBlockSource works
}
```

`repo.RepoBlockSource` is a tiny interface — just `Get(ctx, cid) (blocks.Block, error)`. Any `blockstore.Blockstore` satisfies it. For partial trees over a persistent store, this is the right shape.

## Block framing on the wire

Per block on the wire (inside the CAR):

```
varint(cid_len + data_len) || cid_bytes || data_bytes
```

`cid_bytes` is the **36-byte binary CID** (`0x01 0x71 0x12 0x20 <32-byte SHA-256>` for dag-cbor), not the 37-byte DAG-CBOR tag-42 form (which prepends identity multibase `0x00`). go-car handles this correctly; relevant only if you're debugging raw bytes.

See `../shared/car-v1.md` for the full frame diagram and `../atproto-cid/shared/binary-layout.md` for the 36-vs-37-byte distinction.

## File pointers

| Concern                             | File                                                      |
| ----------------------------------- | --------------------------------------------------------- |
| `LoadRepoFromCAR`, `LoadCommitFromCAR` | `atproto/repo/car.go`                                  |
| `ErrNoRoot`, `ErrNoCommit`          | `atproto/repo/car.go:18-19`                               |
| `TinyBlockstore`                    | `atproto/repo/tiny_blockstore.go`                         |
| `RepoBlockSource` interface         | `atproto/repo/repo.go:27`                                 |
| Underlying CAR v1 reader            | `github.com/ipld/go-car` (external)                       |
| `mst.LoadTreeFromStore`             | `atproto/repo/mst/tree.go:152`                            |
| `blocks.Block`                      | `github.com/ipfs/go-block-format` (external)              |
| `blockstore.Blockstore`             | `github.com/ipfs/go-ipfs-blockstore` (external)           |

## Common errors

| Error                              | Cause                                                                           |
| ---------------------------------- | ------------------------------------------------------------------------------- |
| `unsupported CAR file version: N`  | Header version ≠ 1. Probably a CAR v2 file; use `go-car/v2` directly.           |
| `CAR file missing root CID` / `ErrNoRoot` | Header has empty `roots`.                                                |
| `ErrNoCommit`                      | `LoadCommitFromCAR` couldn't find a block with CID = `roots[0]`.                |
| `reading commit block from CAR file: ...` | Commit CID wasn't in the CAR after full drain. Incomplete CAR.           |
| `parsing commit block from CAR file: ...` | Commit block bytes aren't valid DAG-CBOR for the `Commit` struct.        |
| `reading MST from CAR file: ...`   | Wraps errors from `mst.LoadTreeFromStore`. Often a missing MST block.           |
| `ipld.ErrNotFound{Cid: ...}`       | Blockstore lookup miss. For firehose events, expected for unchanged subtrees — treat as partial tree. |

## See also

- `../shared/car-v1.md` — byte-level CAR v1 spec.
- `drisl.md` — DAG-CBOR encoding underlying every block.
- `mst.md` — `mst.LoadTreeFromStore` + partial-tree semantics.
- `commit.md` — `VerifyCommitMessage` / `VerifyCommitSignature` that consume a CAR.
- `../shared/divergence-matrix.md` §car — no ship-in-box writer, `TinyBlockstore` unbounded; contrast with Rust `CarWriter` and `SpillableBuffer`.

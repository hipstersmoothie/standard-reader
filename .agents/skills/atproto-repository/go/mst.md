# Go — MST via `indigo/atproto/repo/mst`

`github.com/bluesky-social/indigo/atproto/repo/mst` implements the Merkle Search Tree with first-class support for **partial trees** (some nodes loaded, others referenced by CID only). This is the shape firehose events arrive in — the partial-tree machinery isn't an optional extra, it's central.

## Types

```go
type Tree struct {
    Root *Node
}

type Node struct {
    Entries []NodeEntry
    Height  int       // 0 at the bottom; the root has the highest height
    Dirty   bool      // cached CID is out of date
    CID     *cid.Cid  // last computed CID of this Node's NodeData encoding
    Stub    bool      // this node is just a CID reference, no entries loaded
}

type NodeEntry struct {
    Key      []byte     // non-nil when this entry is a key/value
    Value    *cid.Cid   // non-nil when this entry is a key/value
    ChildCID *cid.Cid   // non-nil when this entry is a child subtree reference
    Child    *Node      // non-nil when the child is loaded; nil for a partial tree
    Dirty    bool
}
```

Important: **`NodeEntry` can be either a key/value (`Key + Value`) or a child subtree (`ChildCID` ± `Child`)** — they never mix in the same entry. `IsValue()` returns `len(Key) > 0 && Value != nil`; `IsChild()` returns `Child != nil || ChildCID != nil`. The entry list alternates: a run of value entries can be followed by a child entry, followed by another run of value entries, and so on. Two child entries never appear adjacent (the `verifyStructure` check catches this).

`Height` is **not** serialized on the wire; it's computed on load from `HeightForKey` of the first value entry (see `ensureHeights`). A tree with only child entries at the top has no usable height until a descendant value is resolved.

Source: `atproto/repo/mst/node.go`, `atproto/repo/mst/tree.go`.

## On-wire format

The `NodeData` / `EntryData` structs in `atproto/repo/mst/encoding.go` are what gets serialized:

```go
type NodeData struct {
    Left    *cid.Cid    `cborgen:"l"`   // left subtree CID, nil if none
    Entries []EntryData `cborgen:"e"`
}

type EntryData struct {
    PrefixLen int64    `cborgen:"p"`    // shared prefix with prev entry's full key
    KeySuffix []byte   `cborgen:"k"`    // remaining bytes of this entry's full key
    Value     cid.Cid  `cborgen:"v"`    // CID of the record at this key
    Right     *cid.Cid `cborgen:"t"`    // right subtree CID, nil if none
}
```

cbor-gen serializes `NodeData.Left` first (the `l` field), then the `Entries` array. That matches bytewise order because `l` (0x6c) < `e` (0x65) — wait, actually `e` (0x65) < `l` (0x6c). The struct declares `Left` first but the **tag `l` > tag `e`**, so cbor-gen's declaration-order emission would be wrong.

Double-check this before trusting: inspect a real MST block from `testdata/` and verify the map key order on the wire. If cbor-gen emits out of bytewise order, either cbor-gen has been told to sort or the generated code sorts before writing. Either way, the root CIDs from `go-car/go-ipld-cbor` fixtures match Rust and TypeScript, so the on-wire order is correct in practice — but don't hand-extend the struct without re-checking.

### `NodeData.Bytes()` — the canonical encoder

```go
func (d *NodeData) Bytes() ([]byte, *cid.Cid, error)
```

Marshals to DAG-CBOR and computes the CID as `cid.NewPrefixV1(cid.DagCBOR, multihash.SHA2_256).Sum(bytes)`. This is exactly what the spec requires; use it directly if you're hand-building a tree.

Source: `atproto/repo/mst/encoding.go:31`.

### `Node.NodeData()` — in-memory → on-wire

`Node` (in-memory, child entries as pointers) transforms to `NodeData` (on-wire, child entries as CIDs) via `Node.NodeData()`. This:

- Moves the first child entry (if any) into `NodeData.Left`.
- Packs each run of value entries into `EntryData` records with prefix compression via `CountPrefixLen(prevKey, e.Key)`.
- Attaches each child entry after a value onto the previous `EntryData.Right`.

**Panics if any child entry has a nil `ChildCID`**. Compute CIDs for all children first (usually via `writeBlocks`).

### `NodeData.Node()` — on-wire → in-memory

`NodeData.Node(c *cid.Cid) Node` reverses the transform. It reconstructs full keys by running prefix reconstruction, creates `NodeEntry`s for each value, and inserts `ChildCID`-only `NodeEntry`s between them (and as the first entry, from `Left`).

Height is derived from the first value entry's `HeightForKey(key)`. Nested nodes don't have height on the wire; `ensureHeights()` propagates height down from a loaded parent.

## Key-level utilities

From `atproto/repo/mst/util.go`:

```go
const MAX_KEY_BYTES = 1024

func HeightForKey(key []byte) int   // SHA-256 leading-zero-bit-pairs count
func CountPrefixLen(a, b []byte) int
func IsValidKey(key []byte) bool    // non-empty, <= MAX_KEY_BYTES
```

### `HeightForKey` — fanout 4, despite the misleading comment

The source comment says "fanout 16", which is incorrect. The algorithm counts leading zero **bit pairs** — it increments height by the number of leading `00` bit pairs in the SHA-256 of the key. That gives a branching factor of 4 (probability ¼ that any given key has ≥1 more bit pair zero than the previous height). Matches Rust's `key_height` and TypeScript's `leadingZerosOnHash`; cross-language test vectors in `mst_interop_test.go` confirm it.

Don't read the comment; read the output against `../shared/mst.md` §2. Fanout 4.

### `CountPrefixLen` — prefix compression helper

Used in `Node.NodeData()` to compute `EntryData.PrefixLen` before serialization. First differing byte, bounded by the shorter string's length.

### `IsValidKey` — the only built-in validation

Just `len(key) > 0 && len(key) <= MAX_KEY_BYTES`. No charset check — the MST treats keys as opaque bytestrings. AT Protocol repos always use `<collection>/<rkey>` as the key shape, but that's enforced at a higher layer (`syntax.ParseRepoPath`), not here.

## `Tree` — the CRUD surface

```go
func NewEmptyTree() Tree
func LoadTreeFromMap(m map[string]cid.Cid) (*Tree, error)
func LoadTreeFromStore(ctx context.Context, bs MSTBlockSource, root cid.Cid) (*Tree, error)

func (t *Tree) Insert(key []byte, val cid.Cid) (*cid.Cid, error)   // previous value
func (t *Tree) Remove(key []byte) (*cid.Cid, error)                 // previous value
func (t *Tree) Get(key []byte) (*cid.Cid, error)                    // nil if not found, nil err

func (t *Tree) Walk(f func(key []byte, val cid.Cid) error) error
func (t *Tree) WriteToMap(m map[string]cid.Cid) error

func (t *Tree) RootCID() (*cid.Cid, error)
func (t *Tree) IsEmpty() bool
func (t *Tree) IsPartial() bool
func (t *Tree) Copy() Tree
func (t *Tree) Verify() error
func (t *Tree) WriteDiffBlocks(ctx context.Context, bs blockstore.Blockstore) (*cid.Cid, error)
```

Source: `atproto/repo/mst/tree.go`.

### Insert / Remove semantics

`Insert(key, val)` returns:

- `(nil, nil)` — key was not in tree, insertion succeeded (treat as **create**).
- `(&oldCid, nil)` where `oldCid == val` — no-op (the same value was already there).
- `(&oldCid, nil)` where `oldCid != val` — **update**.

`Remove(key)` returns:

- `(nil, nil)` — key was not in tree (no-op).
- `(&oldCid, nil)` — entry was removed.

Neither errors on "not found" — that's why `Get` also returns `(nil, nil)` for a miss. The typed error path (`ErrInvalidKey`, `ErrPartialTree`, `ErrInvalidTree`) is for structural problems, not lookup misses.

### Partial trees

A tree loaded from a firehose event's CAR is almost always **partial**: the CAR includes only the blocks needed to justify the new root, not the whole repo. Subtrees that didn't change are referenced by `ChildCID` but have no `Child` populated.

`t.IsPartial()` returns `true` iff any reachable node has an unresolved child. Operations that need to descend into an unloaded subtree return `mst.ErrPartialTree`:

- `Tree.Get(key)` — errors if the key would fall into an unloaded subtree.
- `Node.findInsertionIndex` — errors on `Stub` nodes or missing `Child` pointers.
- `Tree.Insert`, `Tree.Remove` — can error if the mutation requires reading an unloaded subtree.

The `verifyStructure` function at `atproto/repo/mst/verify.go:15` rejects partial trees outright (returns `"stub node"`). Use `t.Verify()` only on full trees.

**Firehose consumers use partial trees deliberately.** `VerifyCommitMessage` (see `commit.md`) inverts ops against a partial tree — it uses `tree.Copy()` and `InvertOp` on only the subtrees touched by the event, then compares the post-inversion root CID to `msg.PrevData`. If operations would need an unloaded subtree to complete, the firehose event is under-specified and verification errors cleanly.

### Stub and Dirty

Two independent flags:

- **`Stub: true`** — this node has no `Entries` loaded, just a CID. Used internally by inversion flows; not something you set directly.
- **`Dirty: true`** — the cached `CID` is out of date; re-encode before reading. `Insert`/`Remove` sets this; `RootCID()` clears it as it walks.

### `RootCID` — lazy re-encoding

```go
func (t *Tree) RootCID() (*cid.Cid, error)
```

If the root is clean and `CID` is set, returns the cached value. Otherwise walks the tree (via `writeBlocks(ctx, nil, true)`), re-encoding only dirty nodes, returns the new root CID. Note this mutates the tree — the `Dirty` flags get cleared.

### `WriteDiffBlocks` — persist only what changed

```go
func (t *Tree) WriteDiffBlocks(ctx context.Context, bs blockstore.Blockstore) (*cid.Cid, error)
```

Walks the tree and writes only dirty nodes to the blockstore. Returns the new root CID. Used by PDS-style writers to materialize a mutated tree incrementally — unchanged subtrees already live in the blockstore from a prior commit and are referenced by CID.

## Construction recipes

### From a sorted map (simplest)

```go
import (
    "github.com/bluesky-social/indigo/atproto/repo/mst"
    "github.com/ipfs/go-cid"
)

records := map[string]cid.Cid{
    "app.bsky.feed.post/3k5xabc": someCID,
    "app.bsky.feed.post/3k5xdef": anotherCID,
    // ...
}
tree, err := mst.LoadTreeFromMap(records)
if err != nil { return err }
root, err := tree.RootCID()
```

`LoadTreeFromMap` iterates the Go map (unordered — but that's fine since the MST is deterministic on the key set) and inserts each entry into an empty tree. The result's root CID is a deterministic function of the key set, not insertion order.

### From a blockstore (loading a live repo)

```go
tree, err := mst.LoadTreeFromStore(ctx, blockstore, rootCID)
```

Recursively loads every node reachable from `rootCID` into memory. If any child block is missing (`ipld.ErrNotFound`), the corresponding `NodeEntry` is left with `ChildCID` set and `Child` nil — the tree is partial, `IsPartial()` returns `true`.

### Encode a single node

```go
nd := node.NodeData()
bytes, cid, err := nd.Bytes()
```

For debugging / testing. Don't use this to build a full tree by hand — use `LoadTreeFromMap` and let the library compute CIDs.

## Verification

```go
func (t *Tree) Verify() error
```

Recursively checks (per `atproto/repo/mst/verify.go`):

- Root exists and isn't a stub.
- Every node has `Dirty == true || CID != nil`.
- Heights agree: a node's `Height` matches what `HeightForKey` says for every value entry.
- No sibling child entries (two child entries in a row).
- No entries that are both child and value.
- Keys are strictly ascending; no duplicates.
- Every value's key has `HeightForKey(key) == node.Height`.

Reject any failure; a repo that fails `Verify()` cannot be trusted to sync. **Does not accept partial trees** — if you've loaded a tree from a firehose event, skip this check (or verify only the loaded subtree manually).

## Diff — not a built-in flat function

Unlike Rust's `diff_entries`, Go doesn't ship a sorted-slice diff primitive. For a post-hoc diff of two repo states, walk both trees via `WriteToMap` and compute set differences yourself:

```go
oldMap := map[string]cid.Cid{}
newMap := map[string]cid.Cid{}
_ = oldTree.WriteToMap(oldMap)
_ = newTree.WriteToMap(newMap)

// adds := keys in newMap, not in oldMap
// updates := keys in both, with different CIDs
// deletes := keys in oldMap, not in newMap
```

This is O(N) and trivially correct — use it as an oracle.

For incremental firehose diffs, the library offers `repo.Operation` (`atproto/repo/operation.go`) and `InvertOp` / `ApplyOp` / `CheckOp` / `NormalizeOps` helpers — but these operate on a `Tree` and a list of per-path operations, not on tree-structural differences. See `commit.md` §"Operation inversion".

## File pointers

| Concern                            | File                                            |
| ---------------------------------- | ----------------------------------------------- |
| `Tree`, `ErrInvalidKey`, `ErrPartialTree`, `ErrInvalidTree` | `atproto/repo/mst/tree.go`    |
| `Node`, `NodeEntry` + helpers      | `atproto/repo/mst/node.go`                      |
| `Node.insert` (recursive)          | `atproto/repo/mst/node_insert.go`               |
| `Node.remove` (recursive)          | `atproto/repo/mst/node_remove.go`               |
| `NodeData`, `EntryData`, `Bytes()`, `Node.NodeData()` | `atproto/repo/mst/encoding.go` |
| cbor-gen output                    | `atproto/repo/mst/cbor_gen.go`                  |
| `HeightForKey`, `CountPrefixLen`, `IsValidKey` | `atproto/repo/mst/util.go`          |
| `Tree.Verify`                      | `atproto/repo/mst/verify.go`                    |
| Debug printing                     | `atproto/repo/mst/debug.go`                     |
| Interop / integration tests        | `atproto/repo/mst/mst_interop_test.go`, `mst_test.go` |

## Common errors

| Error                                   | Cause                                                                          |
| --------------------------------------- | ------------------------------------------------------------------------------ |
| `mst.ErrInvalidKey`                     | Key empty or > `MAX_KEY_BYTES` (1024).                                         |
| `mst.ErrPartialTree`                    | Operation needs a subtree that isn't loaded (firehose-event tree).             |
| `mst.ErrInvalidTree`                    | `Verify` found a structural problem (height mismatch, sibling children, etc.). |
| `stub node`                             | `Verify` hit a `Stub: true` node. Only expected during inversion.              |
| `out of order keys` / `duplicate key in tree` | Tree was constructed with unsorted or repeated keys.                    |
| `partial MST, can't determine insertion order` | Attempted `Insert` or descent into a node with `Stub: true` or missing `Child`. |
| `wrong height for key: N`               | A value entry's key has `HeightForKey != node.Height`. Hand-built tree is buggy. |
| `malformed tree node` (panic)           | `Node.NodeData` called while a child entry has nil `ChildCID`. Call `writeBlocks` first. |

## See also

- `../shared/mst.md` — language-neutral MST rules: node shape, key height, prefix compression, invariants.
- `drisl.md` — the CBOR layer `NodeData` / `EntryData` travel through.
- `car.md` — how MST nodes arrive in CARs (with partial-tree gotcha).
- `commit.md` — `VerifyCommitMessage` uses the partial-tree machinery for firehose event verification.
- `../shared/divergence-matrix.md` §mst — Go's partial-tree support vs Rust's full-tree assumption.

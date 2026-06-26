# Rust — MST construction, traversal, and diff

`atproto_repo::mst` is the Merkle Search Tree layer: the `Mst<S>` tree generic over a block storage, the `MstNode` / `TreeEntry` shapes on the wire, `key_height` for placement, and `diff_entries` for sync. All async, all tied to `BlockStorage`.

## Public surface

From `atproto-repo/src/lib.rs`:

```rust
pub use mst::{key_height, Mst, MstDiff, MstNode, TreeEntry};
```

Which gives you:

- `key_height(key: &str) -> u32` — SHA-256 leading-zero-bit-pairs. Deterministic placement.
- `Mst<S: BlockStorage>` — the in-memory tree view.
- `MstNode { left, entries }` — on-wire node shape.
- `TreeEntry { prefix_len, key_suffix, value, tree }` — on-wire entry shape.
- `MstDiff` — `Add { key, cid } | Update { key, old, new } | Delete { key, cid }`.

The full module also exposes helpers not re-exported at the crate root: `validate_key`, `compare_keys`, `common_prefix_len`, `KeyReconstructor`, `diff_entries`.

## Node shape (`MstNode`)

```rust
#[derive(Serialize, Deserialize)]
pub struct MstNode {
    #[serde(rename = "l", skip_serializing_if = "Option::is_none")]
    pub left: Option<Cid>,

    #[serde(rename = "e")]
    pub entries: Vec<TreeEntry>,
}
```

Serde field renames are the whole mapping to the on-wire format:

- `l` — left subtree CID. Omitted (not `null`) when absent. Omitting vs nulling is load-bearing: a `null` encoded as `0xf6` is a different byte sequence and produces a different node CID.
- `e` — entries, sorted by reconstructed key ascending (bytewise).

`MstNode` exposes lookup and traversal helpers directly:

- `find_entry(key_bytes)` — binary-search within the node.
- `find_insertion_point(key_bytes)` — where would this key go.
- `keys()`, `key_values()` — reconstruct all keys at this node via a running `KeyReconstructor`.
- `subtree_cids()` — iterate `left` + every `entry.tree` for prefetching / walk.

Source: `atproto-repo/src/mst/node.rs`.

## Entry shape (`TreeEntry`)

```rust
#[derive(Serialize, Deserialize)]
pub struct TreeEntry {
    #[serde(rename = "p")]
    pub prefix_len: u64,

    #[serde(rename = "k", with = "serde_bytes")]
    pub key_suffix: Vec<u8>,

    #[serde(rename = "v")]
    pub value: Cid,

    #[serde(rename = "t", skip_serializing_if = "Option::is_none")]
    pub tree: Option<Cid>,
}
```

`prefix_len` is the number of bytes shared with the **previous entry's reconstructed key**. For the first entry, it must be 0. For entries after, it must not exceed the previous reconstructed key's length.

Violating either rule raises `MstError::InvalidPrefix` at decode time.

### `KeyReconstructor`

`atproto-repo/src/mst/entry.rs:149` defines a tiny state machine that threads through the entry list:

```rust
use atproto_repo::mst::{KeyReconstructor, TreeEntry};

let mut kr = KeyReconstructor::new();
for entry in &node.entries {
    let full_key: Vec<u8> = kr.reconstruct(entry)?;   // Vec<u8>, not String — keys are bytes
    // `full_key` is the full reconstructed bytes; `entry.value` is the record CID.
}
```

`kr.reconstruct` returns `MstError::InvalidPrefix` if `entry.prefix_len` exceeds the previous key's length; use this directly when validating inbound trees before accepting them.

## Key height (`key_height`)

```rust
use atproto_repo::mst::key_height;

let h = key_height("app.bsky.feed.post/3k5xabc123def");
// Internally: count_leading_zero_bits(SHA-256(key)) / 2.
```

Fanout 4. ~75% of keys land at height 0, ~18.75% at height 1, ~4.7% at height 2, and so on. See `../shared/mst.md` §2 for the probability table.

Don't shave off the `/ 2`. Fanout 2 (the common mistake) makes a pathologically deep tree on any nontrivial key set.

Source: `atproto-repo/src/mst/key.rs:30`. The module also exports:

- `validate_key(&str) -> Result<(), MstError>` — charset / length check on a `<collection>/<rkey>` key. Reject keys > 1024 bytes, empty keys, or keys without exactly one `/`.
- `compare_keys(a, b) -> Ordering` — bytewise. Not code-point.
- `common_prefix_len(a, b) -> usize` — bytes, for computing `TreeEntry::prefix_len`.

## `Mst<S>` — the async tree view

```rust
use atproto_repo::mst::Mst;
use atproto_dasl::MemoryStorage;

let mut storage = MemoryStorage::new();
let mut tree = Mst::new(&mut storage).await?;         // empty tree, no root block yet
// or
let mut tree = Mst::load(&mut storage, root_cid).await?;  // hydrate from storage

let existing = tree.get("app.bsky.feed.post/3k5x...").await?;  // Option<Cid>
tree.insert("app.bsky.feed.post/3k5x...".to_string(), record_cid).await?;
tree.delete("app.bsky.feed.post/3k5x...").await?;

let root = tree.root_cid();                // Current root CID; None for an empty tree.
```

All reads and writes take `&mut storage` because a walk may need to fetch blocks and writes definitely produce new ones. Tree mutations create new node blocks and write them through `storage.put` — previously-reachable blocks aren't garbage-collected, so in-memory storage will accrete until you drop it or replace the storage entirely.

Source: `atproto-repo/src/mst/tree.rs`.

### Iteration

```rust
let mut stream = tree.entries();
while let Some((key, value_cid)) = stream.try_next().await? {
    // key: String, value_cid: Cid
}
```

Yields entries in bytewise-ascending key order. Walks left subtree → entry → right subtree recursively. `Mst::list_collection(collection)` is a convenience wrapper that filters to entries whose key starts with `"{collection}/"`.

### The `insert_recursive` limitation

**Read this before relying on `Mst::insert` / `Mst::delete` for non-trivial trees.**

`Mst::insert_recursive` at `src/mst/tree.rs:222` handles the single-node case — where the new key's height matches the current node's height — cleanly. It does **not** handle:

- **Cross-height inserts** that create a new root at a taller height than the current tree.
- **Subtree splits** where a newly-inserted key must bisect an existing subtree at a different level.
- **Delete-with-merge** on entries that own non-empty left/right subtrees.

For any tree with more than a few entries, build bottom-up from a sorted `(key, cid)` list:

```rust
use atproto_repo::mst::{key_height, MstNode, TreeEntry, common_prefix_len};
use atproto_dasl::{to_vec, MemoryStorage, compute_cid};

let mut sorted: Vec<(String, Cid)> = records_in_bytewise_order();
// Partition by height, emit nodes level by level, link via `left` / `tree`
// pointers. This is ~100 lines and gets the deterministic tree shape right.
```

An approximate recipe:

1. For each entry, compute `h = key_height(&key)`. Group entries by the maximum height on their row — that row's entries are the node's `entries` at height `h`.
2. At height 0, every entry emits as an entry directly; nodes above point to its position via `tree` links.
3. At each higher level, absorb the runs of height-`h−1` entries below into `left` / `tree` subtrees on the level-`h` nodes.
4. After emitting each node, DRISL-encode it (`to_vec`), compute its CID (`compute_cid`), and `storage.put(cid, bytes)`.
5. The final node's CID is the tree root.

Verify by reinserting records in randomized order into an empty `Mst` and checking that all produce byte-identical root CIDs. If they don't, the `insert_recursive` path hit its limitation.

See `../shared/mst.md` §7 for the cross-language version of this constraint.

## Diff — flat-list oracle

For sync, use the flat-list diff as a correctness reference:

```rust
use atproto_repo::mst::{diff_entries, MstDiff, DiffStats};

// old_entries and new_entries are both sorted `Vec<(String, Cid)>`
let diffs: Vec<MstDiff> = diff_entries(&old_entries, &new_entries);
let stats = DiffStats::from(&diffs);
// stats.added, stats.updated, stats.removed
```

Variants:

```rust
pub enum MstDiff {
    Add    { key: String, cid: Cid },
    Update { key: String, old: Cid, new: Cid },
    Delete { key: String, cid: Cid },
}
```

This walks two sorted slices in lockstep — O(N) on the combined size, trivially correct. It doesn't short-circuit on matching subtree CIDs, so for large repos prefer a tree-aware walker and use `diff_entries` as the oracle to verify correctness.

Source: `atproto-repo/src/mst/diff.rs`.

## Encoding a node by hand

```rust
use atproto_repo::mst::{MstNode, TreeEntry};
use atproto_dasl::{to_vec, compute_cid};

let node = MstNode {
    left: None,
    entries: vec![
        TreeEntry {
            prefix_len: 0,
            key_suffix: b"app.bsky.feed.post/3k5xabc".to_vec(),
            value: record_cid,
            tree: None,
        },
        TreeEntry {
            prefix_len: 19,
            key_suffix: b"def".to_vec(),
            value: record_cid_2,
            tree: None,
        },
    ],
};

let bytes = to_vec(&node)?;         // DRISL-strict
let cid = compute_cid(&bytes);      // dag-cbor CID
```

Key invariants before you encode a node by hand:

- First entry's `prefix_len == 0`.
- Each `key_suffix` decodes the full key ascending strictly greater than the previous.
- All entries in a node share the same `key_height` — the node's *implicit* height. Mixed heights in one node is a bug even if it encodes "fine."
- `left` and `tree` are `None` (not `Some(null)`) when absent.

## Invariants a verifier must enforce

Every node loaded from storage should pass these checks. The reference crate raises typed errors; match on them to surface specific failures:

| Check                                                                 | Error on violation              |
| --------------------------------------------------------------------- | ------------------------------- |
| Canonical DRISL DAG-CBOR                                              | `DecodeError::*`                |
| First entry's `p == 0`                                                | `MstError::InvalidPrefix`       |
| `p` ≤ previous reconstructed key's length                             | `MstError::InvalidPrefix`       |
| Entries sorted strictly ascending by reconstructed key                | `MstError::UnsortedEntries`     |
| Every `value` / `left` / `tree` is a dag-cbor CID                     | `MstError::InvalidCidCodec`     |
| All entries in the node share the same `key_height`                   | `MstError::MixedKeyHeights`     |
| Valid UTF-8 in each reconstructed key                                 | `MstError::InvalidKeyEncoding`  |

Reject on any violation; don't "heal" a non-conformant node — the producer is broken.

## File pointers

| Concern                                | File                                             |
| -------------------------------------- | ------------------------------------------------ |
| Public API                             | `atproto-repo/src/mst/mod.rs`; `src/lib.rs` re-exports |
| Key height, validate_key, compare_keys | `atproto-repo/src/mst/key.rs`                    |
| `TreeEntry`, `KeyReconstructor`        | `atproto-repo/src/mst/entry.rs`                  |
| `MstNode`, lookup helpers              | `atproto-repo/src/mst/node.rs`                   |
| DAG-CBOR round-trip (node)             | `atproto-repo/src/mst/serialize.rs`              |
| `Mst` CRUD, traversal                  | `atproto-repo/src/mst/tree.rs`                   |
| `diff_entries`, `MstDiff`, `DiffStats` | `atproto-repo/src/mst/diff.rs`                   |
| Integration tests                      | `atproto-repo/src/mst/tree.rs` at line 504+      |

## Common errors

| Error                                | Cause                                                                                |
| ------------------------------------ | ------------------------------------------------------------------------------------ |
| `MstError::InvalidPrefix`            | Entry's `p` exceeds previous key length, or first entry's `p != 0`. Bad encoder.     |
| `MstError::UnsortedEntries`          | Entries in a node not in bytewise ascending key order.                               |
| `MstError::InvalidKeyEncoding`       | Reconstructed key isn't valid UTF-8 or violates `validate_key` rules.                |
| `MstError::NodeNotFound`             | Subtree CID references a block missing from storage. Partial CAR or evicted block.   |
| `MstError::MixedKeyHeights`          | Entries in one node have different `key_height` values. Hand-built tree is buggy.    |
| `RepoError::InsertRecursiveLimit`    | Hit the `insert_recursive` cross-height case. Switch to bottom-up construction.      |

## See also

- `../shared/mst.md` — language-neutral MST rules and algorithms.
- `drisl.md` — canonical DAG-CBOR encoding (the encoder every MST node goes through).
- `car.md` — how MST nodes travel in a CAR.
- `commit.md` — the commit that seals `tree.root_cid()`.
- `../shared/divergence-matrix.md` §mst — how the Rust `Mst` compares to TypeScript (`@atproto/repo` `MST`) and Go (`indigo/atproto/repo/mst`).

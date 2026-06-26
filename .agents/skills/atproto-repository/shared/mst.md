# Merkle Search Tree (Reference)

Source of truth: https://atproto.com/specs/repository (§ "Merkle Search Tree").

An AT Protocol repository is a single Merkle Search Tree (MST) mapping string keys to record CIDs. The MST gives the repo three properties at once: ordered iteration, deterministic content addressing (each node has a stable CID), and cheap sync (unchanged subtrees share structure across commits, so deltas hit only the changed paths).

This reference file covers the node format, the key height rule, the placement invariants, prefix compression, and tree diffing. The companion file `car-v1.md` covers how these nodes travel on the wire; `commit-and-signing.md` covers the commit that seals the root CID.

## 1. Key shape

Every key in the tree is exactly `<collection>/<rkey>` where:

- `<collection>` is an NSID (`app.bsky.feed.post`, `com.atproto.repo.strongRef`).
- `<rkey>` is a TID (13-char base32-sortable) or a lexicon-permitted custom key (`self`, `[a-zA-Z0-9._~:-]{1,512}`).

Keys are compared **bytewise** (not by code-point or numeric TID value). Bytewise UTF-8 comparison over these characters is identical to ASCII order — no surprises — but the invariant is a bytewise sort, not a Unicode sort.

Full key rules live in `data-model.md`.

## 2. Key height — fanout 4

The *height* of a key determines which tree level it lives on. Pseudo-code:

```
height(key) = leading_zero_bits(SHA-256(key_utf8)) / 2
```

Dividing by 2 produces a branching factor of 4 — each layer holds roughly one quarter of the keys that the layer below has. Distribution:

| Height | Probability  | Cumulative  |
| ------ | ------------ | ----------- |
| 0      | ~75%         | 75%         |
| 1      | ~18.75%      | ~93.75%     |
| 2      | ~4.69%       | ~98.44%     |
| 3      | ~1.17%       | ~99.61%     |
| ≥ 4    | ~0.39%       | 100%        |

Every key is deterministically placed. Two clients that insert the same records in any order end up with the same tree, same node CIDs, same root CID. This is the whole point — the tree is content-addressed, not insertion-ordered.

### Why SHA-256, not the key's natural position?

Using the key directly (like a regular balanced tree would) would cluster TIDs near their creation time, producing a skewed tree that rebalances on every insert. Hashing spreads keys uniformly, and tying height to leading zero bits means the tree shape is a pure function of the key set — no rotation or rebalancing logic is ever needed.

### Reference implementation

See `atproto-repo/src/mst/key.rs`:

- `key_height(&str) -> u32` — returns `count_leading_zero_bits(SHA-256(key)) / 2`.
- `count_leading_zero_bits(&[u8]) -> u32` — count zero bits byte-by-byte from MSB.

## 3. Node shape

Each MST node is a DAG-CBOR map serialized canonically (DRISL rules, see `drisl.md`). Bytewise key order in the map:

| Key | Sort bytes    | Type     | Required | Meaning                                                                                    |
| --- | ------------- | -------- | -------- | ------------------------------------------------------------------------------------------ |
| `e` | `0x65`        | array    | yes      | Entries at this node, sorted by reconstructed key ascending (bytewise).                    |
| `l` | `0x6c`        | CID      | no       | Left subtree. All keys in that subtree are `<` the first entry's key. Omit when absent.    |

Each *entry* in `e` is itself a DAG-CBOR map:

| Key | Sort bytes | Type    | Required | Meaning                                                                                         |
| --- | ---------- | ------- | -------- | ----------------------------------------------------------------------------------------------- |
| `k` | `0x6b`     | bytes   | yes      | Key *suffix* — bytes after the prefix this entry shares with the previous entry's reconstructed key. |
| `p` | `0x70`     | integer | yes      | Length of the prefix shared with the previous entry's reconstructed key. `0` for the first entry. |
| `t` | `0x74`     | CID     | no       | Right subtree between this entry's key and the next entry's key. Omit when absent.              |
| `v` | `0x76`     | CID     | yes      | CID of the value — the record block for this entry.                                             |

The sort for entry fields under DRISL is `k`, `p`, `t`, `v` (bytewise: `0x6b < 0x70 < 0x74 < 0x76`). Getting that order wrong changes the node's CID.

### Field semantics in prose

- `l` points to a whole subtree of lower-keyed entries. There's at most one `l` per node.
- Each `t` on an entry points to a subtree that lives between that entry and the next. An entry without `t` means there are no keys strictly between this entry and the next.
- Omit `l` and `t` entirely when there is no subtree — **do not write `null`**. An encoded `null` is a different set of bytes and produces a different CID.

## 4. Prefix compression

Adjacent entries often share long prefixes (records in the same collection share `app.bsky.feed.post/`, for instance). MST nodes store each entry's full key as:

- `p` — how many leading bytes are shared with the **reconstructed previous key**.
- `k` — the remaining suffix bytes.

### Reconstruction algorithm

To recover the full key of entry *i*:

1. If *i = 0*, the key is exactly `k₀` and `p₀` must be 0.
2. For *i > 0*, reconstruct key *i−1* first, then:
   ```
   key_i = key_{i-1}[..p_i] + k_i
   ```

A streaming reader keeps a single "previous key" buffer and advances it each entry. See `KeyReconstructor` in `atproto-repo/src/mst/entry.rs:149`.

### Worked example

Keys `app.bsky.feed.post/abc`, `app.bsky.feed.post/def`, `app.bsky.feed.post/ghi` at a single node:

| i | Full key                   | `p` | `k`                         |
| - | -------------------------- | --- | --------------------------- |
| 0 | `app.bsky.feed.post/abc`   | 0   | `app.bsky.feed.post/abc`    |
| 1 | `app.bsky.feed.post/def`   | 19  | `def`                       |
| 2 | `app.bsky.feed.post/ghi`   | 19  | `ghi`                       |

### Invariants a strict reader must enforce

- `p` of the first entry must equal `0`.
- `p` must never exceed the length (in bytes) of the previous reconstructed key.
- The resulting key must sort strictly greater than the previous key (duplicates are forbidden; the tree is a map, not a multimap).

Violations raise `InvalidPrefix` or `InvalidNode` in the reference crate.

## 5. Traversal

To iterate in key order:

```
traverse(node):
    if node.l: traverse(load(node.l))
    prev_key = ""
    for entry in node.e:
        key = reconstruct(prev_key, entry.p, entry.k)
        yield (key, entry.v)
        if entry.t: traverse(load(entry.t))
        prev_key = key
```

That visits left subtree, then each entry followed by its right subtree, which produces sorted ascending order because:

1. Every key in `l` is `< e[0]`.
2. Every key in `e[i].t` is `> e[i]` and `< e[i+1]`.
3. Entries in `e` are themselves sorted.

See `Mst::entries()` and `collect_entries()` in `atproto-repo/src/mst/tree.rs:432`.

## 6. Lookup

To look up a key *K*:

```
lookup(node, K):
    walk entries in order, reconstructing keys:
        if reconstructed_key == K: return entry.v
        if reconstructed_key > K:
            // K, if it exists, is in the subtree to the left of this entry
            // (either node.l if this is entry 0, or prev_entry.t)
            recurse accordingly
            return
    // fell off the right: check the last entry's .t
```

A complete lookup costs O(log₄ N) nodes fetched from storage — each level of the tree divides the search by ~4. For a repo with 100,000 records, that's ≤ ~10 node fetches. Cache the root.

Reference: `Mst::get_recursive()` at `atproto-repo/src/mst/tree.rs:139`.

## 7. Insert — the tricky one

Inserting `(K, V_cid)`:

1. Compute `h = key_height(K)`.
2. Walk down the tree from the root. At each node:
   - If `h == node_height`, the key belongs at this node. Find the bytewise sort position, insert an entry, and **recompute prefix compression on the entry immediately after** (its `p`/`k` are now relative to a different previous key).
   - If `h < node_height`, descend into the subtree that brackets `K` (either `l` or the `t` of the preceding entry).
   - If `h > node_height`, a new node at height `h` must be created above this point, and the existing subtree becomes a child of the new node (split on the position of `K`).
3. Each modified node produces a fresh CID. The chain of fresh CIDs up to the root is the new MST root.
4. Previously unchanged nodes keep their old CIDs and are reused — that's the structural sharing that makes sync cheap.

Insert is where most bugs live. The reference `atproto-repo` crate's `Mst::insert_recursive` (`src/mst/tree.rs:222`) handles only the simple within-node case cleanly; users with inserts that cross heights are expected to build the tree bottom-up from sorted records and recompute node boundaries, not rely on a recursive insert. Verify any insert implementation by checking that repeated inserts in randomized order all produce byte-identical root CIDs.

## 8. Delete

Deleting `K`:

1. Lookup the node holding `K`. Remove the entry.
2. If the deleted entry had a right subtree (`t`) or the surrounding entries had bracketing subtrees, **merge** them — their contents must be stitched back into the node or promoted to replace the deleted boundary. The simplest correct implementation: collect every `(key, cid)` pair from the deleted region's subtrees, and re-insert them into the tree from scratch.
3. If the node becomes empty and has no subtrees, it's removed; its parent sheds a pointer.
4. Recompute prefix compression on the entry that now follows the gap.
5. Propagate up: each ancestor is re-serialized (its child CID changed), producing a new root CID.

The reference `Mst::delete_recursive` handles simple cases only; the same caveat as insert applies.

## 9. Invariants a verifier must check

On every node loaded from storage, require:

- **Canonical DAG-CBOR** (DRISL). A non-canonical encoding changes the CID; if the CID claimed on the block doesn't match, treat as corrupt.
- **Map keys exactly `e`, optionally `l`**. No extras, no `null` placeholders.
- **Entries sorted ascending** by reconstructed key, bytewise, strictly.
- **First entry's `p == 0`**.
- **All entry keys reconstruct successfully** — no `p` exceeding the previous key's length, all `k` valid UTF-8.
- **All referenced CIDs are dag-cbor CIDs** (SHA-256, 32-byte digest) for subtrees and values alike. No `raw`-codec CIDs for tree structure.
- **All entries in a node share the same key height.** A node's height is not stored on the wire — compute `key_height` for each reconstructed key and require they all agree. The node's implicit height is that shared value. Mixed-height entries in a single node are a bug.

Repos that fail these checks cannot be safely synced; reject and surface the specific violation.

## 10. Diff — the sync primitive

Two roots `R_old` and `R_new`. Walk both trees with a merged iterator:

- Advance through entries in sorted key order on both sides.
- At each step:
  - Key only in old → `Delete`.
  - Key only in new → `Add`.
  - Key in both, same value CID → no-op (skip).
  - Key in both, different value CID → `Update`.

The content-addressed tree lets you short-circuit: whenever two subtree CIDs on the old and new sides are equal, the entire subtree is unchanged — you can skip descending into it entirely. For tiny diffs (one record added to a 100k-record repo), this reduces the work from O(N) to O(log N).

The reference crate exposes this as a flat-list diff in `atproto-repo/src/mst/diff.rs`:

- `diff_entries(old, new) -> Vec<MstDiff>` on two sorted `(String, Cid)` slices.
- `MstDiff::{Add, Update, Delete}` variants with the key and CID(s).
- `DiffStats` for counts.

The flat-list version is O(N) per diff but trivially correct; use it as a reference oracle when testing a CID-short-circuiting walker.

## 11. Storage

The tree doesn't prescribe how nodes are stored. Typical choices:

- **In-memory**: `HashMap<Cid, Bytes>`. Fine for small repos and tests.
- **On-disk**: SQLite table keyed by CID, or a raw files-on-disk layout indexed by CID.
- **Remote**: the PDS holds the canonical tree; clients fetch blocks on demand via `com.atproto.sync.getBlocks`.

The `atproto-dasl::storage` module exposes `BlockStorage` with `MemoryStorage` and `DiskStorage` implementations. Any consumer-built storage must:

- Return the exact bytes stored (no re-encoding).
- Preserve (CID, bytes) as an immutable pair — never overwrite a CID with different bytes.
- Handle a `get` for an unknown CID by returning "not found" rather than producing bytes.

## 12. Relationship to commits

An MST root CID is just a CID — it says nothing about ownership or revision. That's the commit's job:

```
Commit { did, version: 3, data: <mst_root_cid>, rev: <tid>, prev: <cid?>, sig: <bytes> }
```

The commit fixes the tree root at a point in time, binds it to a DID, and is signed by that DID's atproto signing key. See `commit-and-signing.md` for the exact signing bytes.

A repo's identity is `(did, commit_cid)` — the tree root CID alone is not enough to identify a particular repo state, because two accounts could theoretically converge on the same set of records at the same time and produce identical tree roots.

## 13. Common errors

| Symptom                                          | Likely cause                                                                             |
| ------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| `NodeNotFound`                                   | The referenced subtree block isn't in the block store. CAR was incomplete; re-sync.       |
| `InvalidPrefix` / `prefix_len exceeds previous`  | Node was hand-constructed. Check the first entry has `p == 0` and each `p` stays within bounds. |
| Root CID differs after reinserting same records  | Non-deterministic encode path — most likely unsorted map keys or non-canonical integer form. Verify `drisl.md` compliance. |
| Tree depth explodes on small repos               | Missing `/ 2` in height calc — raw leading-zero-bit count gives fanout 2, which is pathological. |
| Update produces a new root CID but `entries()` returns stale data | Old root pinned somewhere; replace with new root everywhere before re-reading. |
| Diff reports Update for a record whose JSON is identical | Record encoder is non-canonical — re-encoding the "same" record produces different bytes, hence a different CID. Check field order. |

# Rust — `atproto-dasl` / `atproto-repo` / `atproto-record` setup

The Rust reference stack is split across three crates, each layered on the one below. Depending only on the top one (`atproto-record`) pulls the full stack via re-exports, but most repo tooling lives at `atproto-repo` and doesn't need the record-layer types.

All three crates are published on crates.io / docs.rs ([`atproto-dasl`](https://docs.rs/atproto-dasl), [`atproto-repo`](https://docs.rs/atproto-repo), [`atproto-record`](https://docs.rs/atproto-record)). Source: <https://tangled.org/ngerakines.me/atproto-crates>.

## Install

For a general repo reader / writer:

```toml
[dependencies]
atproto-repo = "0.14"          # MST + commit + Repository
```

For byte-level work (DRISL, CAR, CID, storage) only:

```toml
[dependencies]
atproto-dasl = "0.14"
```

For record-layer work (TIDs, AT-URIs, typed lexicon records):

```toml
[dependencies]
atproto-record = "0.14"        # pulls atproto-dasl and atproto-identity
```

All three are DRISL-strict by default and reject non-canonical encodings out of the box.

## Crate map

| Crate            | Handles                                                                                                    | See file |
| ---------------- | ---------------------------------------------------------------------------------------------------------- | -------- |
| `atproto-dasl`   | CBOR/DRISL (encode/decode), CIDs, CAR v1 reader/writer, block storage, varints. The byte-level layer.      | `drisl.md`, `car.md` |
| `atproto-repo`   | MST (node, entry, tree, key height, diff), signed commit, `Repository` assembly. The structural layer.     | `mst.md`, `commit.md` |
| `atproto-record` | TIDs, AT-URIs, typed record dispatch (`$type` → struct), facets, lexicon-specific types. Semantic layer.   | Not covered in this skill — see `atproto-cid` for CIDs and `atproto-lexicon` for record parsing and typed dispatch. |

Each crate re-exports the ones below it. Consumers can usually depend only on `atproto-repo` and pull `atproto_dasl::to_vec`, `atproto_dasl::CarReader`, etc. through its re-exports.

### Public surface at a glance

From `atproto-dasl/src/lib.rs`:

```rust
pub use cid::{Cid, CidCore, DaslCid, RawCid, DAG_CBOR_CODEC, MULTIBASE_IDENTITY, …};
pub use drisl::{from_slice, from_slice_non_strict, to_vec, …};
pub use car::{CarBlock, CarConfig, CarHeader, CarReader, CarWriter, LimitsConfig};
pub use storage::{BlockStorage, DiskStorage, MemoryStorage, SpillableBuffer, SpillableReader};
pub use errors::{CarError, DaslCidError, DecodeError, EncodeError, StorageError, VarintError};
```

From `atproto-repo/src/lib.rs`:

```rust
pub use mst::{key_height, Mst, MstDiff, MstNode, TreeEntry};
pub use repo::{Commit, DiskRepository, MemoryRepository, RecordPath, Repository};
// Re-exports from atproto-dasl for convenience:
pub use atproto_dasl::car::{CarBlock, CarConfig, CarHeader, CarReader, CarWriter};
pub use atproto_dasl::storage::{BlockStorage, DiskStorage, MemoryStorage, SpillableBuffer, SpillableReader};
pub use atproto_dasl::cid::{DAG_CBOR_CODEC, SHA256_CODE, compute_cid};
```

## Typical wiring — load and read a repo CAR

The shortest path to "give me every record in this repo":

```rust
use atproto_repo::{MemoryRepository, RecordPath};
use atproto_repo::config::RepoConfig;
use tokio::fs::File;

let file = File::open("repo.car").await?;
let repo = MemoryRepository::from_car(file, RepoConfig::default()).await?;

for collection in repo.list_collections().await? {
    for rkey in repo.list_collection(&collection).await? {
        let path = RecordPath::new(&collection, &rkey);
        let record_bytes = repo.get_record_bytes(&path).await?;
        // record_bytes is the raw DAG-CBOR block; decode as needed.
    }
}
```

`MemoryRepository::from_car` takes an `AsyncRead` source, parses the CAR header, loads every block into an in-memory `BlockStorage`, locates the commit from the CAR's root, and constructs an `Mst` over `commit.data`. For streams you don't want to buffer, use `DiskRepository::from_car` — same API, spills blocks to a temp directory.

## Typical wiring — build a fresh repo from records

```rust
use atproto_repo::{Mst, Commit, MemoryRepository};
use atproto_repo::config::RepoConfig;
use atproto_dasl::{MemoryStorage, to_vec, compute_cid};

let mut storage = MemoryStorage::new();
let mut mst = Mst::new(&mut storage).await?;

for (path, record_value) in records {
    let record_bytes = to_vec(&record_value)?;       // DRISL-strict
    let record_cid = compute_cid(&record_bytes);
    storage.put(record_cid, record_bytes).await?;
    mst.insert(path.to_mst_key(), record_cid).await?;
}

let root_cid = mst.root_cid();
let unsigned = UnsignedCommit { did, version: 3, data: root_cid, rev, prev: None };
let signing_bytes = unsigned.signing_bytes();
let sig = your_ecdsa_signer(&signing_bytes);
let commit = unsigned.sign(sig);
```

See `mst.md` for the caveats on `insert` — the reference impl's recursive insert handles only the single-node case cleanly; for serious writers, build bottom-up from sorted `(key, cid)` pairs.

## Idioms

- **Async everywhere.** `atproto-repo` uses `async` throughout because block storage is pluggable (disk, network). Wrap async code in a runtime (`tokio::main` or `tokio::runtime::Runtime`).
- **`BlockStorage` is the seam.** Swap `MemoryStorage` for `DiskStorage` / `SpillableBuffer` / your own implementation. The MST and `Repository` APIs don't change.
- **Errors are typed enums.** `MstError`, `CarError`, `DaslCidError`, `RepoError` all derive `thiserror::Error` with structured variants. Match exhaustively instead of string-matching.
- **`compute_cid` is dag-cbor by default.** It's the right call for record and MST-node CIDs; for blob CIDs (raw codec), build the CID explicitly.
- **DRISL strict by default.** `from_slice` and `to_vec` are the strict paths. Reach for `from_slice_non_strict` only when reading legacy, externally-sourced data — never pair it with a re-encode.
- **No panics on normal input.** The library panics only on things like NaN/Infinity passed to `to_vec` (which is a programming error). Every I/O / protocol failure is an `Err`.

## When to use which crate

| Want to…                                | Use…                                                                                |
| --------------------------------------- | ----------------------------------------------------------------------------------- |
| Read a CAR and get records              | `atproto_repo::MemoryRepository::from_car`                                          |
| Encode/decode DAG-CBOR values           | `atproto_dasl::{to_vec, from_slice}`                                                |
| Build a CAR from blocks                 | `atproto_dasl::CarWriter::new(writer, roots)` then `.write_block(cid, data)`        |
| Stream-parse a CAR                      | `atproto_dasl::CarReader::new(reader)` — yields `(Cid, Bytes)` pairs.               |
| Build a custom MST by hand              | `atproto_repo::mst::{MstNode, TreeEntry, Mst, key_height}`                          |
| Parse a TID or AT-URI                   | `atproto_record::{Tid, ATURI}`                                                       |
| Sign / verify a commit                  | `atproto_repo::Commit::signing_bytes()` + your ECDSA library. See `commit.md`.      |
| Diff two MSTs                           | `atproto_repo::mst::{diff_entries, MstDiff, DiffStats}`                             |

## Tests as ground-truth oracle

Every crate ships unit tests adjacent to each module (`mod tests` blocks at the bottom of each `*.rs`) and integration tests under `tests/`. When implementing compatibility in another language, the fastest check is to take a vector from these tests, run it through both implementations, and compare byte-for-byte.

Key test modules to read when debugging:

- `atproto-dasl/src/drisl/` — golden CBOR vectors.
- `atproto-dasl/src/cid/mod.rs` tests — CID round-trips.
- `atproto-repo/src/mst/tree.rs` tests at line 504+ — MST insert/get/delete/entries.
- `atproto-repo/src/repo/commit.rs` tests at line 256+ — commit shape and signing bytes.
- `atproto-record/src/tid.rs` tests at line 371+ — TID encode/decode, monotonicity.
- `atproto-record/src/aturi.rs` tests at line 116+ — AT-URI accept/reject cases.

## See also

- `drisl.md` — DAG-CBOR encoding and decoding in Rust.
- `car.md` — `CarReader` / `CarWriter` flows and block storage.
- `mst.md` — `Mst`, `MstNode`, `TreeEntry`, the known `insert_recursive` limitation.
- `commit.md` — `Commit`, `UnsignedCommit`, signing bytes, signature verification wiring.
- `../shared/drisl.md`, `../shared/car-v1.md`, `../shared/mst.md`, `../shared/commit-and-signing.md` — language-neutral specs that these files implement.
- `../shared/divergence-matrix.md` — how this stack compares to TypeScript and Go.

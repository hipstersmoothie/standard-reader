# Rust — CAR v1 reader and writer

`atproto-dasl::car` provides an async streaming CAR v1 reader and writer. The reader produces `(Cid, Bytes)` pairs after parsing the DAG-CBOR header; the writer frames varints and enforces no-duplicate-CIDs on the way out. Both are tied to `tokio::io::{AsyncRead, AsyncWrite}`.

## Reading

```rust
use atproto_dasl::car::{CarReader, CarConfig, LimitsConfig};
use tokio::fs::File;

let file = File::open("repo.car").await?;
let mut reader = CarReader::new(file).await?;

// Header is parsed during `new`; access it via:
let header = reader.header();
let roots: &[Cid] = header.roots();

// Drain blocks as (Cid, Bytes):
while let Some((cid, bytes)) = reader.try_next().await? {
    // Every block is verified: the CID header inside the block frame must
    // match a DASL dag-cbor CID shape (36 bytes), and re-hashing `bytes`
    // through the codec must match `cid`. Failures bubble up as CarError.
}
```

Or drain into a block store directly:

```rust
use atproto_dasl::{MemoryStorage, BlockStorage};

let mut storage = MemoryStorage::new();
reader.stream_to_storage(&mut storage).await?;

// Now `storage.get(root_cid).await?` returns the commit block bytes.
let commit_bytes = storage.get(roots[0]).await?;
```

`CarReader::with_config(reader, CarConfig)` lets you set `LimitsConfig`:

- `max_block_size` — reject blocks larger than this. Useful to cap memory for adversarial CARs.
- `max_blocks` — reject CARs with more than N blocks.
- `max_header_size` — reject oversized headers.

Defaults are generous but finite. For CARs from untrusted sources (firehose consumers fetching from arbitrary PDSs), tighten these.

### Streaming over the network

`CarReader` is generic over any `AsyncRead`, so an HTTP response body from `reqwest` plugs in directly:

```rust
let resp = reqwest::get("https://pds.example/xrpc/com.atproto.sync.getRepo?did=…")
    .await?;
let stream = resp.bytes_stream();
let reader = tokio_util::io::StreamReader::new(
    stream.map_err(|e| std::io::Error::new(std::io::ErrorKind::Other, e)),
);
let mut car = CarReader::new(reader).await?;
```

Blocks are validated as they're parsed, so a malformed CAR aborts early rather than after buffering the whole stream.

## Writing

```rust
use atproto_dasl::car::CarWriter;
use tokio::fs::File;

let file = File::create("out.car").await?;
let mut writer = CarWriter::new(file, vec![commit_cid]).await?;

writer.write_block(commit_cid, &commit_bytes).await?;
for (cid, bytes) in mst_blocks {
    writer.write_block(cid, &bytes).await?;
}
for (cid, bytes) in record_blocks {
    writer.write_block(cid, &bytes).await?;
}

writer.finish().await?;
```

Contract:

- `write_block` rejects a duplicate CID within the same CAR. Pre-dedupe if your producer might emit the same block twice.
- Blocks may appear in any order; consumers don't rely on ordering. A common choice is: commit first, then MST nodes in traversal order, then record blocks.
- `finish` is required to flush the underlying writer. Dropping without `finish` leaves the file truncated.

### Block framing

Each block on the wire is:

```
varint(cid_len + data_len) || cid_bytes || data_bytes
```

`cid_bytes` in CAR framing is the **36-byte binary CID** (no identity multibase prefix) — `0x01 0x71 0x12 0x20 <32-byte digest>` for a dag-cbor CID. That's one byte shorter than the 37-byte DAG-CBOR tag-42 form, which prepends `0x00`. The writer gets this right; hand-rolling is a footgun. See `atproto-cid/rust/codecs.md`.

## Block storage backends

`atproto_dasl::storage::BlockStorage` is the trait CAR readers / writers and the MST tree plug into:

```rust
#[async_trait]
pub trait BlockStorage {
    async fn get(&self, cid: Cid) -> Result<Option<Bytes>, StorageError>;
    async fn put(&mut self, cid: Cid, data: Bytes) -> Result<(), StorageError>;
    async fn has(&self, cid: Cid) -> Result<bool, StorageError>;
    async fn remove(&mut self, cid: Cid) -> Result<(), StorageError>;
}
```

Shipped implementations:

| Type                  | Backing                                     | Notes                                                           |
| --------------------- | ------------------------------------------- | --------------------------------------------------------------- |
| `MemoryStorage`       | `HashMap<Cid, Bytes>`                       | Simplest. Fine for ≤ low-millions of blocks.                    |
| `DiskStorage`         | Files in a directory, one per CID           | Survives process restart. Slower for small writes.              |
| `SpillableBuffer`     | Memory-backed until a threshold, then tempfile | Stream-accumulate a CAR without RAM blow-up; `SpillableReader` is the read-side twin. |

Custom implementations are one trait impl. The invariants:

- `(cid, bytes)` is immutable — never overwrite a CID with different bytes.
- `get` on an unknown CID returns `Ok(None)`, not an error.
- Return the bytes you were handed, byte-for-byte — no re-encoding.

## Firehose framing

`com.atproto.sync.subscribeRepos` events wrap a minimal CAR in each event payload. The framing is identical to a full repo CAR, just smaller:

- Header with the new commit's CID in `roots`.
- Blocks: the commit block, plus only the MST subtree blocks that changed, plus any new/changed record blocks.

A consumer joins each event's blocks into a persistent `BlockStorage`. Blocks for already-known subtrees are referenced by CID and are expected to already be in storage. Don't assume every block needed is present in the current event's CAR — that's how partial-sync works.

See `atproto-dasl/src/car/reader.rs` for the raw reader; firehose event decoding is layered on top.

## File pointers

| Concern                 | File                                                              |
| ----------------------- | ----------------------------------------------------------------- |
| Public API              | `atproto-dasl/src/car/mod.rs`; re-exports in `src/lib.rs`         |
| Reader (streaming)      | `atproto-dasl/src/car/reader.rs`                                  |
| Writer (framed)         | `atproto-dasl/src/car/writer.rs`                                  |
| Header struct + DRISL encode | `atproto-dasl/src/car/header.rs`                             |
| Block struct            | `atproto-dasl/src/car/block.rs`                                   |
| Config / limits         | `atproto-dasl/src/car/config.rs`                                  |
| `BlockStorage` trait    | `atproto-dasl/src/storage/mod.rs`                                 |
| `MemoryStorage`         | `atproto-dasl/src/storage/memory.rs`                              |
| `DiskStorage`           | `atproto-dasl/src/storage/disk.rs`                                |
| `SpillableBuffer`       | `atproto-dasl/src/storage/spillable.rs`                           |
| Varint read/write       | `atproto-dasl/src/varint/mod.rs`                                  |

## Common errors

| Error                              | Cause                                                                 |
| ---------------------------------- | --------------------------------------------------------------------- |
| `CarError::InvalidHeaderVersion`   | Header `version != 1`. This library reads / writes CAR v1 only.       |
| `CarError::NoRoots`                | Header has an empty `roots` array.                                    |
| `CarError::BlockSizeExceeded`      | Block exceeds `LimitsConfig::max_block_size`.                         |
| `CarError::CidMismatch`            | Block bytes don't hash to the declared CID. Corruption or non-canonical encoding. |
| `CarError::DuplicateCid`           | Writer saw the same CID twice. Pre-dedupe.                            |
| `CarError::IncompleteFrame`        | Reader hit EOF mid-block. CAR truncated.                              |
| `CarError::UnsupportedCidCodec`    | CID in the frame isn't dag-cbor (`0x71`) or raw (`0x55`).             |

## See also

- `../shared/car-v1.md` — byte-level CAR v1 spec.
- `drisl.md` — header is DRISL-encoded.
- `mst.md` — typical write order (commit, then MST nodes, then records).
- `../shared/divergence-matrix.md` — CAR library choice across TypeScript (`@ipld/car`) and Go (`go-car/v2`).

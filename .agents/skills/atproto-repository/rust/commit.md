# Rust — commit record, signing bytes, and verification wiring

`atproto_repo::repo::{Commit, UnsignedCommit, SignatureVerification}` implement the commit record: the DAG-CBOR map that binds a DID, a revision TID, the MST root CID, and (once signed) a raw ECDSA signature. The signing bytes come out of `UnsignedCommit::to_signing_bytes()`; the verification loop is **caller-owned** — the crate ships the shapes, not the crypto.

## Commit shape

```rust
#[derive(Serialize, Deserialize)]
pub struct Commit {
    pub did: String,
    pub version: u64,                         // always 3
    pub data: atproto_dasl::Cid,              // MST root CID

    #[serde(skip_serializing_if = "Option::is_none")]
    pub prev: Option<atproto_dasl::Cid>,      // See §prev-null-vs-omitted

    pub rev: String,                          // TID, 13 chars base32-sortable
    #[serde(with = "serde_bytes")]
    pub sig: Vec<u8>,                         // Raw signature, usually 64 bytes
}
```

`UnsignedCommit` has the same fields minus `sig`. DRISL serializes the fields in bytewise key order: `data`, `did`, `prev` (if present), `rev`, `sig`. That order is load-bearing — changing it changes the CID and invalidates the signature.

Source: `atproto-repo/src/repo/commit.rs`.

## Signing procedure

1. Build `UnsignedCommit`:

   ```rust
   use atproto_repo::repo::UnsignedCommit;

   let unsigned = UnsignedCommit {
       did: "did:plc:ewvi7nxzyoun6zhxrhs64oiz".to_string(),
       version: 3,
       data: mst_root_cid,
       prev: Some(previous_commit_cid),   // or None for genesis
       rev: next_tid.encode(),
   };
   ```

2. Pull the signing bytes:

   ```rust
   let signing_bytes: Vec<u8> = unsigned.signing_bytes()?;  // src/repo/commit.rs:93
   // Internally: `atproto_dasl::to_vec(&unsigned)?` — DRISL-strict.
   ```

3. Sign with the account's atproto signing key. The crate does **not** provide a signer — pick one off the shelf (`k256::ecdsa::SigningKey`, `p256::ecdsa::SigningKey`, `ring`, `ecdsa`, etc.). Feed `signing_bytes` directly:

   ```rust
   use k256::ecdsa::{SigningKey, Signature, signature::Signer};
   let sig: Signature = signing_key.sign(&signing_bytes);
   let sig_bytes: Vec<u8> = sig.normalize_s().unwrap_or(sig).to_bytes().to_vec();
   ```

   AT Protocol requires **raw `r ‖ s`** (64 bytes), **low-S normalized**. DER-wrapped ECDSA is not acceptable — unwrap it. See `../shared/commit-and-signing.md` §3.

4. Attach and compute the commit CID:

   ```rust
   let commit = unsigned.sign(sig_bytes);    // Returns Commit
   let commit_bytes = atproto_dasl::to_vec(&commit)?;
   let commit_cid = atproto_dasl::compute_cid(&commit_bytes);
   ```

   `commit_cid` is what goes into the next commit's `prev` and into the CAR header's `roots`.

## `prev`: null vs omitted

**This divergence breaks cross-implementation signature verification if you miss it.**

The Rust reference impl serializes `prev` with `#[serde(skip_serializing_if = "Option::is_none")]`. A genesis commit (`prev: None`) therefore **omits** the `prev` key entirely from the serialized map. This is a 4-entry map, CBOR header `a4`.

The spec wording says `prev` is required-with-null — a genesis commit should have `prev: null` present, 5-entry map, CBOR header `a5`. The Go reference impl (`indigo/atproto/repo`) does exactly this.

Implications:

- Two conformant implementations can produce **different signing bytes** for the logically same genesis commit, and therefore different signatures.
- A verifier must reconstruct `UnsignedCommit` the **same way the signer emitted it**.

**Always verify from the raw signed-commit block bytes**, not from a round-tripped struct:

```rust
// WRONG: may round-trip `prev: null` into absent (or vice versa)
let unsigned: UnsignedCommit = from_slice(&commit_bytes)?;  // strips sig during decode? no
let reconstructed = atproto_dasl::to_vec(&unsigned)?;       // may differ from the signer's bytes

// RIGHT: strip only the `sig` key from the raw bytes, preserving everything else.
```

The crate doesn't ship a "strip sig in place" helper today — you'd write one against `atproto_dasl::Value` or walk the CBOR manually. For most callers the right move is: resolve the DID, try the crate's signing bytes, and if verification fails, retry by stripping sig from raw bytes. See `../shared/commit-and-signing.md` §1.1.

## Validation — structural only

```rust
use atproto_repo::repo::Commit;

let commit: Commit = atproto_dasl::from_slice(&commit_bytes)?;
commit.validate()?;  // Returns Result<(), RepoError>
```

`Commit::validate()` enforces:

- `version == 3`.
- `did.starts_with("did:")`.
- `rev` is non-empty (does not re-parse as a TID — use `atproto_record::Tid::decode(&commit.rev)` for that).
- `sig` is non-empty.

It does **not** verify the signature; that's the caller's job.

## Signature verification — caller-owned

```rust
use atproto_repo::repo::SignatureVerification;

pub struct SignatureVerification {
    pub valid: bool,
    pub signer_did: String,
    pub key_id: String,           // "did:plc:…#atproto"
}
```

The struct exists at `atproto-repo/src/repo/commit.rs:225`, and `Repository::signature_verification()` returns `Option<SignatureVerification>` — but **the crate never populates it**. End-to-end verification is caller territory.

A working verification loop, using `atproto-identity` and your ECDSA library of choice:

```rust
use atproto_identity::resolve::Resolver;
use k256::ecdsa::{VerifyingKey, Signature, signature::Verifier};

// 1. Decode the commit.
let commit: Commit = atproto_dasl::from_slice(&commit_bytes)?;
commit.validate()?;

// 2. Signing bytes — see §prev-null-vs-omitted before trusting this for all commits.
let signing_bytes = Commit::strip_sig_bytes(&commit_bytes)?;
//     or, when the signer used the reference impl form, UnsignedCommit::from(commit.clone()).signing_bytes()?

// 3. Resolve the DID and pull the #atproto Multikey.
let doc = resolver.resolve_did(&commit.did).await?;
let vm = doc.find_atproto_multikey()
    .ok_or(VerifyError::NoAtprotoKey)?;
let (curve, pubkey_bytes) = decode_multibase_key(&vm.public_key_multibase)?;

// 4. Verify via the matching curve.
let verified = match curve {
    Curve::K256 => {
        let verifying_key = VerifyingKey::from_sec1_bytes(&pubkey_bytes)?;
        let sig = Signature::from_slice(&commit.sig)?;
        verifying_key.verify(&signing_bytes, &sig).is_ok()
    }
    Curve::P256 => { /* p256::ecdsa analog */ }
};

// 5. On failure, re-resolve as of commit.rev and retry — key rotation.
```

See `../shared/commit-and-signing.md` §4 for the full algorithm and §7 for key-rotation handling.

## Rotation — verifying older commits

The `#atproto` Multikey in the current DID document is the **current** signing key. Older commits were signed under historical keys. If verification fails under the current key and the account uses `did:plc`:

```rust
// Pseudocode; atproto-identity-resolution covers the exact API.
let log = resolver.plc_audit_log(&commit.did).await?;
let historic_key = log.key_at_rev(&commit.rev)?;
let verified = verify_with(&signing_bytes, &commit.sig, historic_key)?;
```

For `did:web`, historical DID documents aren't retrievable — older commits become permanently unverifiable once the key rotates. For `did:webvh`, walk the verifiable history log.

The crate offers no helper for this; it's the caller's job to wire historical-key lookup into a retry loop.

## End-to-end: write a signed commit to a CAR

Tying together the full stack from this skill:

```rust
use atproto_repo::{Mst, UnsignedCommit};
use atproto_dasl::{to_vec, compute_cid, MemoryStorage, BlockStorage, CarWriter};
use tokio::fs::File;

let mut storage = MemoryStorage::new();
let mut tree = Mst::new(&mut storage).await?;
for (key, record_cid) in records_in_bytewise_order {
    tree.insert(key, record_cid).await?;
}
let root = tree.root_cid().expect("non-empty tree");

let unsigned = UnsignedCommit {
    did: user_did,
    version: 3,
    data: root,
    prev: None,                           // genesis
    rev: new_tid.encode(),
};
let sig = sign_with_atproto_key(&unsigned.signing_bytes()?)?;
let commit = unsigned.sign(sig);

let commit_bytes = to_vec(&commit)?;
let commit_cid = compute_cid(&commit_bytes);
storage.put(commit_cid, commit_bytes.clone().into()).await?;

let file = File::create("repo.car").await?;
let mut car = CarWriter::new(file, vec![commit_cid]).await?;
car.write_block(commit_cid, &commit_bytes).await?;
// Then every block from `storage`; Mst and record blocks.
// storage.iter() or similar; the crate's iterator impl varies by storage backend.
car.finish().await?;
```

## File pointers

| Concern                            | File                                           |
| ---------------------------------- | ---------------------------------------------- |
| Public API                         | `atproto-repo/src/lib.rs`                      |
| `Commit`, `UnsignedCommit`         | `atproto-repo/src/repo/commit.rs`              |
| `signing_bytes()`                  | `atproto-repo/src/repo/commit.rs:93`           |
| `validate()`                       | `atproto-repo/src/repo/commit.rs` (`validate`) |
| `SignatureVerification` struct     | `atproto-repo/src/repo/commit.rs:225`          |
| `Repository` assembly              | `atproto-repo/src/repo/mod.rs:218`             |
| `RecordPath` (`collection/rkey`)   | `atproto-repo/src/repo/types.rs`               |
| Integration tests                  | `atproto-repo/src/repo/commit.rs` at line 256+ |

## Common errors

| Error                                           | Cause                                                                                      |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `RepoError::UnsupportedCommitVersion`           | `version != 3`. Legacy commit or corruption.                                               |
| `RepoError::MissingCommitField { field: "sig" }`| `UnsignedCommit` was submitted as `Commit`. Sign it first, or drop to `UnsignedCommit`.    |
| `RepoError::InvalidDid`                         | `did` doesn't start with `did:`. Truncated or corrupt.                                     |
| Signature fails under current key               | Account rotated. Re-resolve the DID as of `commit.rev` and retry.                          |
| Signature fails even with correct key           | Signer used DER-wrapped ECDSA. Unwrap to raw `r ‖ s`.                                      |
| Signature round-trips through struct but fails  | `prev: null` vs absent mismatch. Verify from raw bytes, not a re-encoded `UnsignedCommit`. |

## See also

- `../shared/commit-and-signing.md` — language-neutral commit / signing rules, including §1.1 on `prev`.
- `drisl.md` — canonical DAG-CBOR (`to_vec` is what produces signing bytes).
- `mst.md` — `tree.root_cid()` is what goes into `commit.data`.
- `car.md` — the CAR that wraps the commit on the wire.
- `../shared/divergence-matrix.md` §commit — how this compares to Go (`indigo/atproto/repo`, spec-strict `prev: null`) and TypeScript (`@atproto/repo`).
- `atproto-identity-resolution` skill — resolving the DID to find the current and historic `#atproto` Multikey.

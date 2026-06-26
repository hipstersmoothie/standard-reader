# Repo Commit & Signing (Reference)

Source of truth: https://atproto.com/specs/repository.

The commit is the root of a repository: a small DAG-CBOR record binding a DID, a revision, and the current MST root CID, sealed by a signature from the account's atproto signing key. Everything else in the repo is cryptographically anchored to the commit's CID.

This reference covers the commit record layout, the exact bytes that get signed, how a verifier checks them, and how key rotation interacts with older commits.

## 1. Record shape

`Commit` is a DAG-CBOR map. Fields in bytewise key order (which is how DRISL serializes them):

| Key       | Sort bytes         | Type    | Required on wire | Notes                                                    |
| --------- | ------------------ | ------- | ---------------- | -------------------------------------------------------- |
| `data`    | `0x64 0x61 0x74 0x61` | CID  | yes              | MST root CID. Must be a dag-cbor CID (codec `0x71`).     |
| `did`     | `0x64 0x69 0x64`   | string  | yes              | Owner DID. Must start with `did:`.                       |
| `prev`    | `0x70 0x72 0x65 0x76` | CID? | yes (per spec)  | CID of the parent commit, or `null` for the genesis commit. See §1.1. |
| `rev`     | `0x72 0x65 0x76`   | string  | yes              | Monotonic revision, in TID form (13 chars base32-sortable). |
| `sig`     | `0x73 0x69 0x67`   | bytes   | yes              | Raw ECDSA signature over `UnsignedCommit` DAG-CBOR bytes. Omitted from `UnsignedCommit` when signing. |
| `version` | `0x76 …`           | integer | yes              | Exactly `3`. Versions 1 and 2 are historical; never emit them. |

Key sort order: `data` (0x64…) < `did` (0x64…) < `prev` (0x70…) < `rev` (0x72…) < `sig` (0x73…) < `version` (0x76…).

Canonical field-by-field comparison of `data` vs `did`: byte 1 both 0x64, byte 2 `a`=0x61 vs `i`=0x69 — `data` sorts first. Exact ordering matters: emitting `did` before `data` changes the commit CID and invalidates the signature.

### 1.1. `prev` — null vs omitted

Per spec, `prev` is a **required** field whose value is either a CID or `null`. The reference `atproto-repo` crate elides `prev` from the serialized output when it's `None` (uses `skip_serializing_if`). This is a spec-vs-impl divergence:

- **Spec-strict**: the map always contains a `prev` key; genesis commits have `prev: null`.
- **Reference impl**: genesis commits omit the key entirely.

The distinction matters because the signing bytes depend on exactly which map keys are present. A verifier that reconstructs `UnsignedCommit` from a received `Commit` must do so the same way the signer did — include or omit `prev` to match. In practice, consumers must be liberal: accept both the spec-strict form (`prev: null` present) and the reference impl form (key absent), and when verifying signatures, reconstruct the signing bytes by removing only the `sig` field without imposing any other structural change.

If you are writing a verifier, **start from the raw commit block bytes**, strip the `sig` field, and hash the result. Do not re-encode from a struct, because doing so could round-trip `null` into absent (or vice versa) and break verification.

## 2. `UnsignedCommit` — the signing surface

To sign or verify, isolate the commit without its `sig`:

| Key       | Present in `UnsignedCommit` |
| --------- | --------------------------- |
| `data`    | yes                         |
| `did`     | yes                         |
| `prev`    | yes (CID or null per spec; or absent per reference impl) |
| `rev`     | yes                         |
| `sig`     | **no**                      |
| `version` | yes                         |

The **signing bytes** are the DAG-CBOR (DRISL) encoding of `UnsignedCommit`. Every rule in `drisl.md` applies: keys sorted bytewise, integers in shortest form, CIDs as tag 42 with identity multibase prefix, no indefinite-length framing.

Reference implementation: `Commit::signing_bytes()` at `atproto-repo/src/repo/commit.rs:93`.

### 2.1. Canonical genesis commit walkthrough

Fields:

- `did = "did:plc:ewvi7nxzyoun6zhxrhs64oiz"`
- `version = 3`
- `data = <mst_root_cid>`
- `rev = "3jzfcijpj2z2a"` (a TID; see `data-model.md` §3)
- `prev = null` (genesis)

DAG-CBOR encoding (using spec-strict form with `prev: null`):

```
a5                               ; map(5) — data, did, prev, rev, version
  64 64 61 74 61                 ; "data"
  d8 2a 58 25 00 <36 bytes>      ; tag 42, bytes(37), <identity || cid>
  63 64 69 64                    ; "did"
  78 20                          ; text(32)
  64 69 64 3a 70 6c 63 3a …      ; "did:plc:ewvi7nxzyoun6zhxrhs64oiz"
  64 70 72 65 76                 ; "prev"
  f6                             ; null
  63 72 65 76                    ; "rev"
  6d                             ; text(13)
  33 6a 7a 66 63 69 6a 70 6a     ; "3jzfcijpj2z2a"
  32 7a 32 61
  67 76 65 72 73 69 6f 6e        ; "version"
  03                             ; unsigned(3)
```

Total length: 118 bytes. Hash these bytes with the signing key to produce `sig`. Byte-by-byte breakdown in `test-vectors.md` §4.1.

The reference impl's emitted form omits `prev` entirely and produces a 4-entry map (`a4`) instead of `a5`, so the signing bytes and resulting signature differ from the spec-strict form. Any two implementations signing the same logical state must agree on which form they emit.

## 3. Signing

1. Build `UnsignedCommit` with all required fields populated.
2. Serialize to DAG-CBOR through a DRISL-strict encoder.
3. Compute the signature. AT Protocol requires **raw ECDSA** output:
   - For k256 (secp256k1): 64 bytes, `r ‖ s` concatenation. Signer must use low-S canonical form (BIP-62); a high-S signature is a verification failure.
   - For p256 (secp256r1): 64 bytes, same `r ‖ s`, same low-S requirement.
   - DER-wrapped ECDSA (70+ bytes) is **not** acceptable. Unwrap it.
   - ed25519 is reserved for future use — not widely deployed in PDS code today.
4. Attach the signature in the `sig` field; the commit is now complete.
5. Compute the commit's own CID (dag-cbor over the signed encoding). This CID is what goes into the next commit's `prev` and into the CAR header's `roots`.

## 4. Verifying

Given a signed commit `C`:

1. **Isolate the signing bytes.** Strip the `sig` field from the commit's raw bytes — ideally without re-encoding. If you must re-encode, reconstruct `UnsignedCommit` in the exact form the signer emitted (see §1.1 on `prev`).
2. **Find the signing key.** Resolve `C.did` via `atproto-identity-resolution` to get its DID document. The active key is the `verificationMethod` entry whose `id` ends with `#atproto`, `type` is `"Multikey"`, and `controller` equals the DID. Decode `publicKeyMultibase` — the multibase-decoded bytes have a multicodec prefix (k256 = `0xe7 0x01`, p256 = `0x80 0x24`, followed by the compressed curve point).
3. **Verify.** Run ECDSA verification over the signing bytes with the recovered public key and the declared curve. Require low-S form.
4. **Record the verification result.** The reference crate exposes a `SignatureVerification { valid, signer_did, key_id }` struct (`atproto-repo/src/repo/commit.rs:225`), but note: **the reference crate does not implement end-to-end verification**. The struct is a future-proofing shape; actual verification is the caller's responsibility today.

### 4.1. Timing of DID resolution

The signing key in the DID document is the key that is currently live. If the account has rotated its key between when the commit was signed and when you try to verify, the live key will fail to verify an older commit.

- For recent commits (within seconds to minutes), the live key is almost certainly the right one.
- For older commits, you must resolve the DID **as of `C.rev`**:
  - For `did:plc`, fetch the PLC operation log (`GET https://plc.directory/<did>/log/audit`) and find the signing key that was active at the timestamp derivable from the TID in `C.rev`.
  - For `did:web`, this isn't possible — `did:web` has no on-chain history. Commits older than the current key are unverifiable.
  - For `did:webvh`, walk the verifiable history log to the state at `C.rev`.

A verifier that returns "signature invalid" immediately on the first failed check risks false negatives for rotated accounts. A robust verifier retries against the historical key before giving up.

## 5. The `rev` field

`rev` is a TID — a 13-char base32-sortable string encoding a 53-bit microsecond timestamp plus a 10-bit clock identifier (64 bits total, top bit always 0). Requirements:

- **Strictly monotonic**: `rev` of a commit must be bytewise-greater than the previous commit's `rev`. Since TIDs are sortable, bytewise greater-than corresponds to later-in-time.
- **Unique per PDS**: clock-id bits prevent collisions when a single PDS rapidly produces commits; TID generation is lockless.
- **Not meaningful as an absolute time** for external consumers — use it as an ordering key, not as a clock. Nothing stops a PDS from issuing a `rev` slightly in the future; and nothing requires the TID's wall-clock portion to match any particular clock.

See `data-model.md` §3 for TID syntax.

## 6. Chaining commits

Commits form a linked list via `prev`. For commit `C_n`:

- `prev` = CID of `C_{n-1}`, or `null` for `n = 0`.
- `rev > rev_{n-1}` (bytewise).
- `data` = root of the MST *after* the operation(s) that this commit represents.

Firehose subscribers expect each new commit's `prev` to equal the previous commit's CID they saw — if it doesn't, there's been a gap (missed events, a rewound PDS, a replayed CAR). Consumers should treat `prev` mismatches as a hard sync error and re-fetch from the current `getLatestCommit`.

## 7. Rotation — how it interacts with verification

AT Protocol separates the *signing* key from the *rotation* keys:

- The `#atproto` Multikey in the DID document is the **signing key** — the one that signs commits.
- Rotation keys live in the PLC operation log (for `did:plc`) and are used to authorize changes to the DID document itself, including rotations of the signing key. They do not sign commits directly.

When a signing key rotates:

- Older commits remain valid under the **old** signing key. Verifiers must be able to retrieve the historic key.
- New commits signed after rotation are verifiable under the **new** signing key.
- There's no retroactive re-signing — commits aren't touched during rotation.

For `did:web`, key rotation requires rewriting the DID document served at `/.well-known/did.json`. Historic commits become unverifiable unless the verifier has cached the old key.

## 8. The CAR that wraps a commit

On the wire, a signed commit travels inside a CAR v1 file:

- **Repo export**: `com.atproto.sync.getRepo` — CAR whose root is the latest commit's CID; blocks include the commit, every MST node, every record.
- **Firehose event**: `com.atproto.sync.subscribeRepos` — each `#commit` event's payload is a tiny CAR whose root is the new commit's CID and whose blocks are **only the blocks that changed** since the previous commit (the commit itself plus the minimal subtree needed to justify the new MST root, plus any new or changed records). Consumers combine these with a persistent block store.

The CAR framing is identical to a full repo — see `car-v1.md`. A firehose consumer that assumes every block it needs is present in each event's CAR will break the moment a commit only touches already-known subtrees.

## 9. Record-block side: what is "inside" the repo

Beyond the commit and the MST nodes, the repo contains:

- **Record blocks**: one per record, DAG-CBOR encoded, addressed by dag-cbor CID.
- **Blob CIDs**: records may reference blobs (images, video) via `$link` CIDs of codec `raw` (`0x55`). Blobs themselves are usually fetched separately (`com.atproto.sync.getBlob`) and are **not** part of the CAR export from `getRepo` — the CAR carries only the record that references the blob's CID, not the blob bytes.

A CAR consumer that tries to look up every referenced CID inside the CAR will trip over blob CIDs; treat "referenced but not present in this CAR" as a signal to fetch externally, not as a protocol violation.

## 10. Common errors

| Symptom                                              | Likely cause                                                                                   |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| `UnsupportedCommitVersion { version: 2 }`            | Legacy v2 commit from pre-release data. Reject for any verification; lenient reads may allow. |
| `InvalidDid` on `did` field                          | Commit's `did` doesn't start with `did:`. Likely truncated or corrupted.                       |
| `MissingCommitField { field: "sig" }`                | `UnsignedCommit` was submitted as a `Commit` by mistake. Sign it first.                        |
| Signature verifies only after stripping `prev: null` | Signer omitted the `prev` key (reference-impl style). Reconstruct the signing bytes the same way. |
| Signature verifies against an older DID document     | Account rotated keys. Re-resolve as of `commit.rev` and retry.                                 |
| DER-encoded `sig` field                              | Producer emitted DER ECDSA. Unwrap to raw `r ‖ s`, 64 bytes, before verifying.                |
| `rev` not greater than parent's `rev`                | Broken monotonicity. A PDS clock skew or TID generator bug; reject commit.                    |
| `prev` doesn't match local head                      | Missed firehose events or forked state. Re-fetch `com.atproto.sync.getLatestCommit`.           |
| Two `#atproto` verification methods in DID document  | Spec says first match wins. The reference impl scans `verificationMethod` in order and picks the first entry whose `id` ends with `#atproto`, `type == "Multikey"`, and `controller` matches the DID; later entries are ignored. |

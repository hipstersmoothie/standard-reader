# CID-first attestation — normative spec

This file is the authoritative, language-neutral specification for AT Protocol attestations per the [badge.blue](https://badge.blue/) reference. Language-specific guides live in `../rust/`, `../typescript/`, `../go/`.

## 1. What an attestation is

An attestation is a cryptographically verifiable statement bound to a specific record, by a specific key, in a specific repository.

There are two kinds:

- **Inline attestation** — an ECDSA signature embedded in the record's `signatures` array. Self-contained; verifiable with only the record and the issuer's public key.
- **Remote attestation** — a `com.atproto.repo.strongRef` entry in the record's `signatures` array pointing at a separate *proof record* stored in another repository. The proof record carries the CID; no cryptographic signature.

Both kinds bind to the same *content CID*, and the content CID is bound to a specific repository DID. That last binding is the replay-protection.

## 2. Terminology

| Term | Meaning |
| ---- | ------- |
| **Subject record** | The record being attested. Lives in the `repository` DID's repo. |
| **Attestor** | The party creating an inline or remote attestation. Holds the private key (inline) or controls the proof record's repo (remote). |
| **Issuer** | Optional metadata field identifying the attesting entity (typically the attestor's DID). |
| **`signatures` array** | Top-level array on the subject record holding inline or remote attestation entries. |
| **`$sig` metadata** | Transient object merged into the record during CID computation. Not persisted on the final record. |
| **Content CID** | The CIDv1 computed over `(record − signatures, $sig merged with repository)`. The thing that is signed (inline) or referenced (remote). |
| **Proof record** | For remote attestations: a separate record in the attestor's repo containing the content CID and attestation metadata. |
| **Repository binding** | Injection of the subject repo's DID into `$sig.repository` before CID computation. |
| **Low-S normalization** | ECDSA malleability defense: if `s > n/2`, replace with `(r, n − s)`. |
| **strongRef** | `com.atproto.repo.strongRef` — a typed `{uri, cid}` reference. Used for remote attestations. |

## 3. Lexicon boundaries

The badge.blue spec is a **framework**, not a lexicon. The attestation metadata's `$type` is user-defined. The spec uses `com.example.inlineSignature`, `com.example.attestation`, etc. as placeholders. Real-world publishers pick their own NSIDs (`blue.badge.approval`, `sh.tangled.attestation`, …). Consumers dispatch on `$type` like any other `$type` union.

What's **fixed** across implementations:

- The strongRef type for remote attestations: `com.atproto.repo.strongRef` (standard atproto reference type).
- The field names in attestation metadata: `$type`, `key`, `cid`, `signature`, `repository` (transient).
- The `signatures` field name on the subject record.
- The `$sig` key name used during CID computation (transient).

## 4. The content CID — the core of the spec

Everything hinges on the content CID. See `cid-computation.md` for the bit-exact procedure. Summary:

1. Start with the subject record as a JSON object.
2. Remove its `signatures` field if present.
3. Take the attestation metadata object.
4. Remove `cid`, `signature` from the metadata (these are outputs, not inputs).
5. Insert `repository: <subject repo DID>` into the metadata.
6. Insert the modified metadata into the record under key `$sig`.
7. Serialize the result to DAG-CBOR.
8. SHA-256 the bytes.
9. Wrap as CIDv1: version 1, codec `0x71` (dag-cbor), multihash `0x12` (SHA-256), 32-byte digest. 36 bytes binary; `bafyrei…` string form.

Determinism flows from DAG-CBOR's canonical rules (sorted keys, shortest integer encoding, etc.). Two encoders that both conform to DAG-CBOR produce byte-identical output for the same logical input, so any conforming implementation agrees on the CID.

## 5. Inline attestation — wire shape

The subject record after signing:

```json
{
  "$type": "app.bsky.feed.post",
  "text": "Hello world!",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "signatures": [
    {
      "$type": "com.example.inlineSignature",
      "key": "did:key:zQ3sh...",
      "issuer": "did:plc:issuer123",
      "issuedAt": "2024-01-01T00:00:00.000Z",
      "cid": "bafyrei...",
      "signature": { "$bytes": "<base64-of-64-byte-rs-low-s>" }
    }
  ]
}
```

Required attestation fields (what the PDS/verifier will check):

- `$type` — any valid NSID chosen by the attestor.
- `key` — a `did:key:` reference to the verification key (or any DID the key resolver understands).
- `cid` — the content CID as a base32 string (`bafyrei…`).
- `signature.$bytes` — base64 of the 64-byte low-S normalized ECDSA signature (IEEE P1363 `r‖s` form, NOT DER).

Optional attestation fields:

- `issuer`, `issuedAt`, `purpose`, or any other metadata the attestor wants carried. Custom fields *participate in the CID* — if they change, the signature is invalid. See `cid-computation.md` §4.

The `repository` field is **never** present on the stored attestation. It's injected only during CID computation. Implementations that leak it into the stored object will still verify, but this violates the spec.

See `inline-attestation.md` for the full create/verify procedures.

## 6. Remote attestation — wire shape

Two records: one in the subject's repo, one in the attestor's repo.

**Subject record** (after attestation) — strongRef in `signatures`:

```json
{
  "$type": "app.bsky.feed.post",
  "text": "Hello world!",
  "signatures": [
    {
      "$type": "com.atproto.repo.strongRef",
      "uri": "at://did:plc:attestor/com.example.attestation/<tid>",
      "cid": "bafyrei<DAG-CBOR-CID-of-proof-record>"
    }
  ]
}
```

**Proof record** (in attestor's repo, collection = attestor-chosen NSID, rkey = TID):

```json
{
  "$type": "com.example.attestation",
  "issuer": "did:plc:issuer123",
  "purpose": "verification",
  "cid": "bafyrei<CONTENT-CID-of-subject-record>"
}
```

Two CIDs are in play — do not confuse them:

- **Content CID** — the CID computed from the subject record + proof metadata + subject repo DID. Stored inside the proof record's `cid` field. This is what binds the attestation to the record.
- **Proof record CID** — the DAG-CBOR CID of the proof record itself. Stored in the strongRef's `cid` field. This is what binds the strongRef to the specific proof record revision.

Verification must check both. See `remote-attestation.md`.

## 7. Verification

Every entry in `signatures` must be validated. Entries with `$type = com.atproto.repo.strongRef` are remote; anything else is inline (the metadata type is attestor-chosen).

### Inline

1. Extract the attestation object from `signatures[i]`.
2. Rebuild the `$sig` input: strip `cid` and `signature`, insert `repository = <subject repo DID>`.
3. Recompute the content CID per §4.
4. Compare to the `cid` field in the attestation. Must match byte-for-byte (compare 36-byte binary forms).
5. Resolve the `key` field to a public key (out of scope for this spec — use `atproto-identity-resolution` or a DID-key parser).
6. Base64-decode `signature.$bytes`.
7. Verify the 64-byte ECDSA signature against the **content CID bytes** (36 bytes, the binary CID form) using the public key.

If any step fails, the attestation is invalid.

### Remote

1. Extract the strongRef from `signatures[i]`.
2. Fetch the record at `strongRef.uri` — this is the proof record. Out-of-scope: how you fetch (any XRPC `com.atproto.repo.getRecord` client).
3. Compute the DAG-CBOR CID of the fetched proof record. Compare to `strongRef.cid`. Must match.
4. Extract the proof record's `cid` field — this is the claimed content CID.
5. Rebuild `$sig` from the proof record: remove `cid`, insert `repository = <subject repo DID>`.
6. Recompute the content CID per §4.
7. Compare to the claimed content CID. Must match.

Remote verification has no cryptographic signature step — integrity is content-addressed through two CID matches.

## 8. Signatures and curves

ECDSA over **CID bytes** (the 36-byte binary form of the content CID, not the string form).

Supported curves in the reference implementation:

- P-256 (secp256r1) — low-S normalization implemented.
- K-256 (secp256k1) — low-S normalization implemented.
- P-384 — signing/verification supported, **but low-S normalization is not implemented in the reference Rust crate**. See `signature-normalization.md` and `divergence-matrix.md`.

Wire format: raw `r‖s` concatenation, 64 bytes for P-256/K-256, 96 bytes for P-384. **Not DER-encoded.** Every implementation must strip ASN.1 if its crypto library returns DER.

## 9. Replay protection

The `repository` field in `$sig` makes every content CID repo-specific. Copying a signed record from one repo to another invalidates the signature:

- A replay-copied inline record's attestation will recompute a different CID (because the verifier uses the *new* repo DID), and ECDSA verification against the wrong CID fails.
- A replay-copied remote record's strongRef still points at the original proof record, but the proof record's `cid` field encodes the *original* repo. A verifier supplying the new repo DID recomputes a different content CID, and the match in step 7 fails.

Verifiers **must** use the actual repo DID where the record lives (e.g., the DID in the AT-URI they fetched it from). Accepting a caller-supplied repo DID without sanity-checking it defeats replay protection.

## 10. Known gaps in the spec

These are not spec ambiguities — they're things the spec delegates to implementations or leaves to the attestor:

- **Expiration / freshness.** Attestations may include `issuedAt` in custom metadata, but the spec does not define time-based validity. Verifiers that care about freshness must implement it themselves.
- **Revocation.** There is no spec-level revocation. A compromised attestation can only be invalidated by rotating the issuer key (and updating the DID document) or by removing the proof record (remote only).
- **Key rotation.** The `key` field is a static reference; if it becomes a DID verification-method ID and the key rotates, existing attestations remain valid for the old key. This is by design but worth surfacing.
- **Canonical test vectors.** The reference Rust crate has determinism tests but no signed/public test-vector set. Cross-implementation verification currently goes through the Rust crate's CLI tools (`atproto-attestation-sign`, `atproto-attestation-verify`) or the `/verify` page at https://badge.blue/verify.

## 11. See also

- `cid-computation.md` — the bit-exact `$sig` merge + DAG-CBOR + SHA-256 procedure.
- `inline-attestation.md` — create/verify procedures for inline.
- `remote-attestation.md` — create/verify procedures for remote (both records, both CIDs).
- `signature-normalization.md` — low-S rules and curve coverage.
- `test-vectors.md` — current fixtures, their provenance, and gaps.
- `divergence-matrix.md` — cross-language differences.
- `../rust/README.md`, `../typescript/README.md`, `../go/README.md` — per-language entry points.
- Upstream spec: <https://badge.blue/>
- Reference implementation: `atproto-attestation` crate, source at <https://tangled.org/ngerakines.me/atproto-crates/tree/main/crates/atproto-attestation>.

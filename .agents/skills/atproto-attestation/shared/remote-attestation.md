# Remote attestations

Content-addressed, signature-less attestations. The proof of attestation lives in a *separate* record in the attestor's own repo; the subject record only contains a `com.atproto.repo.strongRef` pointing at it.

Use remote attestations when:

- The attestor doesn't want to hand their private key to the subject's publisher.
- The attestation should be independently rotatable or revocable (delete the proof record → attestation is unreachable).
- The attestation needs to live under a different access-control boundary than the subject record.

## The two records

Remote attestations create **two** records, usually in **two** repos:

1. **Proof record** — in the attestor's repo. Collection = attestor-chosen NSID (the `$type` of the metadata). Rkey = a TID. Contains the content CID.
2. **Subject record** — in the subject's repo. Same as before, but with a strongRef appended to its `signatures` array.

### Subject record (after attestation)

```json
{
  "$type": "app.bsky.feed.post",
  "text": "Hello world!",
  "signatures": [
    {
      "$type": "com.atproto.repo.strongRef",
      "uri": "at://did:plc:attestor/com.example.attestation/3kxh2f...",
      "cid": "bafyrei<PROOF_RECORD_CID>"
    }
  ]
}
```

The strongRef type is fixed: `com.atproto.repo.strongRef`. This is how verifiers distinguish remote from inline entries in the `signatures` array.

### Proof record (in attestor's repo)

```json
{
  "$type": "com.example.attestation",
  "issuer": "did:plc:issuer123",
  "purpose": "verification",
  "cid": "bafyrei<CONTENT_CID>"
}
```

Required fields:

| Field    | Type   | Notes                                                                                   |
| -------- | ------ | --------------------------------------------------------------------------------------- |
| `$type`  | string | Attestor-chosen NSID. Must match the collection the proof record is stored under.        |
| `cid`    | string | The **content CID** — computed from the subject record + this metadata + subject repo DID. |

Optional: any other metadata fields the attestor wants.

## Two CIDs — do not confuse them

Remote attestations involve two distinct CIDs:

| CID              | Where stored                             | What it identifies                                       |
| ---------------- | ---------------------------------------- | -------------------------------------------------------- |
| **Content CID**  | Inside the proof record, `cid` field     | The signed-content payload (record + `$sig` + repository) |
| **Proof CID**    | Inside the strongRef, `cid` field        | The proof record itself, as stored in the attestor's repo |

Both must be verified. The proof CID guarantees the strongRef points at the exact record bytes you expect; the content CID guarantees the proof record is bound to the subject record.

## Create — procedure

Given: `record`, `metadata` (without `cid`), `subject_repository` DID, `attestor_repository` DID.

1. Compute the **content CID** per `cid-computation.md`. Input: `record`, `metadata`, `subject_repository`.
2. Build the proof record: start from `metadata`, insert `cid: <content CID string>`.
3. Serialize the proof record to DAG-CBOR and compute its **proof CID** (CIDv1, codec 0x71, SHA-256). This is *not* an attestation-CID call — no `$sig` merge, no `repository` field. It's just the raw DAG-CBOR CID of the proof record bytes.
4. Pick a rkey for the proof record. Convention: a TID (atproto's time-ordered identifier).
5. Build the strongRef:
   - `$type`: `com.atproto.repo.strongRef`
   - `uri`: `at://<attestor_repository>/<metadata.$type>/<rkey>`
   - `cid`: the proof CID from step 3 (string form)
6. Append the strongRef to `record["signatures"]`.
7. **Actually publish** the proof record to the attestor's repo via `com.atproto.repo.putRecord`. (The in-memory returned proof record is not an attestation until it's published.)

Output: the attested subject record (with strongRef) and the proof record (for publishing).

## Append vs create

The reference crate distinguishes two flows:

- `create_remote_attestation` — generates a new proof record in memory, returns both records. You publish the proof record yourself.
- `append_remote_attestation` — you already have a proof record (perhaps created and stored elsewhere); this function takes the proof metadata + the AT-URI it was stored under, verifies the content CID matches, and appends the strongRef.

The second flow matters when an attestation workflow spans services — e.g., the attestor creates and stores the proof record, then hands the URI back to the publisher to append to their subject record.

## Verify — procedure

Given: subject `record` (with `signatures[]`), `subject_repository` DID, a record resolver that can fetch by AT-URI.

For each entry in `signatures` whose `$type == com.atproto.repo.strongRef`:

1. Let `strongRef = signatures[i]`.
2. Parse `strongRef.uri` — `at://<attestor_did>/<collection>/<rkey>`.
3. Fetch the proof record at that URI. (Any `com.atproto.repo.getRecord` XRPC call works.)
4. Compute the DAG-CBOR CID of the fetched proof record. Compare to `strongRef.cid`. If it doesn't match, **reject** — the strongRef points at a different record than expected (tampering or stale cache).
5. Extract `proof.cid` — the claimed content CID.
6. Rebuild the signing-time metadata from the proof record: strip `cid`.
7. Compute the content CID per `cid-computation.md`: `record`, stripped metadata, `subject_repository`.
8. Compare to the claimed content CID. If mismatch, **reject** — the attestation isn't bound to this record in this repo.

All match → the remote attestation is valid. No cryptographic signature is checked; integrity is content-addressed through the two CID matches.

## What remote attestations do NOT provide

- **No cryptographic proof of the issuer.** Anyone can create a proof record claiming any `issuer`. Trust in the attestor comes from knowing whose repo the proof record lives in (via the `uri` field), not from a signature. Applications that need cryptographic provenance should combine a remote attestation with an inline one, or only use inline.
- **No revocation semantics.** Deleting the proof record makes the remote attestation unreachable *to new verifiers*, but anyone who cached the proof record bytes can still verify. The strongRef would return 404 on fresh resolves. Treat deletion as soft revocation.
- **No freshness signal.** The proof record can be published long after the subject record; verifiers can't tell when the attestation was created unless the proof record carries an explicit timestamp field.

## Common mistakes

- **Putting the content CID in the strongRef's `cid` field.** That field must be the *proof record*'s CID. The content CID lives inside the proof record.
- **Forgetting to publish the proof record.** The strongRef is useless without the record it points at. Verifiers will get 404.
- **Using a non-TID rkey.** Technically any valid rkey works, but TIDs are the atproto convention for records that don't have a natural key.
- **Storing the proof record in the subject's repo.** That's fine if the subject and attestor are the same DID, but then the whole "remote" part is degenerate — use inline instead.
- **Deleting the subject record but leaving the proof record.** Verifiers can still fetch the proof record, but the strongRef resolves from the subject side, which is gone. The attestation is logically dead but the proof record is dead weight.
- **Computing the proof-record CID with `$sig` merge.** That's the content-CID algorithm. The proof-record CID is just the DAG-CBOR CID of the proof record as published — no `$sig`, no `repository`.

## See also

- `cid-computation.md` — the content-CID algorithm.
- `inline-attestation.md` — the signature-bearing counterpart.
- `spec.md` §6 — the top-level overview.
- `test-vectors.md` — fixtures.
- `../rust/creating.md`, `../typescript/creating.md`, `../go/creating.md` — per-language create flow.
- `../rust/verifying.md`, `../typescript/verifying.md`, `../go/verifying.md` — per-language verify flow.

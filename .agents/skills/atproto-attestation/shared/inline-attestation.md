# Inline attestations

Cryptographic signatures embedded directly in a record's `signatures` array. Self-contained — a verifier needs only the record itself and the issuer's public key.

## Record shape

Final record (after signing):

```json
{
  "$type": "app.bsky.feed.post",
  "text": "Hello world!",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "signatures": [
    {
      "$type": "com.example.inlineSignature",
      "key": "did:key:zQ3shNzMp4oaaQ1gQRzCxMGXFrSW3NEM1M9T6KCY9eA7HhyEA",
      "issuer": "did:plc:issuer123",
      "issuedAt": "2024-01-01T00:00:00.000Z",
      "cid": "bafyrei...",
      "signature": { "$bytes": "MEQCIA..." }
    }
  ]
}
```

Required attestation fields:

| Field              | Type   | Notes                                                                                     |
| ------------------ | ------ | ----------------------------------------------------------------------------------------- |
| `$type`            | string | Attestor-chosen NSID.                                                                     |
| `key`              | string | `did:key:…` or other resolvable key reference.                                            |
| `cid`              | string | Content CID, base32 string form (`bafyrei…`).                                             |
| `signature.$bytes` | string | Base64 (standard alphabet, with padding) of the 64-byte low-S normalized ECDSA signature. |

Optional attestation fields: any — common choices are `issuer` (DID), `issuedAt` (RFC 3339 datetime), `purpose`. All optional fields **participate in the CID**, so changing them invalidates the signature.

## Create — procedure

Given: `record`, `metadata` (without `cid` / `signature`), `repository` DID, `private_key`.

1. Compute the content CID per `cid-computation.md`. Input: `record`, `metadata`, `repository`.
2. Sign the **36-byte binary CID** with ECDSA: `raw_signature = ECDSA_sign(private_key, content_cid.to_bytes())`.
3. Normalize `raw_signature` to low-S form (see `signature-normalization.md`).
4. Base64-encode the normalized signature (standard alphabet, with `=` padding).
5. Build the final attestation object by starting from `metadata` and adding:
   - `cid`: content CID string form.
   - `signature`: `{ "$bytes": <base64> }`.
   - **Do not** include `repository` — it's only used during CID computation.
6. Append the attestation object to `record["signatures"]` (creating the array if needed).

Output: the record with one new entry in `signatures`.

## Verify — procedure

Given: `record` (with `signatures[]`), `repository` DID, a way to resolve `key` → public key.

For each entry in `signatures` whose `$type` is **not** `com.atproto.repo.strongRef`:

1. Let `attestation = signatures[i]`.
2. Rebuild the signing-time metadata: strip `cid` and `signature` from `attestation`.
3. Compute the content CID per `cid-computation.md` using the stripped metadata.
4. Compare to `attestation.cid`. Must match (compare by binary form). If not, **reject**.
5. Resolve `attestation.key` to a public key.
6. Base64-decode `attestation.signature.$bytes`.
7. Verify the signature against the **36-byte binary content CID** using the public key. If ECDSA verification fails, **reject**.

If all signatures pass, the record is verified. Note: verification does not check the *semantic* meaning of the attestation (who is allowed to attest to what) — that's application policy.

## Multiple inline attestations on one record

A record can have multiple inline attestations (e.g., authorship + third-party endorsement). Each signature is computed over the record with `signatures` stripped, so the order in which they were added does not matter. All past signatures remain valid when a new one is appended — the old ones were computed with `signatures` removed, and the new one is too.

## The `$bytes` wrapper

Attestation `signature` is an object with a single `$bytes` key whose value is base64. This is AT Protocol's standard way to embed binary in JSON. When the record is DAG-CBOR encoded (e.g., to store in a PDS), the `$bytes` form is replaced with a raw CBOR byte string; the JSON representation is for interchange.

Consequence: when computing a CID on a signed record (e.g., for the PDS to store), the `$bytes` wrapper encodes to a CBOR byte string, not a map. This is different from computing the content CID for signing, where the attestation hasn't been added yet and `$bytes` doesn't appear.

## Curve support

| Curve    | Reference crate | Notes                                                                                  |
| -------- | --------------- | -------------------------------------------------------------------------------------- |
| P-256    | ✅ full          | 64-byte signatures (r‖s). Low-S normalization implemented.                             |
| K-256    | ✅ full          | 64-byte signatures (r‖s). Low-S normalization implemented.                             |
| P-384    | ⚠️ partial      | Signing/verification via `atproto-identity::sign/validate` works. Low-S normalization is **not** implemented in the reference crate — `normalize_signature` returns `UnsupportedKeyType` for P-384. Avoid P-384 for interop until this is resolved. |

See `../rust/signatures.md` for exact behavior and `divergence-matrix.md` for cross-language coverage.

## Common mistakes

- **Signing the CID string instead of the binary CID.** The string is 59 characters; the binary is 36 bytes. These are not interchangeable. ECDSA signs bytes.
- **Forgetting to normalize to low-S before base64.** The verifier (per the reference) may reject high-S signatures. Even if it doesn't, you've introduced a malleability opportunity.
- **DER-encoding the signature.** ECDSA libraries often return DER by default. This spec requires raw `r‖s` (IEEE P1363) form. Convert if needed.
- **Including `repository` in the stored attestation.** It must not appear in the final object — only in the transient `$sig` during CID computation.
- **Appending to `signatures` before computing the CID.** The CID is over the record *without* `signatures`. Compute first, then append.
- **Using URL-safe base64 for `signature.$bytes`.** Spec uses standard base64 (alphabet + `=` padding). URL-safe (`-_` instead of `+/`) decodes to different bytes for 62/63 characters.

## See also

- `cid-computation.md` — step-by-step CID build.
- `signature-normalization.md` — low-S rules.
- `remote-attestation.md` — the signature-less counterpart.
- `test-vectors.md` — current fixtures.
- `../rust/creating.md`, `../typescript/creating.md`, `../go/creating.md` — per-language create flow.
- `../rust/verifying.md`, `../typescript/verifying.md`, `../go/verifying.md` — per-language verify flow.

# Content CID computation

The content CID is the thing that gets signed (inline) or referenced (remote). Every implementation must compute it bit-exactly the same way or signatures won't verify across languages. This file is the procedure, annotated.

## Inputs

- `record_obj` — the subject record as a JSON object. Must have a `$type` field.
- `metadata_obj` — the attestation metadata as a JSON object. Must have a `$type` field.
- `repository` — the DID string of the repo where the subject record lives.

## Procedure

### Step 1. Validate inputs

- Both `record_obj` and `metadata_obj` must be JSON objects (not arrays, not scalars). Reject otherwise.
- Both must have a non-empty string `$type` field. Reject otherwise.

Reference crate raises `RecordMustBeObject`, `MetadataMustBeObject`, `RecordMissingType`, `MetadataMissingSigType` respectively.

### Step 2. Strip the record

From `record_obj`, remove the `signatures` field if present. All other fields pass through unchanged.

Rationale: the record must canonicalize to the same thing regardless of what's already in `signatures`. Signing a record twice (two inline attestations, or inline + remote) requires each signature to compute over a record that *excludes* all existing signatures.

### Step 3. Prepare `$sig` metadata

Starting from `metadata_obj`:

1. Remove `cid` if present. (This is a computed output, not an input.)
2. Remove `signature` if present. (Inline attestations write this field *after* CID computation.)
3. Insert `repository: <repository>` as a string value.

All other metadata fields pass through unchanged — **they participate in the CID**. Adding, removing, or changing any custom field (`issuer`, `purpose`, `issuedAt`, anything else) invalidates all signatures.

### Step 4. Merge

Insert the prepared metadata into the stripped record under key `$sig`:

```
record_obj["$sig"] = metadata_obj
```

This is a single top-level field addition. The record should now have every original field (minus `signatures`), plus `$sig`.

### Step 5. Encode

Serialize the merged object to **DAG-CBOR**.

DAG-CBOR is a canonical subset of CBOR. Key rules the encoder must follow:

- Map keys sorted lexicographically by their UTF-8 byte sequence.
- Integers encoded in their shortest form (no leading zero bytes in multi-byte integers).
- Floats always encoded as 64-bit (8-byte) IEEE 754.
- Strings are definite-length. No indefinite-length strings, arrays, or maps.
- Tags: only tag 42 (CID link) is permitted. No other tags.
- No duplicate keys.

Every major language has a DAG-CBOR library — use it, don't hand-roll CBOR. See per-language guides for recommended libraries.

### Step 6. Hash

SHA-256 the DAG-CBOR bytes. 32-byte digest.

### Step 7. Wrap as CIDv1

Build a CIDv1:

- Version: `1` (byte `0x01`).
- Codec: `0x71` (dag-cbor).
- Multihash code: `0x12` (SHA-256).
- Multihash length: `0x20` (32).
- Digest: the 32 bytes from step 6.

Binary form: `01 71 12 20 <32 bytes>` = 36 bytes total.

String form: `b` + base32lower(binary). Always starts with `bafyrei…` for this codec+hash pair.

This is the **content CID**. It is what inline attestations sign and what remote attestations reference.

## What "sign the CID bytes" means

For inline attestations, step 2 of signing is:

```
signature = ECDSA_sign(private_key, content_cid_bytes)
```

Where `content_cid_bytes` is the **36-byte binary form** of the content CID (`01 71 12 20 <digest>`). **Not** the string form, **not** just the digest. The reference crate uses `cid.to_bytes()` which returns the 36-byte binary form.

This is important: it means the signature covers the full CID header (including codec and hash algorithm identifiers), not just the 32-byte hash. A substitution attack that tried to reinterpret the digest under a different hash function would produce different signed bytes.

## Worked micro-example

Record:

```json
{"$type": "app.example.post", "text": "hi"}
```

Metadata:

```json
{"$type": "com.example.sig", "key": "did:key:zEXAMPLE", "purpose": "demo"}
```

Repository: `did:plc:abc123`

After step 2–4, the object to encode is:

```json
{
  "$sig": {
    "$type": "com.example.sig",
    "key": "did:key:zEXAMPLE",
    "purpose": "demo",
    "repository": "did:plc:abc123"
  },
  "$type": "app.example.post",
  "text": "hi"
}
```

(Note the sort order: `$sig` before `$type` because `$` (0x24) is the same, then `s` (0x73) < `t` (0x74).)

DAG-CBOR encode → SHA-256 → wrap as CIDv1. The exact byte output is deterministic; see `test-vectors.md` for runnable fixtures.

## What is NOT in the signed payload

- The `signatures` array (stripped in step 2).
- Fields named `cid` or `signature` inside the metadata (stripped in step 3).
- Any whitespace, key ordering, or formatting from the JSON you were handed — DAG-CBOR re-encodes from the object model.
- The private key, the public key, the issuer identity as a separate input. The only identity input to the CID is `repository`.

## Common mistakes

- **Forgetting to strip `signatures` before encoding.** Produces a different CID than what the reference implementation generates. Every new signature would be invalid.
- **Leaving `cid` / `signature` inside the metadata before merge.** Same problem: the reference strips them and yours doesn't.
- **Forgetting to insert `repository`.** Kills replay protection and produces a CID that won't match the reference's output.
- **Signing the digest instead of the full 36-byte CID.** Silent interop break — implementations that sign `cid.to_bytes()` will not verify signatures that sign `cid.hash().digest()`.
- **Using non-canonical CBOR.** Indefinite-length strings, unsorted keys, or inefficient integer encoding all produce different bytes. Use a DAG-CBOR library, not generic CBOR.
- **Copying the stored attestation back as metadata on re-verify without stripping `cid` and `signature`.** The verifier must re-apply step 3 to recover the CID-time view.
- **Serializing the outer object as JSON and then CBOR-encoding that string.** Double encoding. The object must go straight into the DAG-CBOR encoder.

## See also

- `spec.md` §4 — the high-level overview this file expands.
- `inline-attestation.md` — how the content CID feeds into ECDSA signing.
- `remote-attestation.md` — how the content CID sits inside the proof record.
- `../rust/signatures.md`, `../typescript/signatures.md`, `../go/signatures.md` — library-specific DAG-CBOR + SHA-256 + CID assembly.

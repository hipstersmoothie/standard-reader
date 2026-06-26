# Rust — creating attestations

Both flows — inline and remote — are single-call. The hard work (CID computation, DAG-CBOR encoding, ECDSA signing + normalization, strongRef construction, TID generation) is inside the crate; callers wire inputs.

## Inline: sign a record in one call

```rust
use atproto_attestation::{create_inline_attestation, AnyInput};
use atproto_identity::key::{generate_key, to_public, KeyType};
use serde_json::json;

fn main() -> anyhow::Result<()> {
    let private_key = generate_key(KeyType::K256Private)?;
    let public_key  = to_public(&private_key)?;

    let record = json!({
        "$type": "app.bsky.feed.post",
        "text": "Hello, attested world!",
        "createdAt": "2026-04-22T00:00:00.000Z"
    });

    let metadata = json!({
        "$type": "com.example.inlineSignature",
        "key": public_key.to_string(),      // did:key:z…
        "issuer": "did:plc:issuer123",
        "issuedAt": "2026-04-22T00:00:00.000Z",
        "purpose": "authorship"
    });

    let repository = "did:plc:publisher456";

    let signed = create_inline_attestation(
        AnyInput::Serialize(record),
        AnyInput::Serialize(metadata),
        repository,
        &private_key,
    )?;

    println!("{}", serde_json::to_string_pretty(&signed)?);
    Ok(())
}
```

What the function does internally (maps to `shared/cid-computation.md`):

1. Clones `record`, strips `signatures`.
2. Clones `metadata`, strips `cid`/`signature`, inserts `repository`.
3. Merges metadata under `$sig`, DAG-CBOR encodes, SHA-256, wraps as CIDv1.
4. `atproto_identity::key::sign(&private_key, &content_cid.to_bytes())` — signs the **36-byte binary CID**.
5. `normalize_signature(raw, key_type)` — low-S.
6. Base64-encodes the 64 bytes, inserts into metadata as `signature: { "$bytes": … }`.
7. Inserts `cid: "bafyrei…"` into metadata.
8. Appends metadata to `record.signatures`.

Output: the original record with one new entry in its `signatures` array. Publish it via your PDS's `com.atproto.repo.putRecord`.

### Signing a typed struct

If your record is a typed lexicon, pass it directly — `AnyInput::Serialize` is generic over `S: Serialize + Clone`:

```rust
#[derive(Serialize, Clone)]
struct Post {
    #[serde(rename = "$type")]
    ty: String,
    text: String,
}

let post = Post { ty: "app.bsky.feed.post".into(), text: "typed".into() };

let signed = create_inline_attestation(
    AnyInput::Serialize(post),
    AnyInput::Serialize(metadata),
    repository,
    &private_key,
)?;
```

The output is a `serde_json::Value` regardless — the attestation layer is untyped above the CID.

## Remote: create proof + attested record

```rust
use atproto_attestation::{create_remote_attestation, AnyInput};
use serde_json::json;

fn main() -> anyhow::Result<()> {
    let record = json!({
        "$type": "app.bsky.feed.post",
        "text": "signed by remote attestor"
    });

    let metadata = json!({
        "$type": "com.example.attestation",
        "issuer": "did:plc:attestor999",
        "purpose": "endorsement"
    });

    let subject_repo  = "did:plc:publisher456";
    let attestor_repo = "did:plc:attestor999";

    let (attested_record, proof_record) = create_remote_attestation(
        AnyInput::Serialize(record),
        AnyInput::Serialize(metadata),
        subject_repo,
        attestor_repo,
    )?;

    // 1) Publish proof_record to attestor_repo under collection <metadata.$type>, rkey = TID.
    //    (The function already chose a TID; it's encoded in the strongRef inside attested_record.)
    //
    // 2) Publish attested_record to subject_repo (or return it for the subject to publish).
    Ok(())
}
```

### What the function returns

| Value              | Where it goes                                                                            |
| ------------------ | ---------------------------------------------------------------------------------------- |
| `attested_record`  | The subject record, with a strongRef appended to `signatures`. Lives in `subject_repo`. |
| `proof_record`     | The metadata object with `cid: <content CID>`. Must be published under `attestor_repo` at the URI baked into the strongRef. |

### Recovering the AT-URI

The strongRef's `uri` field is built from `attestor_repo`, `metadata.$type`, and a freshly-generated `Tid::new()`. You extract it from the attested record:

```rust
let uri = attested_record
    ["signatures"][0]["uri"]
    .as_str()
    .expect("strongRef uri");
// → "at://did:plc:attestor999/com.example.attestation/3kxh2f4j…"
```

That URI tells you where to publish `proof_record`. The `rkey` is the trailing segment.

### Important: you must actually publish `proof_record`

The attested record contains a strongRef pointing at an AT-URI. If you don't publish the proof record at that URI, verifiers get a 404 and reject the attestation. This is the single most common mistake — the function *prepares* the records; publishing them is the caller's job.

A typical publish sequence:

```rust
// Pseudocode — use atproto-client or your XRPC client of choice.
let (attested, proof) = create_remote_attestation(...)?;

// 1. Publish proof_record first — this way, if the subject record write fails,
//    you have a dangling proof (harmless) rather than a dangling strongRef (broken).
let (rkey, _collection) = extract_rkey_from_uri(&attested)?;
pds.put_record(attestor_repo, "com.example.attestation", &rkey, &proof).await?;

// 2. Then publish the attested record.
pds.put_record(subject_repo, "app.bsky.feed.post", &post_rkey, &attested).await?;
```

## Appending to an existing record (second attestation)

Both `create_inline_attestation` and `create_remote_attestation` are safe to call on a record that already has entries in `signatures`. They:

1. Clone the record.
2. In the CID pipeline, strip `signatures` (so the new signature is computed over the *unsigned* content).
3. Append the new attestation to the existing `signatures` array.

Old signatures remain valid because they were also computed over the stripped version.

## Low-level: `create_signature`

If you need to control the record layout yourself — e.g., you're embedding the signature into a non-standard field — use `create_signature` to get the raw normalized signature bytes:

```rust
use atproto_attestation::{create_signature, AnyInput};

let bytes = create_signature(
    AnyInput::Serialize(record),
    AnyInput::Serialize(metadata),
    repository,
    &private_key,
)?;

// bytes is 64 bytes (r‖s, P-256 or K-256), low-S normalized.
// Caller is responsible for base64, wrapping in `$bytes`, and inserting into whatever shape.
```

## Validating + appending an attestation from a different signer

`append_inline_attestation` is for the case where **someone else** produced a signature and handed you the attestation object; you want to validate it and tack it onto your record.

```rust
use atproto_attestation::{append_inline_attestation, AnyInput};

let signed = append_inline_attestation(
    AnyInput::Serialize(record),
    AnyInput::Serialize(attestation), // as produced by a peer
    repository,
    key_resolver,                     // your KeyResolver impl
).await?;
```

It:

1. Recomputes the content CID from the record + attestation (with `cid`/`signature` stripped) + repository.
2. Compares to the claimed `cid` — rejects on mismatch.
3. Resolves `attestation.key` via `key_resolver` to a `KeyData`.
4. Base64-decodes `signature.$bytes`, calls `atproto_identity::key::validate(&key_data, &bytes, &computed_cid.to_bytes())`.
5. On success, appends the attestation to `record.signatures`.

So callers never manipulate unvalidated signatures — the append *is* the validation.

## `append_remote_attestation`

Mirror for remote. You've been handed a proof record (bytes + AT-URI) that was already published somewhere; append a strongRef to the subject record.

```rust
let signed = append_remote_attestation(
    AnyInput::Serialize(record),
    AnyInput::Serialize(proof_metadata),
    repository,
    "at://did:plc:attestor999/com.example.attestation/3kxh2f…",
)?;
```

Internally it:

1. Computes the content CID from record + proof_metadata (with `cid` stripped) + repository.
2. Compares to `proof_metadata.cid` — rejects on mismatch.
3. Computes the proof record's **DAG-CBOR CID** (plain `create_dagbor_cid`, no `$sig`).
4. Builds the strongRef and appends.

The function does **not** fetch the AT-URI — it trusts the caller's in-hand `proof_metadata` to be exactly what's stored there. Fetch separately if you need that guarantee; verification in `verify_record` does fetch.

## Common mistakes

- **Forgetting to publish the proof record.** See above — the attested record without the proof is a broken reference.
- **Using `create_dagbor_cid` where you mean `create_attestation_cid`.** The first is for the *proof record's* CID (no `$sig` merge). The second (private, used inside the crate) is for the *content CID* (with `$sig` merge). Callers should use the high-level functions and let them pick.
- **Passing a public key as `private_key_data`.** `sign` errors out; this surfaces as `SignatureCreationFailed`.
- **Not using `tokio` feature when calling async functions.** `append_inline_attestation` and `verify_record` require a runtime.
- **Mutating the record in place before signing and then re-signing.** Sign once, get the signed output, then mutate a copy — mutating after signing invalidates the CID.

## See also

- `verifying.md` — the inverse flow.
- `signatures.md` — what happens inside `sign` + `normalize_signature`.
- `../shared/inline-attestation.md`, `../shared/remote-attestation.md` — the language-neutral procedures these implement.

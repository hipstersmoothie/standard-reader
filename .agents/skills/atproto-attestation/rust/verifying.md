# Rust — verifying attestations

One function: `verify_record`. It walks every entry in `record.signatures` and rejects the record if any fails. Inline and remote are handled in the same loop — dispatch is on `$type == com.atproto.repo.strongRef`.

## Shape

```rust
pub async fn verify_record<R, RR, KR>(
    verify_input: AnyInput<R>,
    repository: &str,
    key_resolver: KR,
    record_resolver: RR,
) -> Result<(), AttestationError>
where
    R: Serialize + Clone,
    RR: atproto_client::record_resolver::RecordResolver,
    KR: atproto_identity::key::KeyResolver,
```

- **`verify_input`**: the record as you received it, with its `signatures` array intact.
- **`repository`**: the DID of the repo the record was fetched from. Critical — if you pass the wrong DID, valid attestations fail verification (that's the replay protection working as designed).
- **`key_resolver`**: turns `did:key:…` (or arbitrary DID+keyid references) into `KeyData` public keys.
- **`record_resolver`**: fetches remote proof records by AT-URI.

Returns `Ok(())` on full success. Any `Err(AttestationError::…)` means reject the record.

## Minimal example

```rust
use atproto_attestation::{verify_record, AnyInput, RecordResolver};
use atproto_identity::key::{KeyData, KeyError, KeyResolver};
use async_trait::async_trait;
use serde_json::Value;

struct InlineKeyResolver;

#[async_trait]
impl KeyResolver for InlineKeyResolver {
    async fn resolve(&self, key: &str) -> Result<KeyData, anyhow::Error> {
        // Simplest case: `key` is already a `did:key:…`; parse directly.
        atproto_identity::key::identify_key(key)
            .map_err(|e| anyhow::anyhow!("failed to parse key {key}: {e}"))
    }
}

// For a record with no remote attestations you can use a never-called stub:
struct NullRecordResolver;

#[async_trait]
impl RecordResolver for NullRecordResolver {
    async fn resolve<T: serde::de::DeserializeOwned + Send>(&self, _uri: &str)
        -> Result<T, anyhow::Error>
    {
        Err(anyhow::anyhow!("no remote resolution configured"))
    }
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let record: Value = serde_json::from_str(SIGNED_RECORD)?;
    let repository   = "did:plc:publisher456";

    verify_record(
        AnyInput::Serialize(record),
        repository,
        InlineKeyResolver,
        NullRecordResolver,
    ).await?;

    println!("✓ all signatures valid");
    Ok(())
}
```

## What `verify_record` does, per signature

For each entry in `record.signatures`:

1. Read `$type`.
2. **If strongRef (`com.atproto.repo.strongRef`) — remote branch:**
   a. Extract `uri`.
   b. `record_resolver.resolve::<serde_json::Value>(uri)` — fetch the proof record bytes, decode to `Value`.
   c. Recompute the content CID over `(record, proof_metadata, repository)` — same procedure as create.
   d. Compare to `proof_metadata.cid`. Mismatch → `RemoteAttestationCidMismatch`.
   e. **No signature check** — integrity is content-addressed. If the CID matches, the attestation is valid.
3. **Else — inline branch:**
   a. Treat the signature object as the attestation metadata.
   b. Recompute the content CID over `(record, metadata, repository)`.
   c. Read `metadata.key` → `key_resolver.resolve(key)` → `KeyData`.
   d. Read `metadata.signature.$bytes`, base64-decode.
   e. `atproto_identity::key::validate(&key_data, &signature_bytes, &computed_cid.to_bytes())`.
   f. Fail → `SignatureValidationFailed`.

Every other signature keeps going. A single failure short-circuits the whole function with an error.

### What `verify_record` does NOT check

- It does **not** check that `record_resolver` fetched the bytes of the strongRef's `cid`. It fetches by `uri` only. If you want the stronger guarantee, hydrate the resolver so it recomputes the fetched record's CID and compares to the strongRef's `cid` before returning. (That's a correctness responsibility of your resolver impl; see below.)
- It does **not** enforce low-S on inline signatures. `atproto_identity::key::validate` is permissive — it accepts both low-S and high-S. If your threat model demands strict low-S on verify, wrap with a pre-check on `signature_bytes`.
- It does **not** check `issuedAt` for freshness, `issuer` for authorization, or any other semantic field. Those are application-policy decisions the caller makes *after* `verify_record` returns `Ok(())`.

## Writing a `KeyResolver`

The trait:

```rust
#[async_trait]
pub trait KeyResolver {
    async fn resolve(&self, key: &str) -> Result<KeyData, anyhow::Error>;
}
```

Common implementations:

### `did:key:…` only

```rust
use atproto_identity::key::{identify_key, KeyData};
use async_trait::async_trait;

struct DidKeyResolver;

#[async_trait]
impl atproto_identity::key::KeyResolver for DidKeyResolver {
    async fn resolve(&self, key: &str) -> Result<KeyData, anyhow::Error> {
        identify_key(key).map_err(Into::into)
    }
}
```

`identify_key` parses `did:key:z…` (multibase + multicodec) into the appropriate public `KeyData`. No I/O.

### DID document lookup

If `key` is a DID + key ID (e.g., `did:plc:xyz#atproto_signing_key`), resolve the DID doc and pull the `verificationMethod`:

```rust
struct DidDocResolver { /* http client, cache, … */ }

#[async_trait]
impl atproto_identity::key::KeyResolver for DidDocResolver {
    async fn resolve(&self, key: &str) -> Result<KeyData, anyhow::Error> {
        let (did, fragment) = split_did_key(key)?;      // "did:plc:xyz", "atproto_signing_key"
        let doc = self.fetch_did_document(&did).await?; // did:plc / did:web / did:webvh
        let vm  = doc.find_verification_method(&fragment)?;
        key_data_from_verification_method(&vm)
    }
}
```

See the `atproto-identity-resolution` skill for the DID resolution half.

### Cached / offline

For batch jobs, build a `HashMap<String, KeyData>` from a trusted source and return from memory:

```rust
struct StaticKeyResolver(HashMap<String, KeyData>);

#[async_trait]
impl KeyResolver for StaticKeyResolver {
    async fn resolve(&self, key: &str) -> Result<KeyData, anyhow::Error> {
        self.0.get(key)
            .cloned()
            .ok_or_else(|| anyhow::anyhow!("unknown key {key}"))
    }
}
```

## Writing a `RecordResolver`

The trait (from `atproto_client::record_resolver`):

```rust
#[async_trait]
pub trait RecordResolver {
    async fn resolve<T: serde::de::DeserializeOwned + Send>(&self, uri: &str) -> Result<T, anyhow::Error>;
}
```

A reasonable implementation:

1. Parse `uri` as `at://<did>/<collection>/<rkey>`.
2. Resolve `<did>` → PDS endpoint (identity-resolution skill territory).
3. Call `com.atproto.repo.getRecord` on that PDS with the parsed `collection` and `rkey`.
4. Return `response.value` deserialized to `T`.

```rust
struct PdsRecordResolver { client: reqwest::Client, identity: IdentityResolver }

#[async_trait]
impl RecordResolver for PdsRecordResolver {
    async fn resolve<T: serde::de::DeserializeOwned + Send>(&self, uri: &str)
        -> Result<T, anyhow::Error>
    {
        let AtUri { did, collection, rkey } = parse_at_uri(uri)?;
        let pds = self.identity.resolve_pds(&did).await?;
        let resp: GetRecordResponse<T> = self.client
            .get(format!("{pds}/xrpc/com.atproto.repo.getRecord"))
            .query(&[("repo", did.as_str()), ("collection", &collection), ("rkey", &rkey)])
            .send().await?
            .error_for_status()?
            .json().await?;
        Ok(resp.value)
    }
}
```

### Optional: verify proof CID at fetch time

For stricter integrity guarantees, have your resolver recompute the fetched record's DAG-CBOR CID and compare to the strongRef's `cid`. `verify_record` does not do this itself — it only checks the *content* CID (inside the proof record) matches.

## Verifying only one attestation

There's no per-entry API. Slice the array yourself:

```rust
let mut record = record.clone();
if let Some(arr) = record.get_mut("signatures").and_then(Value::as_array_mut) {
    arr.retain(|entry| /* predicate picking only the one you want */);
}
verify_record(AnyInput::Serialize(record), repo, key_resolver, record_resolver).await?;
```

Remember: stripping other entries does *not* invalidate the remaining one — the CID is computed over the record with `signatures` stripped entirely, so it doesn't matter what else is (or was) there.

## Common mistakes

- **Passing the wrong `repository` DID.** All signatures on the record are bound to the repo they live in. Use the DID you *fetched the record from*. Hardcoding or mixing up repos is the #1 cause of false-negative verification.
- **Assuming `record_resolver` is infallible.** Attestors can delete proof records at any time. Handle `RemoteAttestationFetchFailed` as "attestation is no longer provable" rather than crashing the caller.
- **Verifying a record you've mutated.** The verifier recomputes the CID from the record's own fields. Any mutation before verification (even "cosmetic" ones like sorting keys — DAG-CBOR will re-sort anyway, but adding/removing fields breaks it) invalidates all signatures.
- **Trusting `issuer` without checking `key`.** `issuer` is an informational string on inline attestations. Authorization lives in *who controls the key `metadata.key` references*. Resolve carefully.
- **Using `async-trait` but forgetting `?Send`.** If your runtime requires `Send` futures (most do), your `KeyResolver`/`RecordResolver` must produce `Send + Sync` futures; the trait's `#[async_trait]` handles this, but generic types inside do not get auto-`Send`.

## See also

- `creating.md` — the inverse flow.
- `signatures.md` — validate semantics.
- `../shared/inline-attestation.md` §Verify — the language-neutral procedure.
- `../shared/remote-attestation.md` §Verify — the remote half.

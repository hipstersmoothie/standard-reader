# Rust — DID document validation and bidirectional checks

`atproto_identity` gives you a parsed `Document` but **does not enforce the atproto-required shape or run the bidirectional handle check.** Those are caller responsibilities. This file shows how to add them on top of the crate's primitives.

## The `Document` type

```rust
use atproto_identity::model::{Document, VerificationMethod, Service};

pub struct Document {
    pub context: Vec<String>,
    pub id: String,
    pub also_known_as: Vec<String>,
    pub service: Vec<Service>,
    pub verification_method: Vec<VerificationMethod>,
    pub extra: HashMap<String, serde_json::Value>,
}
```

Built-in helpers on `Document`:

| Method                | Return type        | Behaviour                                                                  |
| --------------------- | ------------------ | -------------------------------------------------------------------------- |
| `handles()`           | `Option<&str>`     | First `also_known_as` entry, with `at://` prefix stripped if present.      |
| `pds_endpoints()`     | `Vec<&str>`        | `service_endpoint`s of every service with `type == "AtprotoPersonalDataServer"`. |
| `did_keys()`          | `Vec<&str>`        | `public_key_multibase`s of every `VerificationMethod::Multikey`.            |

These are convenient but under-specified for atproto — they do not filter by `#atproto` / `#atproto_pds` suffixes, nor do they enforce `controller == self.id`. Use them for quick access; run stricter checks in a wrapper.

## Structural checks (what atproto requires beyond the DID spec)

A DID document is atproto-usable only if all three are true:

1. `also_known_as` contains at least one entry starting with `at://` whose remainder is a valid handle.
2. `verification_method` contains a `Multikey` with `id` ending `#atproto`, `controller == document.id`, and a non-empty `public_key_multibase`.
3. `service` contains an entry with `id` ending `#atproto_pds`, `type == "AtprotoPersonalDataServer"`, and a `service_endpoint` that is a clean `https://host[:port]` URL (no path, no userinfo, no query).

A structural-check wrapper you can drop into your codebase:

```rust
use atproto_identity::model::{Document, VerificationMethod};
use atproto_identity::validation::is_valid_handle;

#[derive(Debug, thiserror::Error)]
pub enum AtprotoDocError {
    #[error("no at:// alsoKnownAs entry")]
    MissingHandleBinding,
    #[error("no #atproto Multikey verification method")]
    MissingAtprotoKey,
    #[error("no #atproto_pds AtprotoPersonalDataServer service")]
    MissingPdsService,
    #[error("PDS endpoint has disallowed path or query: {0}")]
    InvalidPdsEndpoint(String),
}

pub fn ensure_atproto_shape(doc: &Document) -> Result<(), AtprotoDocError> {
    let has_handle = doc
        .also_known_as
        .iter()
        .filter_map(|aka| aka.strip_prefix("at://"))
        .any(|handle| is_valid_handle(handle).is_some());
    if !has_handle {
        return Err(AtprotoDocError::MissingHandleBinding);
    }

    let has_key = doc.verification_method.iter().any(|vm| match vm {
        VerificationMethod::Multikey { id, controller, public_key_multibase, .. } => {
            id.ends_with("#atproto")
                && controller == &doc.id
                && !public_key_multibase.is_empty()
        }
        _ => false,
    });
    if !has_key {
        return Err(AtprotoDocError::MissingAtprotoKey);
    }

    let pds = doc
        .service
        .iter()
        .find(|s| s.id.ends_with("#atproto_pds") && s.r#type == "AtprotoPersonalDataServer");
    let Some(pds) = pds else {
        return Err(AtprotoDocError::MissingPdsService);
    };
    let url = url::Url::parse(&pds.service_endpoint)
        .map_err(|_| AtprotoDocError::InvalidPdsEndpoint(pds.service_endpoint.clone()))?;
    if url.scheme() != "https" || !url.path().is_empty() && url.path() != "/"
        || url.query().is_some() || !url.username().is_empty() || url.password().is_some()
    {
        return Err(AtprotoDocError::InvalidPdsEndpoint(pds.service_endpoint.clone()));
    }

    Ok(())
}
```

(`url` is a thin dependency; if you already have `reqwest` in your tree, you have `url`.)

## Bidirectional handle check

If you started from a handle, the DID document's `also_known_as` must list `at://<handle>` (case-insensitive on the handle label). If it does not, the DID does not claim this handle, and you emit `handle.invalid` to callers.

```rust
#[derive(Debug, thiserror::Error)]
#[error("handle '{claimed}' not listed in DID document alsoKnownAs")]
pub struct BidirectionalCheckFailed {
    pub claimed: String,
}

pub fn ensure_bidirectional(
    claimed_handle: &str,
    doc: &Document,
) -> Result<(), BidirectionalCheckFailed> {
    let claimed = claimed_handle.to_ascii_lowercase();
    let listed = doc
        .also_known_as
        .iter()
        .filter_map(|aka| aka.strip_prefix("at://"))
        .any(|h| h.to_ascii_lowercase() == claimed);

    if listed {
        Ok(())
    } else {
        Err(BidirectionalCheckFailed {
            claimed: claimed_handle.to_string(),
        })
    }
}
```

Notes:

- Case-insensitive compare on the handle label only. DIDs are case-sensitive; don't lowercase them.
- The spec accepts the first syntactically valid `at://` entry as the primary handle, but for bidi verification you want *any* listed match — an identity can legitimately list multiple handles. This differs from `Document::handles()`, which returns only the first.

## Emitting `handle.invalid`

When `ensure_bidirectional` fails, the account record should carry the sentinel `handle.invalid` instead of the failing handle, per the handle spec:

```rust
let displayed_handle = match ensure_bidirectional(&claimed_handle, &document) {
    Ok(()) => claimed_handle.clone(),
    Err(_) => "handle.invalid".to_string(),
};
```

Also emit `handle.invalid` when:

- Handle syntax validation failed upstream (`is_valid_handle` returned `None`).
- Handle resolution produced no DID at all after retries (`NoDIDsFound`).

Do **not** emit `handle.invalid` during transient outages — `HTTPResolutionFailed`, `DNSResolutionFailed`, `ConflictingDIDsFound` on a flaky network. Retry with backoff first; latching the sentinel prematurely hides the network from users.

## Reserved TLD coverage (if you need spec-complete handling)

The crate's `RESERVED_TLDS` covers 4 of the 9 in the spec: `.localhost`, `.internal`, `.arpa`, `.local`. Missing: `.alt`, `.example`, `.invalid`, `.onion`, `.test`.

For full coverage, pre-check before calling `is_valid_handle`:

```rust
const EXTRA_RESERVED_TLDS: &[&str] =
    &[".alt", ".example", ".invalid", ".onion", ".test"];

fn is_reserved_tld(handle: &str) -> bool {
    EXTRA_RESERVED_TLDS.iter().any(|tld| handle.ends_with(tld))
}

fn validate_handle_strict(input: &str) -> Option<String> {
    if is_reserved_tld(input) {
        return None;
    }
    atproto_identity::validation::is_valid_handle(input)
}
```

`.test` is permitted in dev environments; skip `".test"` from the strict-mode list if you need that.

## Selecting PDS endpoint and atproto signing key

For the common case — "give me this identity's PDS base URL" and "give me its atproto signing key":

```rust
pub fn pds_endpoint(doc: &Document) -> Option<&str> {
    doc.service
        .iter()
        .find(|s| s.id.ends_with("#atproto_pds") && s.r#type == "AtprotoPersonalDataServer")
        .map(|s| s.service_endpoint.as_str())
}

pub fn atproto_signing_key(doc: &Document) -> Option<&str> {
    doc.verification_method.iter().find_map(|vm| match vm {
        VerificationMethod::Multikey { id, controller, public_key_multibase, .. }
            if id.ends_with("#atproto") && controller == &doc.id =>
        {
            Some(public_key_multibase.as_str())
        }
        _ => None,
    })
}
```

The crate's built-in `doc.pds_endpoints()` and `doc.did_keys()` do looser matching. Prefer the explicit `#atproto_pds` / `#atproto` filter for security-sensitive code (signature verification, auth issuance).

## Signature verification

Full key handling lives in `atproto_identity::key`. For verifying signatures produced by this identity, fetch the `public_key_multibase` with `atproto_signing_key`, feed it to `identify_key`, and use the returned `KeyData` via `KeyResolver`. See the crate docs on `IdentityDocumentKeyResolver` — it's the helper that wires identity resolution into key lookup.

Signature verification itself is out of scope for this skill; it belongs with the `atproto-oauth` skill and the per-key crypto modules.

## See also

- `resolution.md` — the resolver that produces the `Document`.
- `syntax.md` — `is_valid_handle` used above.
- `../shared/did-spec.md` — normative DID-document requirements.
- `../shared/handle-spec.md` — the rules behind `handle.invalid`.
- `../shared/divergence-matrix.md` §bidi-check — how this caller-owned step compares to TypeScript (also caller-owned) and Go (built into `LookupHandle`).

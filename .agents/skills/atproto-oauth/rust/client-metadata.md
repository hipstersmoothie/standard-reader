# Rust — Client metadata document

This file covers publishing a `/oauth-client-metadata.json` document from a Rust service and the key-management plumbing around it. For the rules themselves, see `../shared/client-metadata.md`; this file is the Rust-specific code.

## Minimum viable handler (Axum)

```rust
use atproto_oauth::jwk::generate as jwk_generate;
use axum::{Json, extract::State, http::header, response::IntoResponse};
use serde::Serialize;

#[derive(Serialize)]
struct ClientMetadata {
    client_id: String,
    client_name: String,
    client_uri: String,
    redirect_uris: Vec<String>,
    grant_types: Vec<String>,
    response_types: Vec<String>,
    scope: String,
    application_type: String,
    token_endpoint_auth_method: String,
    token_endpoint_auth_signing_alg: String,
    dpop_bound_access_tokens: bool,
    jwks: Jwks,
}

#[derive(Serialize)]
struct Jwks { keys: Vec<serde_json::Value> }

pub async fn handle_oauth_metadata(
    State(state): State<AppState>,
) -> impl IntoResponse {
    let jwks_keys: Vec<serde_json::Value> = state.config.oauth_public_keys()
        .iter()
        .filter_map(|k| jwk_generate(k).ok().and_then(|w| serde_json::to_value(w).ok()))
        .collect();

    let metadata = ClientMetadata {
        client_id:                      state.config.oauth_client_id(),      // URL of this endpoint
        client_name:                    "Example App".into(),
        client_uri:                     state.config.external_base_url(),
        redirect_uris:                  vec![state.config.oauth_redirect_uri()],
        grant_types:                    vec!["authorization_code".into(), "refresh_token".into()],
        response_types:                 vec!["code".into()],
        scope:                          "atproto transition:generic".into(),
        application_type:               "web".into(),
        token_endpoint_auth_method:     "private_key_jwt".into(),
        token_endpoint_auth_signing_alg:"ES256".into(),
        dpop_bound_access_tokens:       true,
        jwks: Jwks { keys: jwks_keys },
    };
    ([(header::CONTENT_TYPE, "application/json")], Json(metadata))
}
```

Serve it at a stable URL and publish that URL as `client_id`. The rendered JSON must be served verbatim — do not restructure fields between requests, since the AS caches what it sees.

## Generating a JWK from a `KeyData`

`atproto_oauth::jwk::generate` takes a `&KeyData` (from `atproto-identity`) and returns a `WrappedJsonWebKey`:

```rust
use atproto_identity::key::{KeyData, KeyType, generate_key, to_public};
use atproto_oauth::jwk::{generate as jwk_generate, WrappedJsonWebKey};

let private_key: KeyData = generate_key(KeyType::P256Private)?;
let public_key: KeyData  = to_public(&private_key)?;

let wrapped: WrappedJsonWebKey = jwk_generate(&public_key)?;
//   wrapped.kid: Some("did:key:z...")    — stable, derived from the key
//   wrapped.alg: Some("ES256")
//   wrapped._use: Some("sig")
//   wrapped.jwk: JwkEcKey { kty: EC, crv: P-256, x, y }   — NO `d` field
```

**Critical:** always call `to_public` first. `jwk_generate` on a private `KeyData` emits the public half (because the JWK type it produces is `elliptic_curve::JwkEcKey`, which by default serializes both halves), so the deduplication matters — run your tests against the serialized output and assert that `"d"` is never present.

Smoke-test:

```rust
let json = serde_json::to_string(&wrapped)?;
assert!(!json.contains("\"d\""), "private component leaked into published JWK");
```

## Validating your metadata

The Python script `scripts/validate_client_metadata.py` at the repo root catches the common mutations (see `../shared/test-vectors.md` §V5). Run it in CI:

```rust
// Build step:
// python scripts/validate_client_metadata.py path/to/served/metadata.json
```

There is no in-crate validator for metadata because the AS is the authoritative consumer. Your test harness should exercise the real fetch path (enable the plugin locally, hit `/oauth-client-metadata.json`, feed it to the script).

## Key algorithms

`atproto-oauth` supports ES256, ES384, and ES256K for both client assertions and DPoP proofs. The AT Protocol AS-metadata check insists on ES256 in `token_endpoint_auth_signing_alg_values_supported` and `dpop_signing_alg_values_supported` — so your published `token_endpoint_auth_signing_alg` must be `"ES256"` (or declare ES384/ES256K with the understanding that many PDSes will reject).

**Pick ES256 unless you have a specific reason not to.** The `auth_dpop` helper in `atproto-oauth` hard-codes `alg: "ES256"` in the DPoP JWT header regardless of the key you pass it. If you sign with a P-384 (ES384) or secp256k1 (ES256K) key through that path, the server receives a header claiming ES256 and a signature that verifies against the actual curve — and rejects with `invalid_dpop_proof`. Workaround: call the lower-level `dpop::mint` and construct the header yourself. See `dpop.md` and `../shared/divergence-matrix.md` §dpop for the full trace.

```rust
// In atproto-identity::key::KeyType:
pub enum KeyType {
    P256Private,       // ES256 — USE THIS by default
    P256Public,
    P384Private,       // ES384
    P384Public,
    Secp256k1Private,  // ES256K
    Secp256k1Public,
}
```

## Key rotation

Keep multiple keys live in `jwks` while rotating:

```rust
let public_keys: Vec<KeyData> = state.config.oauth_public_keys();
// e.g. vec![current_public, previous_public]
// Both are published; only `current_private` is used to sign new client assertions.
// Drop `previous_public` from the list once the longest-lived refresh_token has expired.
```

A common config file pattern:

```toml
[oauth]
signing_keys = [
  "did:key:z6Mk...current...",     # signing key (used by mint)
  "did:key:z6Mk...previous...",    # kept in jwks for old sessions' refresh
]
```

The first entry is used for new minting; all are published.

## Public (SPA/native) clients

If you're building a public client in Rust (rare — most Rust OAuth clients are BFFs), omit the `jwks` field and set `token_endpoint_auth_method: "none"`:

```rust
#[derive(Serialize)]
struct PublicClientMetadata {
    client_id: String,
    application_type: String,               // "web" for SPA, "native" for desktop
    grant_types: Vec<String>,               // ["authorization_code", "refresh_token"]
    response_types: Vec<String>,            // ["code"]
    scope: String,
    redirect_uris: Vec<String>,
    dpop_bound_access_tokens: bool,         // must be true
    token_endpoint_auth_method: String,     // "none"
    // NO jwks, NO token_endpoint_auth_signing_alg
}
```

Refresh cap drops to 14 days for public clients. The crate does not enforce this — you discover it via `invalid_grant` when your refresh fails at day 15.

## Common pitfalls

- **Hardcoding `client_id` instead of deriving from `external_base_url`.** Breaks the moment the deploy URL changes. Thread the base URL through `config`.
- **`redirect_uris` without the callback path.** The URI in the metadata must byte-exactly match the `redirect_uri` parameter on PAR.
- **`application_type: "web"` with a non-HTTPS redirect.** `http://` is only legal for `http://[127.0.0.1|::1|localhost]` in dev; deploy-time config must swap it out.
- **Forgetting `dpop_bound_access_tokens: true`.** Field must be present and true. Omitting it = AS rejects.
- **Publishing both public and private halves of a key** because you called `jwk_generate` on the private `KeyData`. Always `to_public` first.
- **Serving stale metadata behind a CDN.** The AS caches aggressively. Set `Cache-Control: no-cache` or a short `max-age`; after rotation, wait for the AS's cache to turn over (typically ≤1h).

## See also

- `README.md` — crate layout and companion crates.
- `flows.md` — how client_id is consumed by the flows.
- `../shared/client-metadata.md` — normative rules for the metadata document.
- `../shared/test-vectors.md` — V3–V5 test vectors; feed V5a–f to your validator.
- `../shared/security-requirements.md` §Client assertion keys — rotation semantics.

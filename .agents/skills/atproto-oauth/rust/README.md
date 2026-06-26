# Rust — `atproto-oauth` crate setup

The Rust reference implementation is the [`atproto-oauth`](https://docs.rs/atproto-oauth) crate. Source: <https://tangled.org/ngerakines.me/atproto-crates> (subdir `atproto-oauth`). It covers the full client side of the AT Protocol OAuth profile: PAR, DPoP (with an automatic nonce-retry middleware), PKCE, JWT mint/verify for client assertions, resource/AS discovery, scope parsing, and a storage trait for OAuth-request state.

It is a **client** library. It does not implement the authorization-server side of the flow.

## Install

```toml
[dependencies]
atproto-oauth = "0.14"
atproto-identity = "0.14"        # key generation + identity resolver
reqwest = { version = "0.12", features = ["json"] }
reqwest-middleware = "0.3"
chrono = "0.4"
anyhow = "1"
tokio = { version = "1", features = ["full"] }

# Optional
atproto-oauth = { version = "0.14", features = ["lru", "zeroize"] }
```

Features:

- `lru` — exposes `storage_lru::LruOAuthRequestStorage` for in-memory dev use.
- `zeroize` — derives `Zeroize` / `ZeroizeOnDrop` on secret-bearing structs (`OAuthClient`, `OAuthRequest`, `TokenResponse`). Turn this on in production.

## Companion crates

The OAuth client never works in isolation. Typical combinations:

| Crate                    | Used for                                                                  |
| ------------------------ | ------------------------------------------------------------------------- |
| `atproto-identity`       | `generate_key(KeyType::P256Private)`, `identify_key`, `to_public`, DID doc resolution. |
| `atproto-oauth-aip`      | Authorization-server-side primitives (if you're implementing an AS).      |
| `atproto-oauth-service-token` | Mint/verify service-auth JWTs for inter-PDS calls. Separate skill. |

## Public surface at a glance

```rust
pub use atproto_oauth::{
    // Flow entrypoints (workflow.rs)
    workflow::{oauth_init, oauth_init_with_prompt, oauth_complete, oauth_refresh,
               OAuthClient, OAuthRequest, OAuthRequestState, TokenResponse, ParResponse},

    // DPoP (dpop.rs)
    dpop::{auth_dpop, request_dpop, DpopRetry, validate_dpop_jwt, DpopValidationConfig,
           extract_jwk_thumbprint, is_dpop_error},

    // PKCE (pkce.rs)
    pkce::{generate, challenge},

    // Resource / AS discovery (resources.rs)
    resources::{pds_resources, oauth_protected_resource, oauth_authorization_server,
                AuthorizationServer, OAuthProtectedResource},

    // JWK / thumbprint (jwk.rs)
    jwk::{generate as jwk_generate, thumbprint, to_key_data, WrappedJsonWebKey},

    // JWT (jwt.rs)  — used inside client assertions and DPoP proofs
    jwt::{mint, verify, Header, Claims, JoseClaims},

    // Scopes (scopes.rs)
    scopes::{Scope, parse, parse_multiple, parse_multiple_reduced, serialize_multiple},

    // Storage (storage.rs)
    storage::OAuthRequestStorage,
};
```

## Typical wiring — confidential BFF (most common)

The shortest path from "user clicked Sign in" to "have tokens":

```rust
use atproto_identity::key::{KeyType, generate_key, identify_key, to_public};
use atproto_oauth::{
    pkce::generate as pkce_generate,
    resources::{pds_resources, oauth_authorization_server},
    workflow::{OAuthClient, OAuthRequest, OAuthRequestState, oauth_init, oauth_complete},
};
use rand::distr::{Alphanumeric, SampleString};

// 1. Resolve the user's handle → DID → PDS → AS.
let doc = identity_resolver.resolve("alice.bsky.social").await?;
let pds = doc.pds_endpoints().first().unwrap();
let (_, authorization_server) = pds_resources(&http_client, pds).await?;

// 2. Generate per-attempt secrets.
let (pkce_verifier, code_challenge) = pkce_generate();
let state_str = Alphanumeric.sample_string(&mut rand::rng(), 32);
let nonce     = Alphanumeric.sample_string(&mut rand::rng(), 32);
let dpop_key  = generate_key(KeyType::P256Private)?;

// 3. Persist the pre-flow state keyed by `state_str` (see sessions.md).
oauth_request_store.insert(OAuthRequestData {
    state: state_str.clone(),
    issuer: authorization_server.issuer.clone(),
    authorization_server: authorization_server.issuer.clone(),
    nonce: nonce.clone(),
    pkce_verifier: pkce_verifier.clone(),
    dpop_private_key: dpop_key.to_string(),  // serialized; decode with identify_key
    created_at: chrono::Utc::now(),
    return_to: None,
}).await?;

// 4. PAR + authorize redirect.
let oauth_client = OAuthClient {
    redirect_uri: "https://app.example.com/oauth/callback".into(),
    client_id:    "https://app.example.com/oauth-client-metadata.json".into(),
    private_signing_key_data: confidential_signing_key.clone(),
};
let request_state = OAuthRequestState {
    state: state_str,
    nonce,
    code_challenge,
    scope: "atproto transition:generic".into(),
};
let par = oauth_init(
    &http_client, &oauth_client, &dpop_key,
    Some("alice.bsky.social"), &authorization_server, &request_state,
).await?;

let auth_url = format!(
    "{}?client_id={}&request_uri={}",
    authorization_server.authorization_endpoint,
    urlencoding::encode(&oauth_client.client_id),
    urlencoding::encode(&par.request_uri),
);
// Respond: 302 auth_url.

// --- user approves on AS, browser hits /oauth/callback?code=&state=&iss= ---

// 5. Retrieve the stored pre-flow state, verify `iss`, delete the row.
let data = oauth_request_store.get(&query.state).await?.unwrap();
if query.iss.as_deref() != Some(&data.issuer) { return Err(...); }

// 6. Token exchange. auth_server may re-fetch to catch key rotation.
let dpop_key = identify_key(&data.dpop_private_key)?;
let authorization_server = oauth_authorization_server(&http_client, &data.authorization_server).await?;
let oauth_request = OAuthRequest {
    oauth_state: data.state, issuer: data.issuer, authorization_server: data.authorization_server,
    nonce: data.nonce, pkce_verifier: data.pkce_verifier,
    signing_public_key: to_public(&confidential_signing_key)?.to_string(),
    dpop_private_key: data.dpop_private_key,
    created_at: data.created_at,
    expires_at: data.created_at + chrono::Duration::minutes(10),
};
let tokens = oauth_complete(
    &http_client, &oauth_client, &dpop_key,
    &query.code, &oauth_request, &authorization_server,
).await?;
oauth_request_store.delete(&query.state).await?;

// 7. Verify `tokens.sub` is a DID, stash session, set HttpOnly cookie (see sessions.md).
```

The Smoke Signal reference implementation follows this shape — the three `oauth_*` entry points, plus the storage shim, cover 95% of client code.

## Idioms

- **Async everywhere.** All `oauth_*` functions are `async` and take a `&reqwest::Client`. Share one `reqwest::Client` per process — DPoP nonces are tracked per-client via middleware state.
- **Keys are opaque `KeyData`.** Never write raw PEM/JWK handling yourself; use `atproto_identity::key::generate_key`, `identify_key` (parse serialized form), `to_public` (public half).
- **`DpopRetry` is automatic.** `oauth_init`/`oauth_complete`/`oauth_refresh` wrap the caller-supplied client with a `ChainMiddleware<DpopRetry>` that handles `use_dpop_nonce` retry transparently. You don't mint nonce-bearing proofs yourself during auth.
- **For resource requests (PDS XRPC), call `request_dpop` yourself.** That's not in `workflow.rs` — it's your XRPC client's job. See `dpop.md`.
- **Errors are typed.** Every fallible function returns `Result<T, OAuthClientError>` or a more specific error. `errors.rs` has 30+ variants; match exhaustively rather than stringly.
- **`oauth_authorization_server` validates as it fetches.** If the AS doesn't announce `require_pushed_authorization_requests`, `client_id_metadata_document_supported`, S256, ES256, and the `iss` parameter, the call fails before you build a request. Trust this gate.
- **Scopes are a proper `enum`.** Use `scopes::parse_multiple_reduced` before comparing requested vs granted. Don't string-match.
- **`zeroize` is opt-in.** In production, enable the feature; `OAuthRequest` and `TokenResponse` contain long-lived secrets.

## File map

| Task                                           | File                 |
| ---------------------------------------------- | -------------------- |
| Building and serving `/oauth-client-metadata.json` | `client-metadata.md` |
| The three flow entry points (`oauth_init` / `oauth_complete` / `oauth_refresh`) | `flows.md` |
| DPoP minting, retry middleware, validation     | `dpop.md`            |
| Persisting pre-flow + per-user session state; refresh race | `sessions.md`|

## Reference implementation

The public reference app is Smoke Signal: <https://tangled.org/smokesignal.events/smokesignal>. It implements a confidential BFF on Axum using the `atproto-oauth` crate end-to-end — client-metadata handler, PAR, callback, refresh, logout, and session encryption. Lift code directly when wiring a new app; the patterns are load-bearing and have been through production traffic.

## See also

- `../shared/spec.md` — normative OAuth profile rules.
- `../shared/flows.md` — language-neutral flow diagrams and HTTP byte-level detail.
- `../shared/divergence-matrix.md` — how this Rust stack differs from TypeScript and Go.
- `../shared/troubleshooting.md` — error catalogue.
- Crate docs: <https://docs.rs/atproto-oauth> (if published; otherwise `cargo doc -p atproto-oauth --open` locally).

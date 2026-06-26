# Rust — OAuth flow entry points

Three async functions in `atproto_oauth::workflow` drive the entire client-side flow:

| Function          | HTTP call it makes             | When                                    |
| ----------------- | ------------------------------ | --------------------------------------- |
| `oauth_init`      | `POST /oauth/par`              | User clicks "Sign in"                   |
| `oauth_complete`  | `POST /oauth/token` (code)     | Browser lands on `/oauth/callback`      |
| `oauth_refresh`   | `POST /oauth/token` (refresh)  | Access token near expiry                |

All three handle DPoP, client assertion signing, and the `use_dpop_nonce` retry internally. Your job is to wire them to your web framework, persist state, and set session cookies. For the language-neutral flow, read `../shared/flows.md` first.

## Discovery — `resources::pds_resources`

Before any flow call, resolve the user and discover their AS.

```rust
use atproto_identity::traits::IdentityResolver;
use atproto_oauth::resources::{pds_resources, oauth_authorization_server, oauth_protected_resource};

async fn discover(
    http: &reqwest::Client,
    resolver: &impl IdentityResolver,
    subject: &str,
) -> anyhow::Result<AuthorizationServer> {
    // Handle or DID
    if subject.starts_with("https://") {
        // Entryway URL shortcut (user typed a PDS directly)
        return Ok(oauth_authorization_server(http, subject).await?);
    }
    let doc = resolver.resolve(subject).await?;
    let pds = doc.pds_endpoints().first().ok_or_else(|| anyhow::anyhow!("No PDS"))?;
    let (_resource, authorization_server) = pds_resources(http, pds).await?;
    Ok(authorization_server)
}
```

`pds_resources` fetches both `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server` and enforces the AT Protocol profile checks: single `authorization_servers` entry, `require_pushed_authorization_requests`, `client_id_metadata_document_supported`, S256, ES256, `iss` support. If any check fails, you get `OAuthClientError::InvalidAuthorizationServerResponse` — treat this as a hard fail (see `../shared/troubleshooting.md` §AS metadata rejection).

## 1. `oauth_init` — Pushed Authorization Request

```rust
use atproto_oauth::{
    pkce::generate as pkce_generate,
    workflow::{OAuthClient, OAuthRequestState, oauth_init},
};
use atproto_identity::key::{KeyType, generate_key};
use rand::distr::{Alphanumeric, SampleString};

let (pkce_verifier, code_challenge) = pkce_generate();
let oauth_state = Alphanumeric.sample_string(&mut rand::rng(), 32);
let nonce       = Alphanumeric.sample_string(&mut rand::rng(), 32);
let dpop_key    = generate_key(KeyType::P256Private)?;

let oauth_client = OAuthClient {
    redirect_uri: "https://app.example.com/oauth/callback".into(),
    client_id:    "https://app.example.com/oauth-client-metadata.json".into(),
    private_signing_key_data: signing_key.clone(),  // confidential only; for public, supply anyway — init doesn't use it
};
let request_state = OAuthRequestState {
    state: oauth_state.clone(),
    nonce: nonce.clone(),
    code_challenge,
    scope: "atproto transition:generic".into(),
};

// Persist: oauth_state → { pkce_verifier, dpop_key, issuer, AS URL, created_at, return_to }
oauth_request_store.insert(/* ... */).await?;

let par = oauth_init(
    &http_client,
    &oauth_client,
    &dpop_key,
    Some("alice.bsky.social"),         // login_hint — optional
    &authorization_server,
    &request_state,
).await?;

// Build the redirect URL
let auth_url = format!(
    "{}?client_id={}&request_uri={}",
    authorization_server.authorization_endpoint,
    urlencoding::encode(&oauth_client.client_id),
    urlencoding::encode(&par.request_uri),
);
// Return 302 Location: auth_url
```

What `oauth_init` does under the hood (from `workflow.rs:253-353`):

1. Mints a client-assertion JWT (`iss = sub = client_id`, `aud = authorization_server.issuer`, random 30-char `jti`, `iat`).
2. Mints a DPoP proof with `auth_dpop(&dpop_key, "POST", &par_url)` — no nonce yet.
3. Wraps the HTTP client in `ChainMiddleware::new(DpopRetry::new(..., check_response_body = true))`. The middleware intercepts 400/401 with `use_dpop_nonce`, extracts `DPoP-Nonce`, re-mints with the nonce, and retries once.
4. POSTs form-encoded: `response_type=code&code_challenge=...&code_challenge_method=S256&client_id=...&state=...&redirect_uri=...&scope=...&client_assertion_type=urn:ietf:params:oauth:client-assertion-type:jwt-bearer&client_assertion=...&login_hint=...`.
5. Returns `ParResponse { request_uri, expires_in, extra }`.

`oauth_init_with_prompt` is the same but takes a `prompt` parameter (`"login"`, `"consent"`, etc.) for step-up flows.

### PAR for public clients

`oauth_init` always signs a client assertion. If your client's metadata declares `token_endpoint_auth_method: "none"`, the AS ignores the assertion. Functionally, just pass the signing_key anyway — the AS validates based on metadata, not what you sent. For a **strict** public-client implementation, you'd need a non-assertion variant of `oauth_init`; the crate does not ship one. Reach for the TypeScript `@atproto/oauth-client-browser` for SPAs instead.

## 2. `oauth_complete` — authorization code exchange

After the AS redirects back to your callback URL with `?code=&state=&iss=`:

```rust
use atproto_oauth::workflow::{OAuthRequest, oauth_complete};
use atproto_identity::key::{identify_key, to_public};
use chrono::{Duration, Utc};

// 1. Load and VERIFY the pre-flow state.
let data = oauth_request_store.get(&query.state).await?
    .ok_or("OAuth state not found or expired")?;
if query.iss.as_deref() != Some(&data.issuer) {
    return Err("Issuer mismatch — possible CSRF or AS misconfiguration");
}

// 2. Rebuild the OAuthRequest struct the workflow expects.
let dpop_key = identify_key(&data.dpop_private_key)?;
let signing_public_key = to_public(&signing_key)?.to_string();

let oauth_request = OAuthRequest {
    oauth_state: data.state.clone(),
    issuer: data.issuer.clone(),
    authorization_server: data.authorization_server.clone(),
    nonce: data.nonce.clone(),
    pkce_verifier: data.pkce_verifier.clone(),
    signing_public_key,
    dpop_private_key: data.dpop_private_key.clone(),
    created_at: data.created_at,
    expires_at: data.created_at + Duration::minutes(10),
};

// 3. Re-fetch the AS metadata. (Optional but recommended — picks up key rotations.)
let authorization_server = oauth_authorization_server(
    &http_client, &data.authorization_server,
).await?;

// 4. Token exchange.
let token_response = oauth_complete(
    &http_client, &oauth_client, &dpop_key,
    &query.code, &oauth_request, &authorization_server,
).await?;

// 5. Delete the pre-flow state — single-use.
oauth_request_store.delete(&query.state).await?;

// 6. Verify session (see ../shared/security-requirements.md §Identity verification).
let did = token_response.sub.as_deref()
    .ok_or("No `sub` in token response")?;
if !token_response.scope.split_whitespace().any(|s| s == "atproto") {
    return Err("Token response missing `atproto` scope");
}
let doc = identity_resolver.resolve(did).await?;
// Verify doc.pds → protected_resource.authorization_servers[0] == data.authorization_server

// 7. Build and set session cookie (see sessions.md).
```

`oauth_complete` form body: `client_id=&redirect_uri=&grant_type=authorization_code&code=&code_verifier=&client_assertion_type=&client_assertion=`. Client assertion is freshly minted (new `jti`); DPoP proof is freshly minted and wrapped in the retry middleware. Returns `TokenResponse { access_token, token_type, refresh_token, scope, expires_in, sub, extra }`.

### Error distinctions

| Error                                        | Meaning                                | Recovery                         |
| -------------------------------------------- | -------------------------------------- | -------------------------------- |
| `OAuthClientError::TokenHttpRequestFailed`   | Network / AS down                      | Retry w/ backoff                 |
| `TokenResponseJsonParsingFailed`             | AS returned non-JSON or wrong shape    | Surface to logs; likely AS bug   |
| HTTP 400 `invalid_grant` in response JSON    | Code reuse, expired, wrong verifier    | Restart flow                     |
| HTTP 400 `invalid_client`                    | Client assertion wrong (kid, aud, exp) | Check key rotation state         |
| HTTP 400 `use_dpop_nonce`                    | Shouldn't reach caller — `DpopRetry` handles it. If it does, middleware isn't wired. |

The crate does not parse the error body into typed variants — you get `TokenResponseJsonParsingFailed` only if deserialization into `TokenResponse` fails. If the AS returns `{"error":"invalid_grant",...}`, `TokenResponse::sub` will be `None` and fields will be missing, producing a `JsonParsingFailed` with a less-than-great error message. Production code should pre-inspect the response before `.json::<TokenResponse>()`.

## 3. `oauth_refresh` — refresh rotation

```rust
use atproto_oauth::workflow::oauth_refresh;

// Preconditions (from session): did, refresh_token, dpop_private_key (serialized).
// Grab the DID document for PDS discovery (oauth_refresh internally calls pds_resources).
let doc = identity_resolver.resolve(&session.did).await?;
let dpop_key = identify_key(&session.dpop_private_key)?;

let token_response = oauth_refresh(
    &http_client, &oauth_client, &dpop_key,
    &session.refresh_token,
    &doc,
).await?;

// Update the session atomically (see sessions.md — this is the refresh-race surface).
let new_session = SessionCookie {
    did: session.did.clone(),
    access_token: token_response.access_token,
    refresh_token: token_response.refresh_token,   // AS may rotate it
    expires_at: Utc::now() + Duration::seconds(token_response.expires_in as i64),
    dpop_private_key: session.dpop_private_key,    // UNCHANGED — DPoP key is per-session for life
};
```

`oauth_refresh` internally calls `pds_resources(http, pds_endpoint)` to rediscover the AS — it re-verifies profile conformance on every refresh. That's a feature (picks up PDS migration, AS key rotation) and a cost (double round-trip). If it's too slow for your hot path, call `oauth_authorization_server` yourself and use the lower-level helpers directly — but you lose the invariant check.

On `invalid_grant` from the refresh endpoint, the session is dead. **Do not retry.** Delete the session, force re-login.

## Axum handler skeleton (BFF)

```rust
use axum::{Router, routing::{get, post}};

let oauth_router = Router::new()
    .route("/oauth-client-metadata.json", get(handle_oauth_metadata))
    .route("/oauth/login", post(handle_auth_init))        // form: login_hint, return_to
    .route("/oauth/callback", get(handle_auth_callback))  // query: code, state, iss
    .route("/oauth/refresh", post(handle_auth_refresh))   // cookie → maybe refresh
    .route("/oauth/logout", post(handle_auth_logout));
```

Each handler takes `State<AppState>` and uses the three workflow functions above, mutating cookies/session storage. The shape of each handler:

- **`handle_auth_init`** — resolve the submitted handle via `IdentityResolver`, discover the AS with `pds_resources`, mint PKCE + state + nonce + DPoP key, insert into `OAuthRequestStorage`, call `oauth_init`, return a 302 to the authorize URL built from `par.request_uri`.
- **`handle_auth_callback`** — read `?code=&state=&iss=`, load the pre-flow row by `state`, verify `iss` matches, call `oauth_complete`, delete the pre-flow row, resolve the `sub` DID to verify the PDS matches the AS you started with, build and set the session cookie.
- **`handle_auth_refresh`** — see `sessions.md` (this is where the refresh race matters).
- **`handle_auth_logout`** — expire cookies, delete the session row, optionally best-effort `POST /oauth/revoke`.

The Smoke Signal reference implementation at <https://tangled.org/smokesignal.events/smokesignal> has the full wiring if you want a worked example.

## Common pitfalls

- **Not deleting pre-flow state on success.** State is single-use; replay risk if kept around.
- **Verifying `iss` only when present.** If `iss` is absent entirely, reject — AT Protocol profile requires it.
- **Storing `dpop_private_key` as `KeyData`, passing `String`.** `identify_key(&String)` deserializes; `to_public(&KeyData)` produces public half. Mixing these is a common type error.
- **Re-using `oauth_client` across users.** The `OAuthClient` holds your app's signing key and is process-static. The `dpop_key` is per-session. Don't confuse them.
- **Forgetting `zeroize` feature in production.** `OAuthRequest` lives for minutes with plaintext secrets; drop them deterministically.
- **Calling `oauth_refresh` without a per-session mutex.** Concurrent refreshes = dead session (see `sessions.md`).

## See also

- `README.md` — crate surface.
- `dpop.md` — what `DpopRetry` is actually doing inside these calls.
- `sessions.md` — the refresh race and session cookie wiring.
- `../shared/flows.md` — language-neutral flow steps.
- `../shared/troubleshooting.md` — every error you'll see from these three functions.

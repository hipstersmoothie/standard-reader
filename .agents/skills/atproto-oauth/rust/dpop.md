# Rust — DPoP minting, retry, and validation

`atproto_oauth::dpop` is a complete DPoP (RFC 9449) toolkit. Two entry points mint proofs, one middleware handles the nonce dance transparently, and `validate_dpop_jwt` checks incoming proofs on the server side. For the protocol rules, see `../shared/dpop.md`.

## Minting: `auth_dpop` vs `request_dpop`

```rust
use atproto_oauth::dpop::{auth_dpop, request_dpop};

// For AS/token endpoints (PAR, token exchange, refresh) — NO `ath`.
let (token, header, claims) = auth_dpop(
    &dpop_key,
    "POST",
    "https://pds.example.com/oauth/par",
)?;

// For resource requests (PDS XRPC) — WITH `ath = SHA-256(access_token)`.
let (token, header, claims) = request_dpop(
    &dpop_key,
    "GET",
    "https://pds.example.com/xrpc/com.atproto.repo.getRecord",
    access_token,
)?;
```

The returned tuple:

- `token: String` — the serialized `dpop+jwt` JWT. Put it in the `DPoP:` header of your request.
- `header: Header` — the JWT header (`typ=dpop+jwt`, `alg=ES256|ES384|ES256K`, `jwk=<public JWK>`).
- `claims: Claims` — the claims (`jti=ulid`, `htm`, `htu`, `iat`, `exp=iat+30s`, optionally `ath`).

The header and claims are returned so the `DpopRetry` middleware can re-mint with a `nonce` added. For one-shot usage (resource requests), you can ignore them.

Under the hood (`dpop.rs:304-343`): `to_public(&key_data)` → `JwkEcKey` for the header, `Ulid::new()` for `jti`, `iat = now`, `exp = now + 30s`. `alg` is always `"ES256"` in the returned header even if the key is P-384 — this is a bug in the reference implementation; for P-384 keys use `mint()` directly with a correct header.

## DpopRetry — automatic nonce handling

For AS endpoints, you almost never call `auth_dpop` directly. The three `oauth_*` functions wrap the caller's `reqwest::Client` with `ChainMiddleware::new(DpopRetry::new(header, claims, key_data, check_response_body))` which:

1. Sends the request with the nonce-less proof.
2. Inspects the response. If status is 400 or 401 **and** either:
   - `WWW-Authenticate: DPoP ... error="use_dpop_nonce" ...` header present, OR
   - `check_response_body=true` and the JSON body has `{"error":"use_dpop_nonce"}` or `"invalid_dpop_proof"`,
3. Extracts the `DPoP-Nonce` response header.
4. Inserts `nonce: <value>` into the private claims, re-mints the JWT, replaces the `DPoP:` request header, and retries once.

```rust
use atproto_oauth::dpop::{auth_dpop, DpopRetry};
use reqwest_chain::ChainMiddleware;
use reqwest_middleware::ClientBuilder;

let (dpop_token, header, claims) = auth_dpop(&dpop_key, "POST", &url)?;
let retry = DpopRetry::new(header, claims, dpop_key.clone(), /* check_response_body */ true);

let client = ClientBuilder::new(http_client.clone())
    .with(ChainMiddleware::new(retry))
    .build();

let response = client.post(&url)
    .header("DPoP", &dpop_token)
    .form(&params)
    .send()
    .await?;
```

The retry budget is exactly 1. If the second attempt also fails with `use_dpop_nonce`, that's a bug: wrong `htu` (you pulled a nonce from the AS but sent to the PDS, or vice versa), clock skew, or a `jti` replay. Check `../shared/troubleshooting.md` §`invalid_dpop_proof`.

### Important: per-origin nonces

AS and PDS issue **separate** nonce spaces. A nonce from the AS is not accepted by the PDS and vice versa. `DpopRetry` is scoped to the current request — it doesn't cache nonces across calls. For production code that makes many PDS requests, implement your own per-origin nonce cache and seed each new `DpopRetry` with the latest value for that origin.

## Resource requests (PDS XRPC)

Outside of the three `oauth_*` functions, DPoP minting is **your** responsibility. A minimal XRPC-with-DPoP helper:

```rust
use atproto_oauth::dpop::{request_dpop, DpopRetry};
use reqwest_chain::ChainMiddleware;
use reqwest_middleware::ClientBuilder;

async fn xrpc_get(
    http: &reqwest::Client,
    dpop_key: &atproto_identity::key::KeyData,
    access_token: &str,
    url: &str,
) -> anyhow::Result<serde_json::Value> {
    let (proof, header, claims) = request_dpop(dpop_key, "GET", url, access_token)?;
    let retry = DpopRetry::new(header, claims, dpop_key.clone(), true);
    let client = ClientBuilder::new(http.clone()).with(ChainMiddleware::new(retry)).build();

    Ok(client.get(url)
        .header("Authorization", format!("DPoP {access_token}"))
        .header("DPoP", &proof)
        .send().await?
        .json().await?)
}
```

Note the `Authorization: DPoP <token>` (not `Bearer`). The DPoP token is sender-constraining; combining it with `Bearer` auth would defeat that.

## `htu` normalization

The `htu` claim is the full URL **without query string or fragment**, using a canonical host (lowercase, default port implied):

```
https://pds.example.com/xrpc/com.atproto.repo.getRecord
```

not

```
https://PDS.example.com:443/xrpc/com.atproto.repo.getRecord?repo=...&collection=...
```

`auth_dpop` / `request_dpop` take a `http_uri: &str` and use it verbatim — **they do not normalize**. If you pass the raw `reqwest::Request::url()` output, query string is included. Build the `htu` value yourself:

```rust
let mut url: url::Url = raw_url.parse()?;
url.set_query(None);
url.set_fragment(None);
let htu = url.to_string();
```

This is the #1 silent DPoP bug. The server rejects with `invalid_dpop_proof` and you stare at identical-looking URLs.

## Server-side: `validate_dpop_jwt`

If you're building an AS or PDS in Rust, `validate_dpop_jwt` is the single call to validate an incoming proof:

```rust
use atproto_oauth::dpop::{validate_dpop_jwt, DpopValidationConfig};

// For a PAR/token-endpoint call:
let config = DpopValidationConfig::for_authorization(
    "POST",
    "https://as.example.com/oauth/token",
);
// For a resource-endpoint call with a bearer token:
let config = DpopValidationConfig::for_resource_request(
    "GET",
    "https://pds.example.com/xrpc/com.atproto.repo.getRecord",
    access_token,
);

// Add accepted nonces (if you've rotated recently, keep both current + previous for a window).
let mut config = config;
config.expected_nonce_values = vec![current_nonce.clone(), previous_nonce.clone()];

let thumbprint: String = validate_dpop_jwt(&dpop_jwt, &config)?;
// `thumbprint` is the JWK thumbprint. Use it as the per-session key ID.
```

`validate_dpop_jwt` checks in order:

1. JWT structure (3 dot-separated parts).
2. Header: `typ == "dpop+jwt"`, `alg ∈ {ES256, ES384, ES256K}`, `jwk` present with kty/crv/x/y (strips any `d` defensively).
3. Payload: `jti` present (caller must separately de-dupe), `htm == expected_http_method`, `htu == expected_http_uri`, `iat` within `[now - max_age - skew, now + skew]`, `exp` not in the past if present.
4. `ath == expected_access_token_hash` if configured.
5. `nonce ∈ expected_nonce_values` if non-empty.
6. Signature verifies against the embedded JWK.
7. Returns `thumbprint(jwk)`.

Defaults (`DpopValidationConfig::default()`): `max_age_seconds = 60`, `clock_skew_tolerance_seconds = 30`, `allow_future_iat = false`.

**`jti` replay protection** is not built in. You must keep a per-thumbprint (or global) seen-`jti` set and reject duplicates, with a TTL matching `max_age_seconds + clock_skew_tolerance_seconds + proof_exp`.

## `extract_jwk_thumbprint` (client-side)

If you want to bind a stored session to a thumbprint without running full validation:

```rust
use atproto_oauth::dpop::extract_jwk_thumbprint;

let thumbprint: String = extract_jwk_thumbprint(&dpop_jwt)?;
assert_eq!(thumbprint.len(), 43);  // base64url(SHA-256) no pad
```

Works on any well-formed `dpop+jwt` by decoding the header and running RFC 7638 over its `jwk` field. Does **not** verify the signature.

## Common pitfalls

- **Forgetting `check_response_body = true`.** Some ASes return `use_dpop_nonce` in the JSON body with no `WWW-Authenticate` header. With `check_response_body=false`, the middleware returns the 400 to you unhandled. The crate's own flow functions pass `true`; match that in your resource code.
- **Not re-minting per request.** The three `oauth_*` functions already do this. For resource requests, if you reuse a `(token, header, claims)` across multiple XRPC calls, the server rejects the second one (same `jti`, stale `iat`).
- **Wrong `htu` for PAR'd authorize.** PAR uses the PAR endpoint's URL; the following authorize redirect is NOT a DPoP-bearing request. Don't mint for it.
- **Alg vs curve mismatch.** `auth_dpop` hardcodes `"ES256"` in the header regardless of key type. If your `dpop_key` is P-384, mint manually: `Header { algorithm: Some("ES384".into()), .. }`.
- **Using `htu` with port 443/80.** Most servers normalize away default ports before comparing; normalize the same way on your side before passing to `auth_dpop`.

## See also

- `README.md` — crate surface.
- `flows.md` — where `DpopRetry` plugs into each flow function.
- `../shared/dpop.md` — the RFC 9449 rules and nonce-dance diagram.
- `../shared/test-vectors.md` §V6–V8 — proof-shape test vectors.
- `../shared/security-requirements.md` §DPoP / JWT validation — the server-side checklist.

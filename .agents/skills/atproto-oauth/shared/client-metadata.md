# Client metadata document

The `client_id` **is** the URL of a JSON document describing the client. The Authorization Server fetches it at the start of every flow to dynamically register the client. This replaces the usual up-front static registration and is AT Proto's form of DCR.

There is no `client_secret`. Authentication of confidential clients uses `private_key_jwt` with a key published in `jwks`/`jwks_uri`.

## The URL

Rules:

- Scheme MUST be `https://`, with one exception: `http://localhost` for development.
- No explicit port (no `:443`).
- Path typically ends in `oauth-client-metadata.json` by convention. Any path is valid as long as it serves the JSON document with `Content-Type: application/json` and HTTP 200.
- The response body's `client_id` field MUST exactly match the URL the AS used to fetch the document.

Examples of valid production client_ids:

- `https://example.app/oauth-client-metadata.json`
- `https://example.app/client.json`
- `https://oauth.example.app/client`

## Required fields

```json
{
  "client_id": "https://example.app/oauth-client-metadata.json",
  "application_type": "web",
  "grant_types": ["authorization_code", "refresh_token"],
  "scope": "atproto transition:generic",
  "response_types": ["code"],
  "redirect_uris": ["https://example.app/oauth/callback"],
  "dpop_bound_access_tokens": true,
  "token_endpoint_auth_method": "private_key_jwt",
  "token_endpoint_auth_signing_alg": "ES256",
  "jwks": {
    "keys": [
      {"kty":"EC","crv":"P-256","x":"...","y":"...","kid":"...","use":"sig","alg":"ES256"}
    ]
  }
}
```

Field-by-field:

- **`client_id`** — must equal the metadata URL exactly. String mismatch = rejected.
- **`application_type`** — `web` (default) or `native`. Drives how `redirect_uris` are validated.
- **`grant_types`** — must include `authorization_code`. Add `refresh_token` if you will refresh (almost always).
- **`response_types`** — must include `code`.
- **`scope`** — space-separated list of EVERY scope the client MAY request. Authorization requests may request a subset; they may NOT request scopes outside this list. `atproto` is mandatory.
- **`redirect_uris`** — list of all callback URIs. The authorize request's `redirect_uri` MUST match one of these exactly, character for character.
- **`dpop_bound_access_tokens`** — MUST be `true`.
- **`token_endpoint_auth_method`** — for confidential clients, `private_key_jwt`. For public clients, `none`.
- **`token_endpoint_auth_signing_alg`** — `ES256` currently. Never `none`.
- **`jwks`** or **`jwks_uri`** — confidential clients only. Exactly one. Contains PUBLIC keys. See §Keys.

## Optional but recommended

- `client_name` — human-readable name. Shown on consent screen for **trusted** clients only.
- `client_uri` — the app's home page.
- `logo_uri`, `tos_uri`, `policy_uri` — all HTTPS only. Shown on consent screen for trusted clients.
- `contacts` — list of email addresses for security contact.

Untrusted clients will not have these fields displayed on the consent screen; ASes whitelist trusted clients explicitly.

## Public clients

Public clients omit `token_endpoint_auth_method` (or set it to `"none"`) and do NOT include `jwks`/`jwks_uri`:

```json
{
  "client_id": "https://example.app/oauth-client-metadata.json",
  "application_type": "web",
  "grant_types": ["authorization_code", "refresh_token"],
  "scope": "atproto transition:generic",
  "response_types": ["code"],
  "redirect_uris": ["https://example.app/oauth/callback"],
  "dpop_bound_access_tokens": true,
  "token_endpoint_auth_method": "none"
}
```

Public client tradeoffs:

- No client assertion JWT on PAR/token/refresh.
- Refresh tokens capped at 14 days.
- Overall session capped at 14 days.
- Cannot be extended by key rotation (no keys to rotate).

## Native clients

`application_type: "native"` changes redirect URI rules:

- Custom-scheme URIs allowed: `com.example.app:/callback`. The scheme MUST be the reverse-domain form of the `client_id` hostname, followed by `:/`. Not `://`.
- HTTPS URIs allowed as "Apple Universal Links" style.
- `http://127.0.0.1:*/` and `http://[::1]:*/` allowed in development for loopback flow.

Note: the AT Proto profile does not define a loopback redirect mechanism for non-localhost `client_id`s. Loopback is specifically tied to the `http://localhost` development `client_id` exception.

## localhost development client

For development only:

- `client_id = http://localhost` (or `http://localhost?scope=atproto+transition:generic&redirect_uri=http://127.0.0.1:8080/callback`).
- The AS generates virtual metadata: `application_type: native`, `token_endpoint_auth_method: none`, `dpop_bound_access_tokens: true`, `grant_types: [authorization_code, refresh_token]`, `response_types: [code]`.
- `scope` and `redirect_uri` can be passed as query parameters on the `client_id`.
- Default redirects are `http://127.0.0.1/` and `http://[::1]/` if not supplied.

Worked example — a CLI running on port 8080 that wants the `atproto` and `transition:generic` scopes:

```
client_id = http://localhost?scope=atproto%20transition%3Ageneric&redirect_uri=http%3A%2F%2F127.0.0.1%3A8080%2Fcallback
```

The AS returns virtual metadata built from those query parameters, so there is nothing to host and nothing to serve. The exact same `client_id` string is passed to every OAuth call in the flow (PAR, token, refresh) — changing it mid-flow invalidates the grant. For anything exposed to real users, ship a real HTTPS `client_id` with a hosted metadata document; the localhost form is iteration-only.

## Keys (`jwks` vs `jwks_uri`)

Confidential clients MUST publish the PUBLIC half of each signing key. Keys sign the `private_key_jwt` client assertion sent to the token endpoint.

Choose one:

- **Inline `jwks`** — simplest. Rotate by redeploying the metadata document.
- **`jwks_uri`** — points to a separate endpoint that returns `{"keys":[…]}`. Rotate independently of metadata.

JWK shape (P-256 example):

```json
{
  "kty": "EC",
  "crv": "P-256",
  "x": "<base64url coord>",
  "y": "<base64url coord>",
  "kid": "<key id — often the JWK thumbprint or a DID:key>",
  "use": "sig",
  "alg": "ES256"
}
```

**Never** include the `d` field (private part). If you do, you've leaked your signing key and must rotate immediately and revoke.

## Key algorithms

- `ES256` (P-256) — baseline. Every AS must accept it; every client should mint assertions with it.
- `ES384` (P-384) and `ES256K` (secp256k1) — optional; support varies. Only use if you know your AS supports it (check `token_endpoint_auth_signing_alg_values_supported` in AS metadata).
- `RS256` — not part of the AT Proto profile for client assertions. Stick to EC.

## Key rotation (confidential clients)

1. Generate a new keypair; append the public half to `jwks`/`jwks_uri` alongside the old key.
2. Start signing new assertions with the new key (pick it by `kid`).
3. Wait for all in-flight sessions using the old key to expire or migrate.
4. Remove the old key from `jwks`.

The AS binds active sessions to the `kid` used at session start. Removing a `kid` prematurely will cause `invalid_client` on refresh for sessions bound to that key. Plan for a rotation period ≥ your longest refresh lifetime.

## Caching

The AS may cache the metadata document. Clients should emit HTTP caching headers (`Cache-Control`, `ETag`) but cannot rely on the AS honouring them. Consequences:

- A rotated JWK may not propagate for the AS's cache TTL. Keep the OLD key in place after publishing the new one.
- A removed JWK is a **revocation signal** only after the cache TTL elapses. Leaked keys need rotation + explicit session revocation.

No AS-side minimum or maximum TTL is currently specified by the profile.

## Validation

Before serving the document from your own service, run `scripts/validate_client_metadata.py` (stdlib-only). It checks:

- HTTPS enforcement (or `http://localhost`).
- `dpop_bound_access_tokens: true`.
- Required grant types and response types.
- Auth method matches client type.
- JWKs are `kty=EC`, `crv=P-256` (or declared curve), and do NOT contain `d`.
- `scope` contains `atproto`.
- `redirect_uris` match `application_type` rules.

Also verify live: fetch your own `client_id` over HTTPS and check that `client_id` in the body equals the URL you fetched from.

## Worked examples

Confidential, web, backend-for-frontend on `https://myapp.example.com`:

```json
{
  "client_id": "https://myapp.example.com/oauth-client-metadata.json",
  "client_name": "MyApp",
  "client_uri": "https://myapp.example.com",
  "logo_uri": "https://myapp.example.com/logo.png",
  "tos_uri": "https://myapp.example.com/tos",
  "policy_uri": "https://myapp.example.com/privacy",
  "application_type": "web",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "redirect_uris": ["https://myapp.example.com/oauth/callback"],
  "scope": "atproto transition:generic",
  "dpop_bound_access_tokens": true,
  "token_endpoint_auth_method": "private_key_jwt",
  "token_endpoint_auth_signing_alg": "ES256",
  "jwks_uri": "https://myapp.example.com/.well-known/jwks.json"
}
```

Public SPA served from `https://app.example.com`:

```json
{
  "client_id": "https://app.example.com/oauth-client-metadata.json",
  "client_name": "Example SPA",
  "client_uri": "https://app.example.com",
  "application_type": "web",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "redirect_uris": ["https://app.example.com/oauth/callback"],
  "scope": "atproto transition:generic",
  "dpop_bound_access_tokens": true,
  "token_endpoint_auth_method": "none"
}
```

Native mobile, hostname `app.example.com` (reverse = `com.example.app`):

```json
{
  "client_id": "https://app.example.com/oauth-client-metadata.json",
  "client_name": "Example Mobile",
  "application_type": "native",
  "grant_types": ["authorization_code", "refresh_token"],
  "response_types": ["code"],
  "redirect_uris": ["com.example.app:/callback"],
  "scope": "atproto transition:generic",
  "dpop_bound_access_tokens": true,
  "token_endpoint_auth_method": "none"
}
```

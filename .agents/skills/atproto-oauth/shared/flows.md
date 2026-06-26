# Flows — byte-level

Every AT Proto OAuth flow is a sequence of HTTP requests with very specific headers, parameters, and retry rules. This file describes the wire content of each step. Language files translate these into library calls.

All bodies are `application/x-www-form-urlencoded` unless noted. All responses are `application/json`.

## Flow A — discovery

**A1. Resolve identity** (if starting from handle or DID — skip if starting from PDS/AS URL).

Given `handle`: resolve to DID via DNS `_atproto.{handle}` TXT or `https://{handle}/.well-known/atproto-did`. Bidirectionally verify the DID document's `alsoKnownAs` includes `at://{handle}`.

Given `did`: resolve via `did:plc` directory (`https://plc.directory/{did}`) or `did:web` (`https://{domain}/.well-known/did.json`).

Extract `service[id="#atproto_pds"].serviceEndpoint` from the DID document as the PDS URL.

**A2. Fetch protected resource metadata.**

```
GET {PDS}/.well-known/oauth-protected-resource
Accept: application/json
```

Response (subset):
```json
{
  "resource": "https://pds.example.com",
  "authorization_servers": ["https://pds.example.com"]
}
```

Assertions:
- `resource` equals the PDS URL.
- `authorization_servers` has exactly one entry.

**A3. Fetch authorization server metadata.**

```
GET {AS}/.well-known/oauth-authorization-server
Accept: application/json
```

Response (subset, abridged):
```json
{
  "issuer": "https://pds.example.com",
  "authorization_endpoint": "https://pds.example.com/oauth/authorize",
  "token_endpoint": "https://pds.example.com/oauth/token",
  "pushed_authorization_request_endpoint": "https://pds.example.com/oauth/par",
  "require_pushed_authorization_requests": true,
  "authorization_response_iss_parameter_supported": true,
  "client_id_metadata_document_supported": true,
  "dpop_signing_alg_values_supported": ["ES256"],
  "code_challenge_methods_supported": ["S256"],
  "grant_types_supported": ["authorization_code","refresh_token"],
  "token_endpoint_auth_methods_supported": ["none","private_key_jwt"],
  "token_endpoint_auth_signing_alg_values_supported": ["ES256"],
  "scopes_supported": ["atproto","transition:generic"]
}
```

Assertions the client MUST enforce before proceeding:
- `issuer` matches the origin of the fetch URL.
- All the booleans above are `true`.
- Every `*_supported` list contains the corresponding required value.

## Flow B — PAR (Pushed Authorization Request)

**B1. Generate per-session state** (server-side; never in a client-visible cookie):

- `state` — ≥16 chars, URL-safe random. Single use.
- `nonce` — ≥16 chars, URL-safe random. Stored for client-side verification only; not sent to the AS.
- PKCE pair: `verifier` = 43–128 chars from `[A-Z a-z 0-9 - . _ ~]`; `challenge = base64url(SHA-256(verifier))` with no padding.
- DPoP keypair: P-256 EC, private only on server.
- For confidential clients: remember which `kid` you'll sign the client assertion with.

**B2. Mint client assertion** (confidential clients only). JWT with:

- Header: `{"alg":"ES256","typ":"JWT","kid":"<your-kid>"}`
- Claims: `{"iss":"<client_id>","sub":"<client_id>","aud":"<AS issuer>","iat":<now>,"exp":<now+60>,"jti":"<random>"}`
- Signed with the private key whose public half is in your `jwks` under that `kid`.

**B3. Mint DPoP proof** for the PAR request. JWT with:

- Header: `{"alg":"ES256","typ":"dpop+jwt","jwk":<public DPoP key JSON>}`
- Claims: `{"jti":"<random>","htm":"POST","htu":"<PAR endpoint>","iat":<now>}` — NO `nonce` on the first try.
- Do NOT include a query string in `htu`.

**B4. POST PAR**:

```
POST {pushed_authorization_request_endpoint}
Content-Type: application/x-www-form-urlencoded
DPoP: <DPoP proof JWT>

response_type=code
&client_id={client_id}
&redirect_uri={redirect_uri}
&scope={scope}           # space-separated, URL-encoded
&state={state}
&code_challenge={challenge}
&code_challenge_method=S256
&login_hint={handle or did}    # optional but recommended
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer    # confidential only
&client_assertion={client assertion JWT}                                                    # confidential only
```

**B5. Handle first-try `use_dpop_nonce`:**

First response will almost always be:

```
HTTP/1.1 400 Bad Request
DPoP-Nonce: <server-issued nonce string>
Content-Type: application/json

{"error":"use_dpop_nonce","error_description":"Authorization server requires nonce in DPoP proof"}
```

Extract `DPoP-Nonce`. Mint a NEW DPoP proof with the same `jti`-new, `iat`-now, plus `nonce: "<server nonce>"` claim. Retry the POST. Allow one retry per request.

**B6. Success response:**

```
HTTP/1.1 201 Created
DPoP-Nonce: <possibly rotated nonce>
Content-Type: application/json

{"request_uri":"urn:ietf:params:oauth:request_uri:...", "expires_in": 299}
```

Persist the server nonce for this AS origin for the next request. Persist the whole `OAuthRequest` state (state, nonce, verifier, DPoP private key, issuer, AS metadata URL, created_at, expires_at ~10min) keyed by `state`.

## Flow C — user approval

**C1. Build authorize URL**. The URL contains ONLY `client_id` and `request_uri`. No other parameters.

```
GET {authorization_endpoint}?client_id={client_id}&request_uri={request_uri}
```

**C2. Redirect the user.** Server sends a 302 (or `window.location = …` in a SPA). The user is now on the AS.

The user authenticates with their PDS and approves (or denies) the scope request.

**C3. Receive callback.** The AS redirects the user's browser back to `redirect_uri`:

```
GET {redirect_uri}?code=...&state=...&iss=...
```

Checks the handler MUST perform in order:

1. Load the stored `OAuthRequest` by `state`. If missing, reject (replay or forged).
2. Delete the `OAuthRequest` row — single-use to prevent replay.
3. Verify `iss == stored.issuer`. If mismatch, reject.
4. Proceed to token exchange.

If the AS sends an error instead: `redirect_uri?error=access_denied&error_description=...&state=...`. Surface to user; don't exchange.

## Flow D — token exchange

**D1. Mint DPoP proof for token endpoint:**

- Header: `{"alg":"ES256","typ":"dpop+jwt","jwk":<public DPoP key>}`
- Claims: `{"jti":"<random>","htm":"POST","htu":"<token_endpoint>","iat":<now>,"nonce":"<stored AS nonce>"}`

**D2. Mint fresh client assertion** (confidential clients). Same shape as B2 but new `iat`, `jti`, `exp`.

**D3. POST token:**

```
POST {token_endpoint}
Content-Type: application/x-www-form-urlencoded
DPoP: <DPoP proof JWT>

grant_type=authorization_code
&code={code}
&redirect_uri={redirect_uri}        # MUST be identical to PAR
&client_id={client_id}
&code_verifier={verifier}           # PKCE
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer    # confidential
&client_assertion={client assertion JWT}                                                    # confidential
```

Handle `use_dpop_nonce` retries as in B5. Update stored AS nonce from `DPoP-Nonce` response header on both success and retry.

**D4. Token response:**

```
HTTP/1.1 200 OK
DPoP-Nonce: <rotated>
Content-Type: application/json

{
  "access_token": "...",
  "token_type": "DPoP",
  "expires_in": 3600,
  "refresh_token": "...",
  "scope": "atproto transition:generic",
  "sub": "did:plc:..."
}
```

Assertions:

- `scope` contains `atproto`. If not, reject the session.
- `sub` is a valid DID.

**D5. Identity verification** (mandatory):

- Resolve `sub` DID → DID document.
- Extract PDS from DID document service record.
- Fetch `{PDS}/.well-known/oauth-protected-resource`; verify its `authorization_servers[0]` equals the AS `issuer` you just completed a flow with.
- If user supplied a handle as `login_hint`, verify the DID document's `alsoKnownAs` includes `at://{handle}`.

If any check fails, discard the tokens and fail the flow.

## Flow E — resource requests (to the PDS)

Every call to the PDS needs its OWN DPoP proof with `ath`:

- Header: `{"alg":"ES256","typ":"dpop+jwt","jwk":<public DPoP key>}`
- Claims: `{"jti":"<random>","htm":"<METHOD>","htu":"<full URL without query>","iat":<now>,"nonce":"<PDS nonce if you have one>","ath":"<base64url(SHA-256(access_token))>"}`

Request:

```
GET {PDS}/xrpc/com.atproto.repo.getRecord?...
Authorization: DPoP <access_token>
DPoP: <resource DPoP proof JWT>
```

The PDS maintains its own DPoP nonce, separate from the AS. First request to a new PDS origin will get `use_dpop_nonce` (HTTP 401 this time, often), with a `DPoP-Nonce` header. Retry with `nonce` claim. Thereafter, use the latest nonce you've seen from that origin.

Nonces can and do rotate. Always copy the latest `DPoP-Nonce` from every response before the next request. Maintain at minimum: `AS origin → nonce` and `PDS origin → nonce` in session state.

## Flow F — refresh

**F1. When to refresh.** Access-token expiry is ~minutes. Refresh when within 5 minutes of expiry. Never refresh sooner — you burn refresh tokens needlessly.

**F2. Lock.** Only one refresh per session at a time. If two concurrent refresh calls both succeed, only one of the new refresh tokens is the "current" one; the other is dead on arrival. Use a per-session mutex (server-side) or a single-flight pattern.

**F3. Mint DPoP for token endpoint** (as D1, with AS nonce).

**F4. POST refresh:**

```
POST {token_endpoint}
Content-Type: application/x-www-form-urlencoded
DPoP: <DPoP proof>

grant_type=refresh_token
&refresh_token={refresh_token}
&client_id={client_id}
&client_assertion_type=urn%3Aietf%3Aparams%3Aoauth%3Aclient-assertion-type%3Ajwt-bearer    # confidential
&client_assertion={client assertion JWT}                                                    # confidential
```

Note: confidential clients MUST use the same `kid`/algorithm as the session was opened with. A rotated-out key will get `invalid_client` on refresh.

**F5. Response** has a new `access_token` and a new `refresh_token`. Replace both atomically in your session store. Also update the AS DPoP nonce from `DPoP-Nonce` response header.

**F6. On failure.** `invalid_grant` = session is dead; user must re-auth. `use_dpop_nonce` = retry once. Everything else = log and surface to user; session likely dead.

## Flow G — logout / revocation

Two levels:

**G1. Local logout** — delete the server-side session and expire the cookie. The tokens still exist on the AS until they expire or are revoked explicitly.

**G2. Server-side revocation** (optional but polite). Some ASes support RFC 7009 `/oauth/revoke`:

```
POST {revocation_endpoint}
Content-Type: application/x-www-form-urlencoded
DPoP: <DPoP proof>

token={refresh_token}
&token_type_hint=refresh_token
&client_id={client_id}
&client_assertion_type=...&client_assertion=...      # confidential
```

The AT Proto profile does not require ASes to implement `/oauth/revoke`; treat 404/405 as benign. If available, prefer revoking the refresh token — access tokens are short-lived.

Always do G1 regardless of whether G2 succeeds. If G2 fails, delete the local session anyway.

## Timing and retry budget

| Action | Retries | Timeout per attempt |
|---|---|---|
| Discovery (metadata fetches) | 0 — fail loud | 10s |
| PAR / token `use_dpop_nonce` | 1 | 10s |
| Token exchange `invalid_grant` | 0 — session dead | — |
| Refresh | 1 on `use_dpop_nonce`; 0 on everything else | 10s |
| Resource request `use_dpop_nonce` | 1 | request-dependent |

Every retry regenerates the DPoP proof with fresh `jti` and updated `nonce`. Never reuse a DPoP proof.

## State to persist per session

Minimum durable state, keyed by some session ID:

- `did` — account subject (from token `sub`).
- `access_token`, `refresh_token`, `access_token_expires_at`.
- `dpop_private_key` — the single keypair used for the whole session.
- `issuer` — AS issuer URL. Needed for refresh.
- `as_dpop_nonce`, `pds_dpop_nonce` — most recent nonces for each origin.
- `scope` — granted scopes, for feature-gating.

Do NOT put any of this in a client-readable cookie. In the BFF pattern, the session cookie carries only an opaque ID; the above lives in the server's DB encrypted at rest.

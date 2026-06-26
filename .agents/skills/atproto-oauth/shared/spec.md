# AT Protocol OAuth — specification

AT Protocol OAuth is an OAuth 2.1 profile with mandatory **PKCE (S256)**, **PAR**, **DPoP**, and URL-based dynamic client registration via a published **client metadata document**. `client_secret` is never used; confidential clients authenticate to the token endpoint with a `private_key_jwt` assertion.

This file is the language-neutral contract. Per-language files link here for every "why must I…" question.

## Authoritative sources

- Specs: <https://atproto.com/specs/oauth>, <https://atproto.com/specs/permission>
- Guides: <https://atproto.com/guides/auth>, <https://atproto.com/guides/about-oauth>, <https://atproto.com/guides/oauth-patterns>, <https://atproto.com/guides/permission-requests>, <https://atproto.com/guides/permission-sets>, <https://atproto.com/guides/sdk-auth>
- Underlying standards: OAuth 2.1 (draft-ietf-oauth-v2-1), **RFC 9449** (DPoP), **RFC 7636** (PKCE), **RFC 9126** (PAR), **RFC 7523** (JWT client auth), **RFC 8414** (server metadata), **RFC 9207** (`iss` parameter), **draft-ietf-oauth-resource-metadata**, **draft-parecki-oauth-client-id-metadata-document**.

## Entities

| Entity | Role | AT Proto specifics |
| ------ | ---- | ------------------ |
| **Client** | The app requesting access. Identified by a URL. | `client_id` is the URL of a JSON metadata document. |
| **User / Account** | The human. Identified by a DID. | Returned as the `sub` field in token responses. |
| **Resource Server (RS)** | The PDS that holds the user's repo. | Publishes `/.well-known/oauth-protected-resource`. |
| **Authorization Server (AS)** | Issues tokens. Usually the same host as the PDS; may be a distinct entryway. | Publishes `/.well-known/oauth-authorization-server`. |

The `sub` field is a **DID**, not a username. The session belongs to the DID for life — handles may change, DIDs do not.

## Client types

| | **Confidential** | **Public** |
|---|---|---|
| Has server-side component | yes | no |
| Can protect a signing key | yes (server keystore) | no |
| `token_endpoint_auth_method` | `private_key_jwt` | `none` |
| Publishes `jwks` or `jwks_uri` | yes (public half only) | no |
| Access-token lifetime | short (minutes), servers' choice | short (minutes) |
| Refresh-token lifetime | up to **180 days** | **14 days** |
| Session lifetime | unlimited (rotates keys periodically) | up to **14 days** |
| Client assertion JWT | yes, on every token request | no |

Confidential clients are recommended whenever you run a backend. A pure browser SPA or a native mobile app without a server is a public client.

## Application types (`application_type`)

| `web` (default) | Browser-opening redirect URIs (`https://…` only, except localhost dev). |
| `native` | Custom-scheme redirect URIs (`com.example.app:/callback`) or Apple Universal Links. `client_id` hostname reversed to form the scheme. |

## Mandatory features

All AT Proto OAuth sessions **must** use all of the following. There is no opt-out.

1. **PKCE S256.** `code_challenge_method=S256`. Verifier ≥ 43 chars, random. No `plain`.
2. **PAR** — Pushed Authorization Request. The authorize URL carries only `request_uri` + `client_id`; every other parameter is submitted server-to-server to `pushed_authorization_request_endpoint` first.
3. **DPoP.** Every request to AS and RS carries a signed DPoP proof JWT. AS- and RS-issued **server nonces** are mandatory and rotate within 5 minutes. See `dpop.md`.
4. **`iss` response parameter.** The callback URL MUST include `iss=<AS issuer>`. Clients MUST verify it matches the AS they sent the request to.
5. **DID identity verification.** After token exchange, clients MUST verify that `sub` (a DID) resolves to a DID document whose PDS points back to the AS they just completed the flow with. For handle-initiated flows, clients MUST also bidirectionally verify that the handle resolves to that DID (per atproto handle spec).
6. **Scope response.** The token response MUST include a `scope` field; clients MUST reject the token if `atproto` is not present.

## `client_id`

The `client_id` **is** the URL of the metadata document. The AS fetches it over HTTPS on every new auth session (with optional caching — see §caching in `client-metadata.md`).

- Scheme: `https://`, no port, path ends with a JSON file. Convention is `/oauth-client-metadata.json`.
- Exception: `http://localhost` (no port, no path except `/`) is allowed for development only. The AS generates virtual metadata; `redirect_uri` and `scope` may be passed as query parameters on `client_id`.

## Discovery chain

Given user input, a client resolves outward:

```
user input  →  DID / handle  →  DID document  →  PDS URL  →
  GET {PDS}/.well-known/oauth-protected-resource
    → authorization_servers[0]  (there MUST be exactly one)
  GET {AS}/.well-known/oauth-authorization-server
    → issuer, authorization_endpoint, token_endpoint,
      pushed_authorization_request_endpoint,
      require_pushed_authorization_requests = true,
      authorization_response_iss_parameter_supported = true,
      client_id_metadata_document_supported = true,
      dpop_signing_alg_values_supported ⊇ [ES256],
      code_challenge_methods_supported ⊇ [S256],
      grant_types_supported ⊇ [authorization_code, refresh_token],
      token_endpoint_auth_methods_supported ⊇ [none, private_key_jwt],
      scopes_supported ⊇ [atproto]
```

The AS `issuer` MUST match the origin of the server metadata fetch. The client MUST fail the flow if any of those flags are missing.

Handle-first input requires an extra step: resolve handle → DID → DID document via DNS `_atproto.{handle}` TXT or `/.well-known/atproto-did`, then verify the DID document's `alsoKnownAs` includes `at://{handle}`. Never trust a handle you didn't bidirectionally verify. See the `atproto-identity-resolution` skill.

## The ten-step flow

Every language implements these ten steps in order. See `flows.md` for byte-level wire content.

1. **Resolve** user input → DID + PDS + AS metadata (as above).
2. **Generate per-session state:** random `state` (≥16 chars), random `nonce` (≥16 chars), PKCE `(verifier, challenge)` with S256, a fresh **DPoP keypair** (ES256 P-256), and store all of it.
3. **Mint client assertion** (confidential clients): JWT with `iss=sub=client_id`, `aud=<AS issuer>`, `iat`, `exp` (short, ~1min), `jti` (random), signed with a key from the `jwks`.
4. **POST PAR** to `pushed_authorization_request_endpoint` with `response_type=code`, `client_id`, `redirect_uri`, `scope`, `state`, `code_challenge`, `code_challenge_method=S256`, `login_hint` (optional), `client_assertion_type`+`client_assertion` (confidential). Add a DPoP header. The first response will be HTTP 400 with `use_dpop_nonce` and a `DPoP-Nonce` header; re-sign with `nonce` claim and retry. Accept `request_uri` + `expires_in`.
5. **Redirect user** to `{authorization_endpoint}?client_id={client_id}&request_uri={request_uri}`. No other parameters.
6. **User authenticates + approves** on the AS.
7. **AS redirects to `redirect_uri`** with `code`, `state`, `iss`. Client verifies `state` and `iss`.
8. **POST token exchange** to `token_endpoint` with `grant_type=authorization_code`, `code`, `redirect_uri`, `client_id`, `code_verifier`, `client_assertion_type`+`client_assertion` (confidential). DPoP header (with nonce). Retry on `use_dpop_nonce`.
9. **Token response.** `access_token`, `token_type=DPoP`, `expires_in`, `refresh_token`, `scope`, `sub` (DID). Verify `scope` contains `atproto`. Verify `sub` DID's document → PDS → AS chain matches the AS you used.
10. **Resource requests.** Include `Authorization: DPoP <access_token>` plus a DPoP proof that adds `ath = base64url(SHA-256(access_token))` to its claims. Maintain a separate DPoP nonce per origin (AS vs RS).

## Refresh

Refresh tokens are single-use. Send `grant_type=refresh_token`, `refresh_token`, `client_id`, client assertion (confidential), DPoP header. The response is a new access token **and a new refresh token** — replace both atomically. Don't refresh unless the access token is within ~5 minutes of expiry, and serialize concurrent refreshes per-session (one in flight at a time) to avoid the race where two callers get two different new refresh tokens and one of them is immediately stale.

## Token properties

- **`access_token`** is opaque to the client. Treat as a string. Lifetime ≤ 30 minutes; servers that cannot revoke individual tokens may cap at 15 minutes.
- **DPoP binding.** Every token is bound to one DPoP keypair. Losing the DPoP private key invalidates the session; you cannot migrate tokens between devices.
- **Refresh lifetime.** Public: 14 days. Confidential: 180 days per token, unlimited session lifetime (rotate keys).
- **`sub`.** Always a DID. Never trust a handle — handles can change.

## Error model

The AS uses standard OAuth error codes in JSON bodies: `invalid_request`, `invalid_client`, `invalid_grant`, `invalid_dpop_proof`, `use_dpop_nonce`, `unsupported_grant_type`, `invalid_scope`, `access_denied`. See `troubleshooting.md` for the full catalog and recovery paths.

Two error patterns have non-obvious recovery:

- **`use_dpop_nonce` (400/401)** with `DPoP-Nonce` response header: expected on first request to each server. Extract the nonce, add `nonce` claim to a new DPoP proof, retry once. Max one retry per request.
- **`invalid_dpop_proof`**: the proof was rejected. Usually means wrong `htm`/`htu`, skewed clock, stale nonce, or missing `ath` on a resource request. Mint a fresh proof; do not reuse across requests.

## Scopes summary

`atproto` is always required. Everything else is additive. Full rules in `scopes.md`.

| Scope pattern | Grants |
|---|---|
| `atproto` | declare atproto profile; mandatory |
| `transition:generic` | App-password-equivalent read/write (legacy) |
| `transition:chat.bsky` | chat.bsky Lexicons + service auth |
| `transition:email` | Email via `getSession` |
| `account:email?action=read\|manage` | Account email attribute |
| `account:repo?action=manage` | Repo-level hosting admin |
| `identity:handle`, `identity:*` | Handle management |
| `blob:*/*`, `blob:image/*`, `blob:video/*` | Blob upload mime filters |
| `repo:*` or `repo:<nsid>?action=create\|update\|delete` | Record writes, per collection |
| `rpc:<lxm>?aud=<did>\|*&lxm=<method>` | XRPC call access |
| `include:<nsid>?aud=<did>` | Reference a published permission-set lexicon |

## Security invariants

Full checklist in `security-requirements.md`. The non-negotiables:

- Fetches to AS metadata, RS metadata, and PLC directory MUST use an **SSRF-hardened** HTTP client: block private ranges (`10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`, `127.0.0.0/8`, `169.254.0.0/16`, `fc00::/7`, `fe80::/10`), cap body size, cap time, limit redirects.
- DPoP private keys and `access_token`/`refresh_token` are **secrets**. Never expose to browser JS in the BFF pattern; store in server-side DB bound to an HttpOnly session cookie.
- `state` MUST be random and single-use. The AS must reject duplicate `state` values.
- The handler for the callback MUST reject replays: delete the OAuth-request row as soon as token exchange starts.
- Refresh-token rotation is atomic: lose a refresh response and the session is dead. Persist before ack.

## What this skill does NOT cover

- CID parsing (see `atproto-cid`).
- Handle ↔ DID resolution details (see `atproto-identity-resolution`).
- CAR / MST / record writing (see `atproto-repository`).
- Lexicon authoring, XRPC method invocation, and record parsing (see `atproto-lexicon`).

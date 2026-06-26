# Test vectors

Fixtures used to validate cross-language OAuth implementations. Prefer tiny, self-contained inputs with byte-exact expected outputs.

## Source of truth

- **PKCE vector**: from RFC 7636 §4.2.
- **DPoP examples**: constructed against RFC 9449 §4.2 conventions.
- **JWK thumbprint**: RFC 7638 §3.1.
- **Client-metadata document** fixtures: hand-authored, round-tripped through `scripts/validate_client_metadata.py`.

When you add a vector, name the source (spec paragraph, existing fixture file, upstream test suite). No hand-waving.

## V1 — PKCE S256 (RFC 7636)

**Input (verifier):**

```
dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk
```

**Expected challenge:**

```
E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM
```

**Steps:**

1. `sha256(utf8(verifier))` → 32 bytes.
2. `base64url(32 bytes)` with no padding (strip trailing `=`).

Verified by: Rust `atproto-oauth::pkce::challenge`, Go indigo `pkce` helper, TS `@atproto/oauth-client`'s runtime.

## V2 — JWK thumbprint (RFC 7638)

**Input JWK (P-256, from RFC 7638 §3.1):**

```json
{
  "kty": "EC",
  "crv": "P-256",
  "x": "fD3LGX-TLg_UhL1trfxIiLfADwPHI6Oi0XiNqFkB2Ss",
  "y": "jdeIe-uLj5j1PJ6_rShxoRmcXRqWfUjqUVXJmpEaNI4"
}
```

**Canonical JSON** (bytewise sort of keys `crv`, `kty`, `x`, `y`, no whitespace):

```
{"crv":"P-256","kty":"EC","x":"fD3LGX-TLg_UhL1trfxIiLfADwPHI6Oi0XiNqFkB2Ss","y":"jdeIe-uLj5j1PJ6_rShxoRmcXRqWfUjqUVXJmpEaNI4"}
```

**SHA-256 → base64url (no pad, 43 chars):**

```
(compute at verification time; expected length 43)
```

Rust's `atproto-oauth::jwk::thumbprint` implements this; Go and TS canonicalize the same way.

Assertion: length is exactly 43 characters and contains only `[A-Za-z0-9_-]`.

## V3 — Minimal confidential client metadata

**Input:** `https://example.app/oauth-client-metadata.json` serving:

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
      {
        "kty": "EC",
        "crv": "P-256",
        "x": "MKBCTNIcKUSDii11ySs3526iDZ8AiTo7Tu6KPAqv7D4",
        "y": "4Etl6SRW2YiLUrN5vfvVHuhp7x8PxltmWWlbbM4IFyM",
        "kid": "key-1",
        "use": "sig",
        "alg": "ES256"
      }
    ]
  }
}
```

**Expected validation result:** PASS. Run through `scripts/validate_client_metadata.py` (exit 0) and through each language's metadata loader.

## V4 — Public client metadata

```json
{
  "client_id": "https://spa.example.app/oauth-client-metadata.json",
  "application_type": "web",
  "grant_types": ["authorization_code", "refresh_token"],
  "scope": "atproto transition:generic",
  "response_types": ["code"],
  "redirect_uris": ["https://spa.example.app/oauth/callback"],
  "dpop_bound_access_tokens": true,
  "token_endpoint_auth_method": "none"
}
```

Expected: PASS, no `jwks` required.

## V5 — Invalid metadata (each case one property away from valid)

Each should FAIL validation with a clear error message:

```json
// V5a: dpop_bound_access_tokens must be true
{ "...": "..., \"dpop_bound_access_tokens\": false, ..." }

// V5b: missing atproto scope
{ "...": "..., \"scope\": \"transition:generic\", ..." }

// V5c: http redirect_uri on web client (non-localhost)
{ "...": "..., \"redirect_uris\": [\"http://example.app/callback\"], ..." }

// V5d: JWK contains private component
{ "...": "..., \"jwks\": {\"keys\":[{\"kty\":\"EC\",\"crv\":\"P-256\",\"x\":\"...\",\"y\":\"...\",\"d\":\"LEAKED!\"}]}, ..." }

// V5e: confidential client missing jwks
{ "...": "..., \"token_endpoint_auth_method\": \"private_key_jwt\"  /* no jwks */, ..." }

// V5f: client_id doesn't match URL
{ "...": "..., \"client_id\": \"https://different.example/metadata.json\", ..." }
```

## V6 — DPoP proof for PAR (no nonce)

**Key:** P-256 private key (fixed in test harness; regenerate locally for sanity).

**Claims:**

```json
{
  "jti": "01JABCDEF...",
  "htm": "POST",
  "htu": "https://pds.example.com/oauth/par",
  "iat": 1714657800
}
```

**Header:**

```json
{
  "typ": "dpop+jwt",
  "alg": "ES256",
  "jwk": { "kty":"EC","crv":"P-256","x":"...","y":"..." }
}
```

**Expected:** server responds HTTP 400 with `DPoP-Nonce: <value>` and `{"error":"use_dpop_nonce", ...}`.

## V7 — DPoP proof for PAR (with nonce)

Same as V6 plus a `nonce` claim:

```json
{
  "jti": "01JABCDEG...",
  "htm": "POST",
  "htu": "https://pds.example.com/oauth/par",
  "iat": 1714657801,
  "nonce": "<server-issued nonce from V6 response>"
}
```

**Expected:** HTTP 201, `DPoP-Nonce: <possibly rotated>`, body `{"request_uri":"urn:...","expires_in":...}`.

## V8 — DPoP proof for resource request (with `ath`)

Access token: `"abcdef.ghijkl"` (obviously fake; just for hash).

**Expected `ath`:**

```
ath = base64url_no_pad(sha256_bytes(utf8("abcdef.ghijkl")))
```

Compute locally and check that implementations emit the same value. Fixture harnesses typically set up known tokens and assert exact `ath` bytes.

**Claims:**

```json
{
  "jti": "01JABCDEH...",
  "htm": "GET",
  "htu": "https://pds.example.com/xrpc/com.atproto.repo.getRecord",
  "iat": 1714657900,
  "nonce": "<PDS-issued nonce>",
  "ath": "<above>"
}
```

## V9 — Scope round-trip

**Input string:**

```
atproto transition:generic repo:app.bsky.feed.post?action=create&action=update rpc:app.bsky.feed.searchPosts?aud=did:web:api.bsky.app%23bsky_appview include:com.example.extra?aud=did:web:api.example.com%23svc_main
```

**Expected parse (sorted):** a list of `Scope` enum values — exact types per language.

**Expected serialize:** bytewise-sorted string, same set of scope strings joined by single space. Round-trip is identity after canonicalization.

**Expected reduced (if subsumption applied):** same, since no redundant scopes are present.

## V10 — AS metadata minimum-conformant document

```json
{
  "issuer": "https://pds.example.com",
  "authorization_endpoint": "https://pds.example.com/oauth/authorize",
  "token_endpoint": "https://pds.example.com/oauth/token",
  "pushed_authorization_request_endpoint": "https://pds.example.com/oauth/par",
  "response_types_supported": ["code"],
  "grant_types_supported": ["authorization_code", "refresh_token"],
  "code_challenge_methods_supported": ["S256"],
  "token_endpoint_auth_methods_supported": ["none", "private_key_jwt"],
  "token_endpoint_auth_signing_alg_values_supported": ["ES256"],
  "scopes_supported": ["atproto", "transition:generic"],
  "dpop_signing_alg_values_supported": ["ES256"],
  "authorization_response_iss_parameter_supported": true,
  "require_pushed_authorization_requests": true,
  "client_id_metadata_document_supported": true
}
```

Expected: ALL AT Proto assertions pass.

Removing any one of those booleans-set-true or list-membership checks flips validation to FAIL.

## How to use

1. Start with V1 (PKCE) and V2 (JWK thumbprint) — they're pure-function tests with no I/O.
2. Add V3–V5 to your metadata loader test suite.
3. Add V9 (scope round-trip) to your scope parser, if you have one.
4. V6–V8 (DPoP) need a harness with a test key; use them against a mock AS/PDS or, in integration, against a real staging PDS.
5. V10 (AS metadata) is the discovery-side regression test — ensure your conformance checker rejects each mutation in turn.

When porting to a new language, round-trip V1 and V2 first. If those pass, the cryptographic primitives are hooked up correctly. The higher-level vectors follow.

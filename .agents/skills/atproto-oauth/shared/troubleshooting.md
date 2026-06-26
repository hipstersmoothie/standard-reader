# Troubleshooting

Error catalogue for AT Proto OAuth clients. Each entry: symptom, likely cause, recovery.

## `use_dpop_nonce`

**Symptom:** HTTP 400 (or 401 from PDS) with body `{"error":"use_dpop_nonce",...}` and response header `DPoP-Nonce: <value>`.

**Cause:** Server requires a nonce in DPoP proofs. Expected on first request to each origin.

**Recovery:**

1. Extract `DPoP-Nonce` response header.
2. Mint a NEW DPoP proof with fresh `jti`, fresh `iat`, and the `nonce` claim set to the value.
3. Retry the request once.
4. Update your per-origin nonce cache with the value.

Budget: 1 retry per request. Two in a row = bug (clock skew, wrong `htu`, nonce copied from wrong origin).

## `invalid_dpop_proof`

**Symptom:** HTTP 400/401 with `{"error":"invalid_dpop_proof", ...}`.

**Possible causes:**

| Cause | Fix |
|---|---|
| Missing `ath` on resource request | Add `ath = base64url(SHA-256(access_token))` |
| Wrong `htm` (e.g. request is POST, proof says GET) | Set `htm` to the actual method, uppercase |
| Wrong `htu` (query string included, or wrong host/path) | Use full URL without query or fragment |
| Stale `nonce` | Retry once with fresh nonce from `DPoP-Nonce` header |
| Clock skew | Sync NTP. Check server's accepted window |
| Wrong `typ` (`"JWT"` instead of `"dpop+jwt"`) | Fix the header |
| Proof reused across requests | Mint a new proof every request |
| Signature doesn't verify | Public JWK in header doesn't match signing key |
| Algorithm mismatch | `alg` in header doesn't match `jwk` curve |

Always re-mint a fresh proof; never retry with the same proof.

## `invalid_client`

**Symptom:** HTTP 400/401 from token endpoint with `{"error":"invalid_client",...}`.

**Possible causes:**

- **Client assertion fails signature verification** — usually because the `kid` in the assertion header doesn't match a key in your published `jwks`. Check you're signing with the key whose public half is currently published.
- **Client metadata not fetchable** — the AS tried to fetch `client_id` URL and got 404, 500, or bad JSON.
- **Assertion expired** — `exp` in the past. Use a short but not zero `exp` (~60s).
- **Assertion's `aud` doesn't match AS issuer** — typo or stale issuer.
- **Assertion's `iss`/`sub` not equal to `client_id`.**
- **`jti` reuse** — AS tracks recent `jti`s per client; use a random one each time.
- **Key rotated out** — the `kid` was removed from `jwks` but sessions bound to it are still refreshing. Keep old keys longer.

Fix: regenerate the client assertion with correct `aud`, fresh `jti`, and a `kid` currently in `jwks`.

## `invalid_grant`

**Symptom:** HTTP 400 from token endpoint on authorization_code or refresh_token grant.

**Possible causes:**

| Grant type | Likely cause |
|---|---|
| `authorization_code` | Code already used; user took too long; wrong `redirect_uri`; wrong `code_verifier` |
| `refresh_token` | Refresh token already used (single-use); session revoked; session expired; DPoP key changed |

Recovery: **re-authenticate**. No retry is possible — the grant is dead.

For refresh specifically: if you hit `invalid_grant`, the session is gone. Don't retry. Clear the server session, expire the cookie, prompt user for fresh login.

## `invalid_token`

**Symptom:** HTTP 401 from PDS with `WWW-Authenticate: DPoP error="invalid_token"`.

**Causes:**

- Access token expired.
- Access token revoked.
- DPoP key mismatch.
- PDS doesn't recognize the token (AS ↔ PDS state drift).

Recovery:

1. If token is near expiry: refresh and retry.
2. If refresh fails with `invalid_grant`: re-authenticate.
3. If you just refreshed and still get `invalid_token`: possible AS-PDS lag. Retry once after a short backoff (100-500ms). If still failing, re-authenticate.

## `invalid_scope`

**Symptom:** HTTP 400 during PAR or authorize.

**Causes:**

- Requested scope not in client metadata `scope` field.
- Scope syntax malformed (e.g. partial wildcard `repo:app.bsky.*`).
- Referenced `include:<nsid>` not fetchable by AS.
- Required `atproto` scope missing.

Fix: align the authorize `scope` with metadata. Always include `atproto`.

## `access_denied`

**Symptom:** Callback URL contains `error=access_denied&error_description=...&state=...`.

**Cause:** User clicked "Deny" on the consent screen, or an AS policy rejected the request.

Recovery: clear pending state, return to pre-login. Surface a friendly message.

## `invalid_request`

**Symptom:** HTTP 400 with `{"error":"invalid_request",...}`.

**Causes:** malformed parameter — missing required field, bad encoding, `redirect_uri` not in metadata, `response_type` not `code`.

Fix: read `error_description`; usually spells out which field.

## `unsupported_grant_type`

**Symptom:** HTTP 400 from token endpoint.

**Cause:** `grant_type` you sent isn't in `grant_types` in your client metadata (or isn't supported by the AS at all).

Fix: declare `refresh_token` in client metadata `grant_types`, not just `authorization_code`.

## `server_error` / 5xx from AS

**Symptom:** HTTP 500/502/503 from AS or PDS.

**Cause:** AS/PDS is having a bad day.

Recovery: retry with exponential backoff, 3 attempts max. If still failing, surface to user. Don't silently keep trying — cascading retry storms amplify outages.

## Handle resolution failures

**Symptoms:**

- `handle.invalid` returned as the handle during resolution.
- DNS TXT `_atproto.{handle}` empty and `/.well-known/atproto-did` returns 404.
- DID document's `alsoKnownAs` doesn't include `at://{handle}`.

**Recovery:**

- Ask user for a DID directly.
- If the handle should work, point them at a handle debugger — bidirectional handle verification is the `atproto-identity-resolution` skill's territory.
- Don't proceed with an unverified handle. Spoofing risk.

## PDS discovery failures

**Symptoms:**

- DID document lacks a `#atproto_pds` service entry.
- `{PDS}/.well-known/oauth-protected-resource` returns 404.
- `authorization_servers` empty or has multiple entries.

**Recovery:**

- PDS doesn't implement OAuth yet — some older PDSes don't.
- `authorization_servers` with multiple entries: AT Proto profile says exactly one. If you see more, it's out of spec; reject.
- Ask user to check with their PDS operator.

## AS metadata rejection

**Symptoms:**

- `require_pushed_authorization_requests` missing or false.
- `authorization_response_iss_parameter_supported` missing or false.
- `client_id_metadata_document_supported` missing or false.
- `dpop_signing_alg_values_supported` doesn't include `ES256`.
- `code_challenge_methods_supported` doesn't include `S256`.

**Recovery:**

- Reject the flow. The AS doesn't meet the AT Proto profile.
- Log for debugging. This is a server configuration bug, not a client bug.

## Token expiry flakiness

**Symptom:** sporadic 401s despite "recent" refreshes.

**Likely cause:** the refresh race. Two concurrent requests both tried to refresh, both succeeded, one of the new refresh tokens is now dead on arrival.

**Fix:** serialize refreshes per session (mutex or single-flight). See `sessions.md`.

## Cookie not sent on callback

**Symptom:** callback handler can't find the OAuth-request row; you never stored it (but you did).

**Likely cause:** `SameSite=Strict` on the session cookie means the cross-origin redirect from AS doesn't carry the cookie.

**Fix:** use `SameSite=Lax`. Strict is too tight for OAuth.

## Mismatch between what you asked and what you got

**Symptom:** token response's `scope` is narrower than what you requested.

**Cause:** user (or AS policy) granted fewer scopes. This is normal.

**Fix:** respect the returned scope. Gate features you can't access gracefully. Don't pretend to have access you lack.

## "It worked yesterday"

Common culprits:

1. **Client assertion key rotated out.** Check your `jwks` still contains the key whose `kid` you're signing with.
2. **Clock drifted.** Server time is wrong; restart NTP.
3. **DPoP nonces flushed across a deploy** — normal. Next request hits `use_dpop_nonce`; retry path handles it.
4. **Client metadata served with wrong content-type or stale cache.** AS might be caching a bad response.
5. **PDS migration.** User changed PDS; their DID doc now points elsewhere. Re-resolve.

## Debugging workflow

When a flow fails, collect in this order:

1. Exact error body from the failing HTTP response.
2. Full `Set-Cookie` and `DPoP-Nonce` headers from the last successful response.
3. DPoP proof (header + claims) that was sent, decoded.
4. Client assertion (if confidential) decoded.
5. The AS metadata JSON.
6. Your client metadata JSON.
7. The `state`, `code`, `iss` from the callback (redacted to first/last 4 chars).

90% of OAuth bugs are diagnosable from those seven items.

## When to ask the server operator

- `client_id_metadata_document_supported: false` — operator hasn't enabled AT Proto OAuth.
- `invalid_client` with metadata confirmed fetchable → AS caching old key; ask to flush.
- `invalid_token` storm from one PDS → AS-PDS lag; operator can check.
- `handle.invalid` for a handle that should work → handle-resolver outage; `atproto-identity-resolution` skill.

Per-language troubleshooting (library-specific stack traces, middleware gotchas) lives in `{rust,typescript,go}/sessions.md`.

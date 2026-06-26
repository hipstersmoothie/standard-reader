# Security requirements

AT Proto OAuth pushes more of the security burden onto the client than generic OAuth 2.1 does, because client metadata documents are world-fetchable and identity resolution involves user-supplied URLs. This file catalogues the non-negotiable hardening.

## Hardened HTTP client (SSRF protection)

Every HTTP call to a **user-derived URL** MUST go through an SSRF-hardened client. This includes:

- Fetching `/.well-known/did.json` (did:web).
- Fetching `/.well-known/atproto-did` (handle → DID).
- Fetching `/.well-known/oauth-protected-resource` (PDS metadata).
- Fetching `/.well-known/oauth-authorization-server` (AS metadata).
- Fetching client metadata (if you're acting as an AS).
- Fetching permission set lexicons by NSID (likewise, AS side).
- Any DNS-resolved hostname that traces back to a user-controlled domain.

Block on resolution:

- **IPv4 private**: `10.0.0.0/8`, `172.16.0.0/12`, `192.168.0.0/16`.
- **IPv4 loopback**: `127.0.0.0/8`.
- **IPv4 link-local**: `169.254.0.0/16`.
- **IPv4 multicast / reserved**: `224.0.0.0/4`, `240.0.0.0/4`.
- **IPv6 unique-local**: `fc00::/7`.
- **IPv6 link-local**: `fe80::/10`.
- **IPv6 loopback**: `::1`.
- **DNS `.local` / `.localhost` / `.test` TLDs**.

Also cap:

- **Body size**: 256 KB or 1 MB depending on expected content. A 100 MB DID document is an attack.
- **Time**: total request budget 10s, connect 3s, idle 5s.
- **Redirects**: follow at most 2 redirects, never cross-scheme (`https://` must not redirect to `http://`).
- **TLS**: enforce valid certs. No self-signed unless explicitly enabled for dev.

Trusted upstreams (PLC directory `https://plc.directory`, known entryways) may use a separate less-restricted client. Keep the hardened one as the default; opt into the relaxed one explicitly.

Libraries: Rust `reqwest` + custom resolver; TypeScript `node-fetch` wrapped with an IP-check in its `agent`; Go `net/http` with a custom `Dialer.Control` that rejects disallowed IPs after DNS resolution.

## Key management

### DPoP keys

- **Per session.** One keypair, full session lifetime.
- **Private key never in browser in BFF pattern.** Generate on server.
- **Private key in browser for SPA** — unavoidable; store non-exportable WebCrypto key where possible.
- **Rotation on refresh is NOT a thing.** The DPoP key is fixed for the session. Rotating keys ends the session.
- **Wipe on logout.** Zero the key material in memory (`zeroize` in Rust, etc.) when deleting the session.

### Client assertion keys (confidential only)

- **Private keys stored server-side** in an HSM / KMS in production. At minimum, encrypted at rest.
- **Never committed to source control.** Generated at deploy time or loaded from a secrets manager.
- **Multiple keys** supported via `kid` in JWK and client assertion header. Rotate by adding new, draining old sessions, then removing.
- **Rotation cadence:** quarterly is reasonable. Forced rotation on suspected compromise.
- **No `d` field leaks.** When publishing `jwks` from Rust's `atproto-oauth-service-token`, ensure the serializer strips the private half.

### Cookie secret

- Per-deployment, rotating. If you rotate, plan for a window where both old and new secrets decrypt (dual-secret scheme).
- Length ≥ 32 bytes of entropy for AEAD.
- Never log the secret or cookie plaintext.

## Token security

Access tokens and refresh tokens are credentials. Treat as such.

- **In transit**: HTTPS only. DPoP provides sender-constraining but not confidentiality.
- **At rest**: encrypted. Session DB column uses `pgcrypto`, age-encrypted secret, or KMS-envelope encryption.
- **Never in client-readable cookies.** Always HttpOnly.
- **Never in logs.** Scrub request/response bodies passing through the token endpoint.
- **Lifetime caps:**
  - Access token: ≤30 min. Many PDSes set 15 min.
  - Refresh (public client): 14 days absolute.
  - Refresh (confidential client): 180 days per token, but session rotates tokens every refresh.
- **DPoP-bound.** A leaked token alone is useless without the DPoP private key. But if the key leaks too, the session is compromised.

## State / CSRF

- **`state` parameter**: random, ≥16 chars, single-use.
  - AS rejects duplicates (profile requirement).
  - Client also verifies on callback.
- **PKCE verifier**: random, 43–128 chars from `[A-Z a-z 0-9 - . _ ~]`. Never log.
- **`nonce` (client-minted)**: optional but commonly used as a secondary CSRF check tied to the browser's session cookie. Smokesignal stores `{state → nonce}` and matches on callback.

## Rate limiting

Client-side:

- **Authorize endpoint**: limit attempts per IP + per session cookie; backoff on repeated failures.
- **Token exchange**: same.
- **Refresh**: serialize per-session; client-side retries are almost always wrong.

Server-side (if running an AS):

- **PAR endpoint**: rate-limit per `client_id` and per client IP; PAR is expensive (validates DPoP, validates client assertion).
- **Token endpoint**: rate-limit per `client_id`.

## HTTP headers / response hygiene

On every HTML response from your web app:

```
Content-Security-Policy:
  default-src 'self';
  script-src 'self';
  style-src 'self' 'unsafe-inline';
  img-src 'self' https: data:;
  connect-src 'self' https://plc.directory;
  frame-ancestors 'none';
  base-uri 'self';
  form-action 'self';
Strict-Transport-Security: max-age=63072000; includeSubDomains; preload
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
Permissions-Policy: geolocation=(), microphone=(), camera=()
```

Adjust `connect-src` for any AT Proto endpoints your SPA needs to hit directly (BFFs won't need this).

## Identity verification

Every session MUST:

1. On callback, verify `iss` query parameter against stored AS issuer.
2. On token response, verify `scope` contains `atproto`.
3. On token response, verify `sub` is a DID.
4. **Resolve `sub` → DID doc → PDS → AS metadata**, and confirm `authorization_servers[0]` matches the AS you used. If mismatch: session-invalid.
5. If login started from a handle, verify the DID document's `alsoKnownAs` includes `at://{handle}`.
6. Periodically re-resolve (every day or session-renewal): the DID document can change. Handle can be revoked (`handle.invalid`).

Failures here mean the user could be authenticated but for a different account than they think. Production-grade bug.

## Client metadata authenticity

Client metadata is served from a URL the client controls. The AS treats the metadata as ground truth for the client's declared capabilities.

- **Don't host client metadata on a shared domain** where another user might write to `/oauth-client-metadata.json`. Hostname-share = client-id-squat.
- **Rotate keys proactively** if someone else might have gained write access to your metadata.
- **`jwks_uri` if you can**, at a path only you control, with strict auth/access-control on the file server.

From the AS side: cache client metadata but plan for invalidation. A rotated-out key must eventually stop working. Within the cache window, old keys remain valid — factor that into your rotation schedule.

## DPoP / JWT validation

Server-side: validate DPoP proofs with the Rust `atproto-oauth` `validate_dpop_jwt` as a reference:

- `typ == "dpop+jwt"`, `alg` in allowed list.
- `jwk` is a public EC key with matching curve.
- Signature verifies.
- `htm` matches request method.
- `htu` matches request URL (normalized: no query, no fragment, canonical host/scheme).
- `iat` within `[now - 60, now + 30]` (skew).
- `exp` if present, not in the past.
- `ath` if request carries `Authorization: DPoP <t>`.
- `nonce` matches current or recently-stale server nonce.
- `jti` not recently seen (replay prevention window ≥ proof's max lifetime).

Client-side: you don't validate DPoP proofs since you minted them. You do validate server JWTs if you're checking service auth tokens, but that's a separate skill.

## Bootstrapping (don't skip these)

- **Generate signing keys at deploy time**, not on first boot. Ensure new deployments don't mint ephemeral keys that disappear on restart.
- **Publish `jwks` BEFORE first use.** An AS fetching metadata mid-flow that doesn't contain your current signing key's public half will reject the client assertion.
- **Test with `http://localhost` first**, then with your real client_id on a staging origin, before going to production.
- **Validate the client metadata JSON** on every CI run with `scripts/validate_client_metadata.py`.

## Incident response

- **Key compromise:** rotate signing key in `jwks` immediately; remove old key after longest refresh TTL. Optionally revoke active sessions (if you've implemented session storage you can iterate).
- **Token leak:** revoke the refresh token via `/oauth/revoke` if supported; delete the session; notify user.
- **Handle takeover:** not an OAuth concern directly, but sessions bound to a DID whose handle was transferred are still valid for that DID — the DID is the identity, not the handle. UI should re-verify handle per login.
- **AS compromise:** outside your trust boundary. Best you can do: notice `invalid_token` errors across a whole PDS, alarm on it.

## Minimum security checklist (before shipping)

- [ ] Hardened HTTP client for all user-supplied URL fetches (SSRF blocked).
- [ ] Client metadata validated with `scripts/validate_client_metadata.py` in CI.
- [ ] Signing keys stored in a secrets manager, not source.
- [ ] Session cookie is HttpOnly + Secure + SameSite=Lax.
- [ ] Tokens never in client-readable state.
- [ ] DPoP key generated per session, stored server-side (BFF) or non-exportable WebCrypto (SPA).
- [ ] `state`, `nonce`, PKCE verifier are random ≥16 chars and single-use.
- [ ] Refresh is serialized per session.
- [ ] Identity verification happens after token exchange (DID → PDS → AS match).
- [ ] CSP, HSTS, X-Frame-Options, Referrer-Policy set.
- [ ] `/oauth/callback` requires the stored `state` to exist, then deletes it before exchange.
- [ ] `/oauth/logout` clears cookies and deletes the session row; best-effort revokes refresh token.

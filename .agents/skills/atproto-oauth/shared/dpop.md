# DPoP — Demonstrating Proof-of-Possession

DPoP (RFC 9449) binds an access token to a specific keypair. Every request carrying the token also carries a fresh JWT proving possession of the key. The access token is useless without the key; stealing the token from a log doesn't let an attacker use it.

AT Proto OAuth mandates DPoP on **every request** — to the AS (PAR, token, refresh, revoke) and to the PDS/RS (every XRPC call). It also mandates **server-issued nonces** that generic DPoP treats as optional.

## The keypair

One **DPoP keypair per session**. Generate it at the start of the flow (before PAR) and keep it for the life of the session. Losing the key ends the session.

- Curve: P-256 (ES256). Required baseline.
- Optional: P-384 (ES384), secp256k1 (ES256K). Only if the AS advertises them and you're sure the whole stack supports them.
- Private key stays server-side in the BFF pattern, never in the browser.
- Never reuse a DPoP key across sessions or accounts.

## The proof JWT

Every request attaches one freshly-minted proof. Proofs are one-shot: never reuse across two requests, even two identical ones.

Header:

```json
{
  "typ": "dpop+jwt",
  "alg": "ES256",
  "jwk": {
    "kty": "EC",
    "crv": "P-256",
    "x": "...",
    "y": "..."
  }
}
```

- `typ` MUST be exactly `dpop+jwt`. Not `JWT`.
- `jwk` is the **public** half of the DPoP key. No `d`.
- No `kid`, no `x5c`, no other header fields typically.

Claims:

| Claim | Required? | Value |
|---|---|---|
| `jti` | yes | Unique random string per proof. ULIDs, UUIDs, or 16+ random bytes hex all work. |
| `htm` | yes | HTTP method, uppercase: `GET`, `POST`, `PUT`, `DELETE`. |
| `htu` | yes | Full URL of the target. **No query string.** No fragment. |
| `iat` | yes | Issued-at, seconds since epoch. |
| `exp` | recommended | Short expiry, e.g. `iat + 30`. Servers typically cap at ~60s anyway. |
| `nonce` | conditionally | Server-issued nonce from `DPoP-Nonce` header. Required after first round-trip. |
| `ath` | only on resource requests | `base64url(SHA-256(access_token))`, no padding. Required when the request carries `Authorization: DPoP <token>`. |

Signed with the private DPoP key. Algorithm in header MUST match the key.

## The nonce dance

ASes and PDSes issue nonces via the `DPoP-Nonce` response header (case-insensitive). The rules:

1. **First request** to a server: mint a proof WITHOUT `nonce` claim.
2. Server returns HTTP **400** or **401** with:
   - JSON body: `{"error":"use_dpop_nonce", ...}`
   - Header: `DPoP-Nonce: <opaque nonce string>`
3. **Retry** with a NEW proof that includes `nonce: "<that string>"` in claims. Fresh `jti`, fresh `iat`. Do not change the DPoP keypair.
4. Succeed (or get a different error — different failure mode).
5. Every subsequent response from that server includes a potentially rotated `DPoP-Nonce`. **Always copy the latest one** into your per-origin nonce store before the next request.

Nonces rotate at least every 5 minutes (server rule). If you sit idle and come back, your nonce may be stale. Servers SHOULD accept recently-stale nonces, but don't rely on it. Treat a fresh `use_dpop_nonce` mid-session the same as the first: extract, retry once.

**Per-origin nonces are separate.** Track:

- One nonce for the AS (for PAR, token exchange, refresh, revoke).
- One nonce for the PDS (for all XRPC calls).

A nonce minted for the AS is invalid at the PDS and vice versa. Mixing them up produces `invalid_dpop_proof`.

**Retry budget = 1.** Two `use_dpop_nonce`s in a row on the same request is a bug — probably clock skew, wrong `htm`/`htu`, or nonce-origin confusion. Don't loop.

## `ath` on resource requests

When you send `Authorization: DPoP <access_token>`, you MUST add:

```
ath = base64url(SHA-256(access_token))    # no padding
```

to the DPoP proof claims. This binds the proof to the specific access token.

Omitting `ath` → `invalid_dpop_proof`. Including `ath` when there's no `Authorization` header (like on PAR or the token request) is not part of the profile — omit it there.

## `htu` normalization

`htu` is the full request URL **without query string or fragment**. A few consequences:

- `GET /xrpc/com.atproto.repo.getRecord?repo=did:plc:x&collection=...&rkey=...` → `htu = "https://pds.example.com/xrpc/com.atproto.repo.getRecord"`.
- Strip the query deterministically. Server-side libraries also strip, but they may normalize case/trailing-slash differently.
- Scheme and host must match exactly: `https://pds.example.com/xrpc/…`, not `https://PDS.EXAMPLE.COM/`.
- Default ports are omitted (`:443` stripped), but some servers are strict — mirror what's in the metadata document's `token_endpoint` verbatim.

If `htu` doesn't match the server's reconstructed URL, you get `invalid_dpop_proof`. Rare but real: a reverse proxy that rewrites the URL makes the server see a different `htu` than the client sent. Log both when debugging.

## Clock skew

`iat` is checked against server clock. Skew > 30 seconds → rejected as `invalid_dpop_proof` (or `Invalid timestamp`). Keep your servers' clocks in sync (NTP).

Generous defaults seen in production validators: `iat` within `[now - 60, now + 30]` with the future-clamp optional. If you're minting from a mobile client with a user-settable clock, consider a TOFU probe to detect skew before the first real request.

## Validating incoming DPoP (servers)

If you're implementing the server side (lexicon-garden / PDS / entryway) rather than the client, the validator MUST:

1. Parse JWT header. Check `typ == "dpop+jwt"`, `alg` in allowed set, `jwk` is a public EC key.
2. Verify the signature with the embedded JWK.
3. Check claims: `jti` (non-empty, optionally rate-limit recent values), `htm` matches the request method, `htu` matches the request URL (post-normalization), `iat` within clock-skew window, `exp` if present.
4. If the request carries `Authorization: DPoP <token>`, check `ath == base64url(SHA-256(token))`.
5. Check `nonce` against the set of currently-valid server nonces for the origin.
6. If `nonce` absent or stale: issue a new nonce in the response header and respond with `use_dpop_nonce`.
7. If replay protection needed: track recent `jti`s for at least the proof's `exp` window.

The Rust `atproto-oauth` crate's `validate_dpop_jwt` function ships a reference config (`DpopValidationConfig`) with all the knobs.

## Common failure modes (cheatsheet)

| Symptom | Likely cause |
|---|---|
| `use_dpop_nonce` on first request | expected — retry with the provided nonce |
| `use_dpop_nonce` twice in a row | clock skew, or nonce copied from wrong origin, or `htu` wrong |
| `invalid_dpop_proof` on resource request | missing `ath`, wrong `htm`/`htu`, or proof reused |
| `invalid_dpop_proof` immediately after refresh | forgot to rotate nonce, or reused old proof |
| `invalid_dpop_proof` on token endpoint | `htu` = authorization endpoint instead of token endpoint |
| "typ" error from server | sent `"JWT"` instead of `"dpop+jwt"` |
| Signature-verification failure | wrong algorithm vs key type, or public JWK in header doesn't match signing key |

## Diagram

```
Client                                          Server
  │                                                │
  │  POST /token  (DPoP: proof_1, no nonce)       │
  ├───────────────────────────────────────────────►│
  │                                                │
  │  400 use_dpop_nonce                            │
  │  DPoP-Nonce: N1                                │
  │◄───────────────────────────────────────────────┤
  │                                                │
  │  POST /token  (DPoP: proof_2 with nonce=N1)    │
  ├───────────────────────────────────────────────►│
  │                                                │
  │  200 { access_token, refresh_token, … }        │
  │  DPoP-Nonce: N2                                │
  │◄───────────────────────────────────────────────┤
  │                                                │
  │  (store N2 as new AS nonce)                    │
  │                                                │
  │  GET /xrpc/…  (Authorization: DPoP <at>,       │
  │                DPoP: proof_3                   │
  │                  claims: { htu, htm='GET',     │
  │                            ath=SHA256(at),     │
  │                            nonce=N_pds_1 or −})│
  ├───────────────────────────────────────────────►│
```

## Implementation note: retry middleware

The Rust `atproto-oauth` crate ships a `DpopRetry` struct implementing the `reqwest-middleware` `Chainer` trait. It transparently handles the nonce dance once per request. TypeScript and Go libraries generally build the same thing in-house but may not externalize it as a reusable middleware — see the divergence matrix.

# Go — DPoP

`indigo`'s OAuth package handles DPoP transparently for the three flow methods and for all resource-request traffic routed through `ClientSession`. Direct minting is exposed via `NewAuthDPoP` for the rare case you're making a raw HTTP call to an auth endpoint outside the flow helpers. For the RFC 9449 rules, see `../shared/dpop.md`.

## `NewAuthDPoP` — mint for auth endpoints

```go
import "github.com/bluesky-social/indigo/atproto/auth/oauth"

// Signature (approx):
func NewAuthDPoP(
    httpMethod string,           // "POST"
    url        string,            // full URL, no query/fragment
    dpopNonce  string,            // "" on first attempt; populated on retry
    privKey    *ecdsa.PrivateKey, // P-256
) (string, error)
```

Returns the serialized `dpop+jwt` JWT. Put it in the `DPoP:` header of your outbound HTTP request.

Used for PAR and token endpoints. No `ath` claim (auth endpoints don't have an access token yet).

```go
proof, err := oauth.NewAuthDPoP("POST", parURL, "", dpopKey)
if err != nil { return err }

req, _ := http.NewRequestWithContext(ctx, "POST", parURL, body)
req.Header.Set("DPoP", proof)
req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
resp, err := httpClient.Do(req)

// On 400/401 with `DPoP-Nonce` response header, re-mint and retry once:
if nonce := resp.Header.Get("DPoP-Nonce"); nonce != "" && shouldRetry(resp) {
    proof, _ = oauth.NewAuthDPoP("POST", parURL, nonce, dpopKey)
    req.Header.Set("DPoP", proof)
    resp, err = httpClient.Do(req)
}
```

You almost never need this manually — `StartAuthFlow` / `ProcessCallback` / `ResumeSession` do it all. This exists for the same reason the Rust crate exposes `auth_dpop`: custom integrations that talk directly to an AS.

## Resource requests (PDS XRPC)

Use `ClientSession` — DPoP is automatic.

```go
sess, err := app.ResumeSession(ctx, did, sid)
if err != nil { return err }

agent := atclient.NewAPIClient(sess.PDSURL, sess)
// atclient's transport reads `sess` as an atclient.AuthMethod and:
//  1. Mints a fresh DPoP proof per request, with `ath = SHA-256(access_token)`.
//  2. Uses the session's cached per-origin nonce.
//  3. Adds `Authorization: DPoP <access_token>`.
//  4. On 400/401 with `DPoP-Nonce`, re-mints, updates cache, retries once.

var out struct { /* ... */ }
err = agent.Get(ctx, "app.bsky.feed.getTimeline", params, &out)
```

**Never manually add `Authorization` or `DPoP` headers to requests going through `atclient`.** The transport owns them.

## Per-origin nonce cache

`ClientSession` carries a per-origin nonce cache (AS and PDS have separate spaces). The cache survives for the lifetime of the `*ClientSession` object — typically one request in a BFF. If you cache the `*ClientSession` across requests (don't, unless you understand concurrency), you inherit that cache.

Between requests, each `ResumeSession(ctx, did, sid)` call starts with whatever nonce is persisted in `ClientSessionData.DPoPNonce`. After a successful request, the updated nonce is written back via `store.SaveSession`. So the nonce cache is effectively:

- per session in memory, **and**
- persisted to storage as `DPoPNonce`

First request to a new origin (or first after a long idle) still pays a retry as the server issues a fresh nonce.

## Raw resource requests (without `atclient`)

If you're calling a non-lexicon-wrapped PDS endpoint (or a non-PDS resource server that accepts DPoP bearer tokens), you need to mint proof manually. The `NewAuthDPoP` helper does **not** add `ath`, so you can't use it directly for resource requests — you'd need an equivalent `NewResourceDPoP` or to hand-build the proof.

As of this writing, indigo does not export a `NewResourceDPoP`. Either:

1. Use `ClientSession` for everything — wrap the raw endpoint as a custom lexicon, or
2. Hand-build the proof with `github.com/golang-jwt/jwt/v5`:

```go
import (
    "crypto/sha256"
    "encoding/base64"
    jwt "github.com/golang-jwt/jwt/v5"
)

func mintResourceDPoP(priv *ecdsa.PrivateKey, method, url, accessToken, nonce string) (string, error) {
    ath := base64.RawURLEncoding.EncodeToString(sha256.Sum256([]byte(accessToken))[:])
    claims := jwt.MapClaims{
        "jti": newULID(),
        "htm": method,
        "htu": normalizeURL(url),
        "iat": time.Now().Unix(),
        "exp": time.Now().Add(30 * time.Second).Unix(),
        "ath": ath,
    }
    if nonce != "" { claims["nonce"] = nonce }

    token := jwt.NewWithClaims(jwt.SigningMethodES256, claims)
    token.Header["typ"] = "dpop+jwt"
    token.Header["jwk"] = publicJWK(&priv.PublicKey)
    // DO NOT include `d` in the published jwk.

    return token.SignedString(priv)
}
```

Track the returned `DPoP-Nonce` and retry per `../shared/dpop.md`.

## `htu` normalization

`NewAuthDPoP` takes the URL verbatim and does **not** strip query string / fragment. You must pre-normalize:

```go
import "net/url"

u, _ := url.Parse(rawURL)
u.RawQuery = ""
u.Fragment = ""
htu := u.String()
proof, _ := oauth.NewAuthDPoP("POST", htu, nonce, dpopKey)
```

This is the #1 silent DPoP bug. If you see `invalid_dpop_proof` and the URLs look identical, suspect the trailing `?x=y` or a `:443` default port.

## Alg and curve

`NewAuthDPoP` hard-codes `ES256` and expects a P-256 `*ecdsa.PrivateKey`. ES384 / Ed25519 are not supported. If you need them, you'll be rolling your own minting against `jwt.SigningMethodES384` — but the AS will almost certainly reject (the AT Proto profile mandates ES256 in `dpop_signing_alg_values_supported`).

## Server-side DPoP validation

`indigo`'s OAuth package is **client-side**. It does not validate incoming DPoP proofs. If you're building an AS or resource server in Go:

- Use `jose`-compatible code or `github.com/lestrrat-go/jwx/v2/jwt` to parse and verify.
- Check `typ == "dpop+jwt"`, `alg ∈ {ES256, ES384, ES256K}`, `htm`/`htu`/`iat`/`exp`, and `ath` if a bearer token is present.
- Compute the RFC 7638 thumbprint of the embedded JWK; use that as the per-session key ID.
- Maintain a bounded TTL cache of seen `jti` values to prevent replay. The TTL must exceed `max_age + clock_skew + proof_exp`.

There's no public `ValidateDpopJWT` in indigo today. See `../shared/dpop.md` §server-side for the checklist.

## Common pitfalls

- **Setting `Authorization` or `DPoP` headers on requests sent through `atclient`.** The transport overwrites them, but your shadow values can leak if code paths are brittle. Don't.
- **Caching the `*ClientSession` across requests without a mutex.** DPoP minting and nonce updates are not goroutine-safe at the session level. Get a fresh session per request via `ResumeSession`.
- **`NewAuthDPoP` with a non-P-256 key.** Errors at mint-time.
- **URL with default port.** `https://pds.example.com:443/...` → server compares against `https://pds.example.com/...`, gets mismatch. Normalize.
- **Not persisting `DPoPNonce` back to storage.** If you implement `ClientAuthStore` and drop `DPoPNonce` on `SaveSession`, every request pays a retry. Include the field.
- **Stale proof reuse.** `jti` + `iat` must be fresh per request. The library mints per-request; don't cache a proof string.

## See also

- `README.md` — package surface.
- `flows.md` — where DPoP plugs into each method.
- `sessions.md` — DPoP key + nonce persistence.
- `../shared/dpop.md` — RFC 9449 rules and nonce-dance diagram.
- `../shared/test-vectors.md` §V6–V8 — proof-shape vectors.
- `../shared/troubleshooting.md` §`invalid_dpop_proof` — diagnosis checklist.

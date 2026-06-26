# Go — Client metadata and JWKS

`oauth.ClientConfig` builds both the `/oauth-client-metadata.json` document (via `ClientMetadata()`) and the `/jwks.json` document (via `PublicJWKS()`). Your handlers just serialize them. For the rules themselves, see `../shared/client-metadata.md`.

## Minimum viable handlers (net/http)

```go
package main

import (
    "crypto/ecdsa"
    "encoding/json"
    "net/http"

    "github.com/bluesky-social/indigo/atproto/auth/oauth"
)

var cfg *oauth.ClientConfig

func init() {
    privKey := loadPrivateKey()   // *ecdsa.PrivateKey (P-256). See "Key loading" below.
    cfg = oauth.NewPublicConfig(
        "https://app.example.com/oauth-client-metadata.json",      // client_id (exact URL)
        "https://app.example.com/oauth/callback",                  // redirect_uris[0]
        []string{"atproto", "transition:generic"},                 // scopes
    )
    if err := cfg.SetClientSecret(privKey, "key-1"); err != nil {
        panic(err)
    }
}

func handleMetadata(w http.ResponseWriter, _ *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("Cache-Control", "public, max-age=300")
    json.NewEncoder(w).Encode(cfg.ClientMetadata())
}

func handleJWKS(w http.ResponseWriter, _ *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    w.Header().Set("Cache-Control", "public, max-age=300")
    json.NewEncoder(w).Encode(cfg.PublicJWKS())
}
```

Both methods return `map[string]any` — the library is the single source of truth. Don't build them by hand.

`cfg.ClientMetadata()` produces (for a confidential client):

```json
{
  "client_id":                         "https://app.example.com/oauth-client-metadata.json",
  "application_type":                  "web",
  "grant_types":                       ["authorization_code", "refresh_token"],
  "response_types":                    ["code"],
  "scope":                             "atproto transition:generic",
  "redirect_uris":                     ["https://app.example.com/oauth/callback"],
  "token_endpoint_auth_method":        "private_key_jwt",
  "token_endpoint_auth_signing_alg":   "ES256",
  "dpop_bound_access_tokens":          true,
  "jwks_uri":                          "https://app.example.com/jwks.json"
}
```

For a public client (`IsConfidential()` == false), `token_endpoint_auth_method` is `"none"` and `jwks_uri` is absent.

## Key loading

The private key is a standard `*ecdsa.PrivateKey` (from `crypto/ecdsa`) with the `P256` curve. Any crypto/x509-compatible loader works:

```go
import (
    "crypto/ecdsa"
    "crypto/x509"
    "encoding/pem"
    "fmt"
    "os"
)

func loadPrivateKey() *ecdsa.PrivateKey {
    raw, err := os.ReadFile(os.Getenv("PRIVATE_KEY_PEM"))
    if err != nil { panic(err) }

    block, _ := pem.Decode(raw)
    if block == nil { panic("bad PEM") }

    // PKCS#8:
    parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
    if err != nil { panic(err) }
    key, ok := parsed.(*ecdsa.PrivateKey)
    if !ok { panic(fmt.Sprintf("wrong key type: %T", parsed)) }
    if key.Curve.Params().Name != "P-256" {
        panic("must be P-256")
    }
    return key
}
```

Generating a new key (dev only):

```go
import (
    "crypto/ecdsa"
    "crypto/elliptic"
    "crypto/rand"
)

priv, _ := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
// Persist as PKCS#8 PEM, commit the public side to jwks.
```

## Customizing the metadata map

`ClientMetadata()` returns a `map[string]any` — you can add fields your AS requires, or override existing ones:

```go
func handleMetadata(w http.ResponseWriter, _ *http.Request) {
    md := cfg.ClientMetadata()
    md["client_name"] = "Example App"
    md["client_uri"]  = "https://app.example.com"
    md["logo_uri"]    = "https://app.example.com/logo.png"
    md["tos_uri"]     = "https://app.example.com/terms"
    md["policy_uri"]  = "https://app.example.com/privacy"

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(md)
}
```

**Critical — the returned map is live, not a copy.** `ClientMetadata()` hands back the same map the library uses internally for PAR request construction. Mutating the core fields (`client_id`, `redirect_uris`, `token_endpoint_auth_method`, `dpop_bound_access_tokens`, `jwks_uri`) corrupts the in-memory client config, and the next PAR request will be signed against values the AS does not recognize — you'll see `invalid_client` or `invalid_request` failures that look unrelated to the handler edit. If you need non-trivial customization, copy the map first (`maps.Clone(md)`) and mutate the copy. Only add presentation-layer fields (`client_name`, `client_uri`, `logo_uri`, `tos_uri`, `policy_uri`, `contacts`) directly on the returned map.

## Key rotation

The `ClientConfig` API is single-key. To rotate, stand up a new `ClientConfig` with the new key, and keep serving the old `jwks.json` content alongside — merge manually:

```go
var (
    cfgCurrent  *oauth.ClientConfig   // signs new assertions
    cfgPrevious *oauth.ClientConfig   // only its jwks entry is used
)

func handleJWKS(w http.ResponseWriter, _ *http.Request) {
    jwksCurrent  := cfgCurrent.PublicJWKS()
    jwksPrevious := cfgPrevious.PublicJWKS()

    merged := map[string]any{"keys": append(
        jwksCurrent["keys"].([]any),
        jwksPrevious["keys"].([]any)...,
    )}

    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(merged)
}
```

Drop `cfgPrevious` once the longest-lived refresh_token signed under it has expired (180 days for confidential clients).

The `ClientApp` you hand to your flow handlers should use `cfgCurrent` — new authorizations get signed with the current key.

## Public (localhost / dev) client

For local development, use `NewLocalhostConfig`:

```go
cfg := oauth.NewLocalhostConfig(
    "http://127.0.0.1:8080/oauth/callback",
    []string{"atproto", "transition:generic"},
)
// NO SetClientSecret — public client.
```

This matches the AS's loopback-client special-case: `client_id` is literally `"http://localhost"` (or similar), no metadata fetch. Use it for local testing only; production must use a real URL-based `client_id`.

## Validating your metadata

Before wiring an AS at the URL, run the repo-level validator against the served document:

```
$ python scripts/validate_client_metadata.py \
    https://app.example.com/oauth-client-metadata.json
```

Checks the invariants in `../shared/test-vectors.md` §V5.

## Serving correctly

- `Content-Type: application/json` (set explicitly; the default Go HTTP handler serves `text/plain` otherwise).
- `Cache-Control: public, max-age=300` — short, not hours. The AS re-fetches aggressively.
- HTTPS only. The AS rejects `http://` `client_id` URLs outside loopback-dev mode.
- If behind Cloudflare / CloudFront, cap TTL at 5 min during rotation windows.

## Common pitfalls

- **Hand-rolling `jwks.json` from raw keys.** Private components leak. Use `cfg.PublicJWKS()`.
- **Overwriting `client_id` / `redirect_uris` in the returned map.** The library signed PAR assertions against the original values — any mismatch = AS rejects.
- **Wrong key curve.** `SetClientSecret` requires P-256. Anything else errors at config-time.
- **`http://` in a non-loopback `redirect_uris`.** Rejected by AS. Use HTTPS everywhere except `http://127.0.0.1` / `http://localhost` in dev.
- **Missing `dpop_bound_access_tokens: true`.** The library includes it automatically for both public and confidential configs; don't override it to `false`.
- **Cache header on a CDN.** Rotation is invisible until cache expires. Pin short TTLs.

## See also

- `README.md` — crate surface, full BFF sketch.
- `flows.md` — how `ClientConfig` feeds into `StartAuthFlow`.
- `../shared/client-metadata.md` — normative rules.
- `../shared/test-vectors.md` — V3–V5 mutation tests.
- `../shared/security-requirements.md` §Client assertion keys — rotation semantics.
- Upstream demo: `indigo/atproto/auth/oauth/cmd/oauth-web-demo/main.go`.

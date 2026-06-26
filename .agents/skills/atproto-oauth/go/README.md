# Go — `indigo/atproto/auth/oauth`

The reference Go implementation of AT Proto OAuth lives in Bluesky's `indigo` monorepo at `atproto/auth/oauth/`. It is **BFF-only**: confidential clients (via `private_key_jwt`, ES256) and localhost-loopback public clients for dev. There is no browser-equivalent library in Go — the `ApplicationType` metadata field accepts `"web"` and `"native"` for spec compliance, but the transport code targets a Go HTTP server that mints assertions and owns a persistent session store.

## Install

```go
// go.mod
module example.com/myapp

go 1.25

require (
    github.com/bluesky-social/indigo v0.0.0-...  // pin to a recent commit
)
```

Key imports:

```go
import (
    "github.com/bluesky-social/indigo/atproto/auth/oauth"     // OAuth client
    "github.com/bluesky-social/indigo/atproto/client"         // atclient — XRPC transport (OAuth session plugs in)
    "github.com/bluesky-social/indigo/atproto/identity"       // handle/DID resolution
)
```

Min Go: **1.25**. Module: `github.com/bluesky-social/indigo`.

## Public surface at a glance

```go
// Configuration:
oauth.NewPublicConfig(clientID, callbackURL, scopes)     // public / localhost client
oauth.NewLocalhostConfig(callbackURL, scopes)            // http://127.0.0.1 shortcut
cfg.SetClientSecret(privKey, keyID)                      // upgrade to confidential (ES256, P-256)
cfg.IsConfidential()                                     // bool
cfg.PublicJWKS()                                         // public key set for /jwks.json
cfg.ClientMetadata()                                     // map[string]any for /oauth-client-metadata.json

// App (service-level):
app := oauth.NewClientApp(cfg, store)
app.StartAuthFlow(ctx, identifier)                       // → redirectURL, err
app.ProcessCallback(ctx, params)                         // → ClientSessionData, err
app.ResumeSession(ctx, did, sessionID)                   // → ClientSession, err
app.Logout(ctx, did, sessionID)                          // best-effort revoke + delete

// Session (per request):
sess := app.ResumeSession(ctx, did, sid)                 // sess implements atclient.AuthMethod
agent := atclient.NewAPIClient(sess.PDSURL, sess)
// ... use agent for XRPC calls

// DPoP helpers (rarely called directly):
oauth.NewAuthDPoP(method, url, nonce, privKey)           // mint DPoP for auth endpoints
// Resource-request DPoP is automatic inside ClientSession's Transport.

// Storage:
type ClientAuthStore interface {
    GetSession(ctx, did, sessionID) (*ClientSessionData, error)
    SaveSession(ctx, *ClientSessionData) error
    DeleteSession(ctx, did, sessionID) error
    GetAuthRequestInfo(ctx, state) (*AuthRequestInfo, error)
    SaveAuthRequestInfo(ctx, *AuthRequestInfo) error
    DeleteAuthRequestInfo(ctx, state) error
}
oauth.NewMemStore()                                      // in-memory impl for dev
```

## Typical wiring — BFF (net/http)

```go
package main

import (
    "context"
    "crypto/ecdsa"
    "encoding/json"
    "net/http"

    "github.com/bluesky-social/indigo/atproto/auth/oauth"
    "github.com/bluesky-social/indigo/atproto/client"
)

var (
    cfg   *oauth.ClientConfig
    app   *oauth.ClientApp
    store oauth.ClientAuthStore
)

func main() {
    // 1. Build config
    privKey := loadPrivateKey()    // *ecdsa.PrivateKey (P-256)
    cfg = oauth.NewPublicConfig(
        "https://app.example.com/oauth-client-metadata.json",
        "https://app.example.com/oauth/callback",
        []string{"atproto", "transition:generic"},
    )
    if err := cfg.SetClientSecret(privKey, "key-1"); err != nil {
        panic(err)
    }

    // 2. Build app
    store = oauth.NewMemStore()                 // swap for a real store in prod
    app = oauth.NewClientApp(cfg, store)

    // 3. Routes
    http.HandleFunc("/oauth-client-metadata.json", handleMetadata)
    http.HandleFunc("/jwks.json", handleJWKS)
    http.HandleFunc("/oauth/login", handleLogin)
    http.HandleFunc("/oauth/callback", handleCallback)
    http.HandleFunc("/api/feed", handleFeed)

    http.ListenAndServe(":8080", nil)
}

func handleMetadata(w http.ResponseWriter, _ *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(cfg.ClientMetadata())
}

func handleJWKS(w http.ResponseWriter, _ *http.Request) {
    w.Header().Set("Content-Type", "application/json")
    json.NewEncoder(w).Encode(cfg.PublicJWKS())
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
    handle := r.FormValue("handle")
    url, err := app.StartAuthFlow(r.Context(), handle)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    http.Redirect(w, r, url, http.StatusFound)
}

func handleCallback(w http.ResponseWriter, r *http.Request) {
    data, err := app.ProcessCallback(r.Context(), r.URL.Query())
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    // data.AccountDID is the verified DID.
    // data.SessionID is the storage key.
    setSessionCookie(w, data.AccountDID.String(), data.SessionID)
    http.Redirect(w, r, "/", http.StatusFound)
}

func handleFeed(w http.ResponseWriter, r *http.Request) {
    did, sid := readSessionCookie(r)
    if did == "" {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }
    sess, err := app.ResumeSession(r.Context(), did, sid)   // auto-refreshes if needed
    if err != nil {
        http.Error(w, err.Error(), http.StatusUnauthorized)
        return
    }
    agent := atclient.NewAPIClient(sess.PDSURL, sess)
    // agent.Get(...) etc.
    _ = agent
}
```

The canonical walkthrough lives in `indigo/atproto/auth/oauth/cmd/oauth-web-demo/main.go`. Read that before writing anything beyond the above sketch.

## Idioms specific to Go

- **Contexts everywhere.** Every OAuth call takes `ctx context.Context` as the first argument; pass the request context through so cancellation works.
- **`ClientSession` is an `atclient.AuthMethod`.** That's the integration point with the XRPC transport — you hand it to `atclient.NewAPIClient(pdsURL, sess)` and the DPoP bookkeeping happens under the hood.
- **ES256 only.** `SetClientSecret` requires a P-256 `*ecdsa.PrivateKey`. ES384 / Ed25519 are not supported; the JWT signing method is pinned to `ES256`.
- **Errors are plain `error`.** No typed hierarchy. Inspect with `errors.Is(err, oauth.ErrSomeCase)` where exported sentinels exist, or string-match against the wrapped body. Check `doc.go` / `types.go` for the small set of exported errors.
- **Storage is an interface.** `MemStore` is only for tests. Production = your own `ClientAuthStore` backed by Postgres, SQLite, or Redis.
- **No built-in refresh lock.** The `ClientApp` does not provide the request-lock primitive that the TypeScript client does. Either (a) accept single-process BFF and rely on the default behavior, or (b) wrap `ResumeSession` in your own per-DID mutex. See `sessions.md` §refresh race.
- **No SPA / native client support.** If you need browser OAuth, use `@atproto/oauth-client-browser`. If you need native desktop, roll it yourself against the spec — indigo's API doesn't cover it.

## Companion packages

| Package                                    | Purpose                                           |
| ------------------------------------------ | ------------------------------------------------- |
| `github.com/bluesky-social/indigo/atproto/auth/oauth` | OAuth client, DPoP, storage interface. |
| `github.com/bluesky-social/indigo/atproto/client`     | XRPC transport — `ClientSession` plugs in here. |
| `github.com/bluesky-social/indigo/atproto/identity`   | Handle/DID resolution used by `Resolver`.       |
| `github.com/bluesky-social/indigo/atproto/syntax`     | `DID`, `Handle`, `AtURI` types.                 |

## File map

| Task                                            | File                 |
| ----------------------------------------------- | -------------------- |
| Serving `/oauth-client-metadata.json` + `/jwks.json` | `client-metadata.md` |
| `StartAuthFlow` / `ProcessCallback` / `ResumeSession` | `flows.md`      |
| How DPoP is handled; custom resource calls      | `dpop.md`            |
| `ClientAuthStore`, session rows, refresh race   | `sessions.md`        |

## See also

- `../shared/spec.md` — normative rules.
- `../shared/divergence-matrix.md` — differences from Rust and TS.
- Upstream example: <https://github.com/bluesky-social/indigo/tree/main/atproto/auth/oauth/cmd/oauth-web-demo>
- Package doc: <https://pkg.go.dev/github.com/bluesky-social/indigo/atproto/auth/oauth>

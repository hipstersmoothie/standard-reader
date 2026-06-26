# Go — Flows

`oauth.ClientApp` wraps the OAuth dance into three methods: `StartAuthFlow`, `ProcessCallback`, `ResumeSession`. Plus `Logout`. This file walks through each with the net/http handlers that plug them in. For the wire-level content of each step, see `../shared/flows.md`.

## Setup

```go
import (
    "github.com/bluesky-social/indigo/atproto/auth/oauth"
)

var (
    app   *oauth.ClientApp
    store oauth.ClientAuthStore       // your impl
)

func init() {
    cfg := buildConfig()              // see client-metadata.md
    store = oauth.NewMemStore()       // swap for real store in prod
    app = oauth.NewClientApp(cfg, store)
}
```

## 1. StartAuthFlow — begin

```go
func handleLogin(w http.ResponseWriter, r *http.Request) {
    handle := r.FormValue("handle")       // "alice.bsky.social" OR "did:plc:..."
    redirectURL, err := app.StartAuthFlow(r.Context(), handle)
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    http.Redirect(w, r, redirectURL, http.StatusFound)
}
```

Under the hood:

1. Resolves `handle` → DID → DID document → PDS URL.
2. `resolver.ResolveAuthServerURL(ctx, pdsURL)` → AS URL.
3. `resolver.ResolveAuthServerMetadata(ctx, asURL)` → endpoint URIs.
4. Generates PKCE verifier + challenge, nonce, DPoP keypair.
5. If confidential: mints a client assertion JWT (`config.NewClientAssertion(asURL)`) — ES256.
6. Mints a DPoP proof via `NewAuthDPoP("POST", parURL, "", dpopKey)` (no nonce on first try).
7. POSTs PAR to `pushed_authorization_request_endpoint`. On `use_dpop_nonce`, re-mints with the returned nonce and retries once.
8. Writes `AuthRequestInfo` to `store.SaveAuthRequestInfo(ctx, info)` keyed by `state`.
9. Returns `{AS}/oauth/authorize?client_id=...&request_uri=urn:ietf:params:oauth:request_uri:...`.

Accepted identifiers: handle (`alice.bsky.social`), DID (`did:plc:...`), or a PDS URL (skips identity resolution and jumps straight to AS discovery). The function normalizes internally.

## 2. ProcessCallback — code exchange

```go
func handleCallback(w http.ResponseWriter, r *http.Request) {
    data, err := app.ProcessCallback(r.Context(), r.URL.Query())
    if err != nil {
        http.Error(w, err.Error(), http.StatusBadRequest)
        return
    }
    // data.AccountDID    — verified DID
    // data.SessionID     — storage key for this session
    // (Tokens are stored in store.SaveSession already; don't touch them here.)

    setSessionCookie(w, data.AccountDID.String(), data.SessionID)
    http.Redirect(w, r, "/", http.StatusFound)
}
```

Under the hood:

1. Reads `state`, `iss`, `code` from the query values.
2. `store.GetAuthRequestInfo(ctx, state)` → the pre-flow record. Errors if unknown.
3. Verifies `iss` matches the AS from the pre-flow info (issuer-mixup defense).
4. POSTs to `token_endpoint` with:
   - `grant_type=authorization_code`, `code`, `code_verifier`, `redirect_uri`, `client_id`
   - `client_assertion_type=...:jwt-bearer` + `client_assertion=<jwt>` (confidential only)
   - `DPoP:` header (fresh proof, `htu=token_endpoint`, no `ath`)
5. Verifies `aud == PDS URL`, `sub` resolves to a DID whose doc names the AS.
6. `store.SaveSession(ctx, sessionData)` — sets the access/refresh tokens + DPoP key.
7. `store.DeleteAuthRequestInfo(ctx, state)` — single-use.
8. Returns `*ClientSessionData` with `AccountDID` + `SessionID`.

**Never trust `state`/`code`/`iss` from the URL alone.** The library does the verification; don't bypass it with your own callback handler.

## 3. ResumeSession — fetch and use

```go
func handleAPI(w http.ResponseWriter, r *http.Request) {
    did, sid := readSessionCookie(r)
    if did == "" {
        http.Error(w, "unauthorized", http.StatusUnauthorized)
        return
    }

    sess, err := app.ResumeSession(r.Context(), did, sid)
    if err != nil {
        // Likely TokenRefreshError — session is dead.
        clearSessionCookie(w)
        http.Error(w, "session expired", http.StatusUnauthorized)
        return
    }

    agent := atclient.NewAPIClient(sess.PDSURL, sess)
    // agent.Get(ctx, "app.bsky.feed.getTimeline", params, &out)
    _ = agent
}
```

Under the hood:

1. `store.GetSession(ctx, did, sessionID)` → stored session data.
2. If `expires_at` within the refresh window (~5 min), refreshes:
   - POST to `token_endpoint` with `grant_type=refresh_token`, the refresh token, a fresh client assertion, DPoP proof.
   - Writes the new tokens back via `store.SaveSession`.
3. Returns a `*ClientSession` ready for XRPC calls.

The `*ClientSession` implements `atclient.AuthMethod`, so it plugs directly into `atclient.NewAPIClient(pdsURL, sess)`. Resource requests made through that client get DPoP + `Authorization: DPoP <token>` added automatically.

**No built-in refresh lock.** See `sessions.md` §refresh race — if you're running multiple processes, wrap `ResumeSession` in a distributed lock (Redis, Postgres advisory).

## 4. Logout

```go
func handleLogout(w http.ResponseWriter, r *http.Request) {
    did, sid := readSessionCookie(r)
    if did != "" {
        _ = app.Logout(r.Context(), did, sid)       // best-effort revoke + delete
    }
    clearSessionCookie(w)
    http.Redirect(w, r, "/", http.StatusFound)
}
```

`app.Logout`:

1. POSTs to `revocation_endpoint` with the refresh token (if the AS advertises it). Ignores errors — revocation is optional in the AT Proto profile.
2. `store.DeleteSession(ctx, did, sessionID)`.

Always run step 2 even if step 1 fails. A cookie on a user's device persists until expiry; revoking is the only way to kill the refresh token server-side.

## Wiring the routes

```go
func main() {
    // ...setup...

    http.HandleFunc("/oauth-client-metadata.json", handleMetadata)
    http.HandleFunc("/jwks.json", handleJWKS)
    http.HandleFunc("/oauth/login", handleLogin)
    http.HandleFunc("/oauth/callback", handleCallback)
    http.HandleFunc("/oauth/logout", handleLogout)
    http.HandleFunc("/api/feed", handleAPI)

    http.ListenAndServe(":8080", nil)
}
```

The canonical example is `indigo/atproto/auth/oauth/cmd/oauth-web-demo/main.go` — stand it up locally to watch the full flow against a real PDS.

## Error handling

Errors from these methods are plain `error` values — no typed hierarchy. Inspect with `errors.Is` against exported sentinels (check `doc.go`/`types.go` for the set) or by message. Common cases:

- `StartAuthFlow`:
  - Identity resolution failure (bad handle, DNS timeout).
  - AS metadata fetch failure (`/.well-known/oauth-authorization-server` 404).
  - PAR rejection (invalid scope, missing `dpop_bound_access_tokens`).
- `ProcessCallback`:
  - Unknown `state` (expired or replayed — typically > 10 min since login).
  - `iss` mismatch (defense-in-depth against mix-up).
  - PKCE verifier mismatch.
  - Token endpoint 400 (`invalid_grant`, `invalid_client`, etc.).
- `ResumeSession`:
  - Session not found in store (user cleared cookies, or you're on a new node without replicated state).
  - Refresh failed permanently (`invalid_grant` — refresh token revoked / too old). Treat as dead session.

For categorization, match on the wrapped HTTP status and error code from the AS response when available.

## Request context and cancellation

Every method takes `ctx context.Context`. Pass `r.Context()` (the HTTP request's context) so the OAuth calls are cancelled if the user disconnects. Long PAR requests without a ctx can tie up goroutines.

## Common pitfalls

- **Writing a custom callback handler.** Don't. `ProcessCallback` does DID verification, `iss` check, PKCE, single-use state cleanup, and DPoP — all correctly. Rolling your own drops at least one of these.
- **Serving routes on a non-HTTPS host.** The AS rejects callback URIs over `http://` outside loopback-dev mode. Local dev: use `http://127.0.0.1` + `NewLocalhostConfig`.
- **Storing the session by raw DID only.** `SessionID` is required to disambiguate multiple sessions for the same user (e.g. different devices). Always persist both.
- **Dropping the error from `StartAuthFlow`.** If identity resolution fails, you redirect users to a garbage URL. Surface the error to the user.
- **Not regenerating the DPoP key per flow.** The library does this — just don't cache `AuthRequestInfo` across flows thinking you can reuse keys.
- **Treating `TokenRefreshError` as transient.** It's terminal. Delete the session and force re-login.

## See also

- `README.md` — package surface, full BFF sketch.
- `dpop.md` — how `NewAuthDPoP` + automatic resource-request DPoP work.
- `sessions.md` — `ClientAuthStore` contract, refresh race handling.
- `../shared/flows.md` — byte-level wire content.
- `../shared/troubleshooting.md` — diagnosing callback failures.
- Upstream demo: `indigo/atproto/auth/oauth/cmd/oauth-web-demo/main.go`.

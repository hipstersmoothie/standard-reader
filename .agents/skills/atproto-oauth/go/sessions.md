# Go — State, sessions, and storage

`oauth.ClientApp` needs a `ClientAuthStore` for two purposes: pre-flow state (10-minute TTL, keyed by `state`) and post-flow sessions (long-lived, keyed by `(DID, sessionID)`). The package ships `MemStore` for dev; production = your own. For the shape of each, see `../shared/sessions.md`.

## The `ClientAuthStore` interface

```go
type ClientAuthStore interface {
    // Sessions (post-flow, long-lived)
    GetSession(ctx context.Context, did syntax.DID, sessionID string) (*ClientSessionData, error)
    SaveSession(ctx context.Context, sess *ClientSessionData) error
    DeleteSession(ctx context.Context, did syntax.DID, sessionID string) error

    // Auth requests (pre-flow, 10-min TTL)
    GetAuthRequestInfo(ctx context.Context, state string) (*AuthRequestInfo, error)
    SaveAuthRequestInfo(ctx context.Context, info *AuthRequestInfo) error
    DeleteAuthRequestInfo(ctx context.Context, state string) error
}
```

Six methods. All return `error`. `GetSession` / `GetAuthRequestInfo` return a sentinel or typed error when the key is unknown (check `doc.go` / `types.go` for the sentinel — match with `errors.Is`).

## Value shapes

```go
type ClientSessionData struct {
    AccountDID    syntax.DID
    SessionID     string          // random token, disambiguates multi-device sessions
    AccessToken   string
    RefreshToken  string
    ExpiresAt     time.Time
    DPoPNonce     string          // per-origin; PDS nonce
    DPoPKey       []byte          // serialized private key (PKCS#8 or JWK)
    PDSURL        string
    AuthServerURL string
    Scope         string
    // ... plus misc metadata the library reads/writes.
}

type AuthRequestInfo struct {
    State              string       // primary key
    Issuer             string
    AuthorizationServer string
    Nonce              string
    PKCEVerifier       string
    DPoPKey            []byte
    CreatedAt          time.Time
    ExpiresAt          time.Time    // CreatedAt + 10 min
}
```

**Both types contain secrets.** Encrypt the fields `AccessToken`, `RefreshToken`, `DPoPKey`, `PKCEVerifier` at rest. A leaked row = account takeover.

## `MemStore` — dev only

```go
store := oauth.NewMemStore()
app := oauth.NewClientApp(cfg, store)
```

In-memory, no TTL enforcement, lost on restart. Fine for tests. Never ship.

## Postgres-backed `ClientAuthStore`

Schema:

```sql
CREATE TABLE oauth_sessions (
    did            TEXT NOT NULL,
    session_id     TEXT NOT NULL,
    data           BYTEA NOT NULL,     -- encrypted JSON of ClientSessionData
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (did, session_id)
);

CREATE TABLE oauth_auth_requests (
    state                 TEXT PRIMARY KEY,
    data                  BYTEA NOT NULL,   -- encrypted JSON of AuthRequestInfo
    created_at            TIMESTAMPTZ NOT NULL,
    expires_at            TIMESTAMPTZ NOT NULL
);
CREATE INDEX oauth_auth_requests_expires_at ON oauth_auth_requests (expires_at);
```

Implementation sketch:

```go
type pgStore struct {
    db     *sql.DB
    aead   cipher.AEAD     // per-deployment key, chacha20poly1305 or AES-GCM
}

func (s *pgStore) SaveSession(ctx context.Context, sess *oauth.ClientSessionData) error {
    plain, err := json.Marshal(sess)
    if err != nil { return err }
    encrypted := s.encrypt(plain)
    _, err = s.db.ExecContext(ctx, `
        INSERT INTO oauth_sessions (did, session_id, data, updated_at)
        VALUES ($1, $2, $3, NOW())
        ON CONFLICT (did, session_id) DO UPDATE SET data = $3, updated_at = NOW()
    `, sess.AccountDID.String(), sess.SessionID, encrypted)
    return err
}

func (s *pgStore) GetSession(ctx context.Context, did syntax.DID, sid string) (*oauth.ClientSessionData, error) {
    var encrypted []byte
    err := s.db.QueryRowContext(ctx, `
        SELECT data FROM oauth_sessions WHERE did = $1 AND session_id = $2
    `, did.String(), sid).Scan(&encrypted)
    if errors.Is(err, sql.ErrNoRows) {
        return nil, oauth.ErrSessionNotFound   // use the library's sentinel
    }
    if err != nil { return nil, err }

    plain, err := s.decrypt(encrypted)
    if err != nil { return nil, err }

    var sess oauth.ClientSessionData
    if err := json.Unmarshal(plain, &sess); err != nil { return nil, err }
    return &sess, nil
}

// DeleteSession, SaveAuthRequestInfo, GetAuthRequestInfo, DeleteAuthRequestInfo
// follow the same pattern.
```

The `expires_at` column on `oauth_auth_requests` exists so you can garbage-collect with a cron:

```sql
DELETE FROM oauth_auth_requests WHERE expires_at < NOW();
```

Run every 5 minutes. Don't run it in the hot path.

## Redis-backed store

```go
type redisStore struct {
    client *redis.Client
    aead   cipher.AEAD
}

func (s *redisStore) SaveAuthRequestInfo(ctx context.Context, info *oauth.AuthRequestInfo) error {
    plain, _ := json.Marshal(info)
    encrypted := s.encrypt(plain)
    return s.client.Set(ctx,
        fmt.Sprintf("oauth:state:%s", info.State),
        encrypted,
        10*time.Minute,
    ).Err()
}
```

Redis handles TTL natively — no cron needed. Sessions are long-lived so use `Set` without TTL or a very long TTL (matching your refresh_token lifetime).

## The refresh race

**The single most expensive bug in AT Proto OAuth clients.**

Scenario: two concurrent requests see an expiring access token. Both call `ResumeSession(ctx, did, sid)`. Both paths refresh. The AS invalidates the old refresh token on the first call and issues a new one. The second call hits `invalid_grant`, or it succeeds but the **loser's write** to `store.SaveSession` lands after the winner's, overwriting the fresh refresh token with a dead one.

`indigo` does **not** ship a built-in lock. You must provide one.

### Mitigation 1: per-DID Mutex (single-process BFF)

```go
type RefreshLocks struct {
    mu    sync.Mutex
    locks map[string]*sync.Mutex    // keyed by DID or (DID, sessionID)
}

func (r *RefreshLocks) For(key string) *sync.Mutex {
    r.mu.Lock()
    defer r.mu.Unlock()
    m, ok := r.locks[key]
    if !ok {
        m = &sync.Mutex{}
        r.locks[key] = m
    }
    return m
}

var refreshLocks = &RefreshLocks{locks: map[string]*sync.Mutex{}}

func safeResumeSession(ctx context.Context, app *oauth.ClientApp, did syntax.DID, sid string) (*oauth.ClientSession, error) {
    key := did.String() + "|" + sid
    lock := refreshLocks.For(key)
    lock.Lock()
    defer lock.Unlock()
    // ResumeSession now runs under the mutex; concurrent callers serialize.
    return app.ResumeSession(ctx, did, sid)
}
```

Simple, correct for a single process. The map grows unbounded — if you have many unique DIDs, periodically prune.

### Mitigation 2: Postgres advisory lock (multi-process)

```go
func withAdvisoryLock(ctx context.Context, db *sql.DB, key string, fn func() error) error {
    hash := hash64(key)
    conn, err := db.Conn(ctx)
    if err != nil { return err }
    defer conn.Close()

    if _, err := conn.ExecContext(ctx, "SELECT pg_advisory_lock($1)", hash); err != nil {
        return err
    }
    defer conn.ExecContext(ctx, "SELECT pg_advisory_unlock($1)", hash)

    return fn()
}
```

Wrap `ResumeSession` calls with it. Works across processes, blocks concurrent refreshes for the same `(DID, SID)`.

### Mitigation 3: Redlock

```go
import "github.com/go-redsync/redsync/v4"

rs := redsync.New(redsyncpool)

func safeResumeSession(ctx, app, did, sid) (*oauth.ClientSession, error) {
    mutex := rs.NewMutex(fmt.Sprintf("oauth:refresh:%s:%s", did, sid),
        redsync.WithTries(10), redsync.WithRetryDelay(200*time.Millisecond))
    if err := mutex.LockContext(ctx); err != nil { return nil, err }
    defer mutex.UnlockContext(ctx)
    return app.ResumeSession(ctx, did, sid)
}
```

30-second lock TTL (refresh typically <2s). Use this for multi-node deployments backed by Redis.

**Key principle** (all three): after acquiring the lock, re-read the session from the store — someone else may have refreshed while you waited. `ResumeSession` does the refresh internally against the freshly-read state, so the mutex alone is enough; just don't bypass it.

## Session cookies

The library doesn't impose a cookie format — you own the BFF surface. Typical pattern:

```go
// net/http + gorilla/sessions (used in the upstream demo)
var store = sessions.NewCookieStore([]byte(os.Getenv("COOKIE_SECRET")))

func setSessionCookie(w http.ResponseWriter, did, sid string) {
    s, _ := store.New(nil, "oauth-session")
    s.Options = &sessions.Options{
        Path:     "/",
        MaxAge:   30 * 24 * 60 * 60,       // 30 days
        HttpOnly: true,
        Secure:   true,
        SameSite: http.SameSiteLaxMode,     // NOT Strict — callback is cross-origin
    }
    s.Values["did"] = did
    s.Values["sid"] = sid
    _ = s.Save(nil, w)
}

func readSessionCookie(r *http.Request) (did, sid string) {
    s, err := store.Get(r, "oauth-session")
    if err != nil { return "", "" }
    did, _ = s.Values["did"].(string)
    sid, _ = s.Values["sid"].(string)
    return
}
```

**`SameSite=Lax`, not `Strict`.** The OAuth callback is a cross-origin redirect from the AS; `Strict` drops the cookie and your callback handler can't find pre-flow state. See `../shared/troubleshooting.md` §"Cookie not sent on callback".

## Two-cookie pattern (optional)

If you want the DID readable by client-side JS (for display without a round trip):

```go
http.SetCookie(w, &http.Cookie{
    Name: "session", Value: encryptedSessionID,
    HttpOnly: true, Secure: true, SameSite: http.SameSiteLaxMode,
    Path: "/", MaxAge: 30 * 24 * 60 * 60,
})

http.SetCookie(w, &http.Cookie{
    Name: "identity", Value: jsonIdentity(did, handle, pdsURL),
    HttpOnly: false, Secure: true, SameSite: http.SameSiteLaxMode,
    Path: "/", MaxAge: 30 * 24 * 60 * 60,
})
```

Encrypt the `session` cookie value. The `identity` cookie holds only display data — never trust it server-side.

## Logout

```go
func handleLogout(w http.ResponseWriter, r *http.Request) {
    did, sid := readSessionCookie(r)
    if did != "" {
        _ = app.Logout(r.Context(), did, sid)     // best-effort revoke + DeleteSession
    }
    // Clear cookies
    for _, name := range []string{"oauth-session", "identity"} {
        http.SetCookie(w, &http.Cookie{
            Name: name, Value: "", MaxAge: -1, Path: "/",
        })
    }
    http.Redirect(w, r, "/", http.StatusFound)
}
```

`app.Logout`:
1. Best-effort POST to `revocation_endpoint` with the refresh token.
2. `store.DeleteSession(ctx, did, sid)`.

Always run step 2 even if step 1 fails.

## Key hygiene

- **DPoP private key is immortal for the session.** Stored in `ClientSessionData.DPoPKey`. Never rotate mid-session. Rotation = new session.
- **Encrypt `data` at rest.** Both tables. `chacha20poly1305` (stdlib `crypto/chacha20poly1305`) or AES-GCM.
- **Rotate the cookie secret** periodically. Dual-secret decode during transitions.
- **Zero secrets after use.** `crypto/subtle` has no `memzero` — best effort is to overwrite the slice and drop it, but Go's GC makes this advisory.
- **No tokens in logs.** Log `did` and `session_id` only.

## Common pitfalls

- **No refresh lock in a multi-process BFF.** Dead refresh tokens. Use Postgres advisory lock or Redlock.
- **Running `DELETE FROM oauth_auth_requests WHERE expires_at < NOW()` on every request.** Table scan in the hot path. Cron only.
- **Treating `TokenRefreshError` as transient.** It's terminal. Delete the session.
- **Storing `ClientSessionData` as plain JSON with no encryption.** `RefreshToken` + `DPoPKey` = full account compromise.
- **`SameSite=Strict` on the session cookie.** Breaks the callback. Lax is required.
- **Forgetting to persist `DPoPNonce`.** Every subsequent request pays a DPoP-nonce retry. Include the field in your `SaveSession` serialization.
- **Session lookup without `(did, session_id)` composite key.** Collides if a user has multiple concurrent sessions. Always key by both.

## See also

- `README.md` — package surface, full BFF sketch.
- `flows.md` — where `ClientAuthStore` plugs into each method.
- `dpop.md` — DPoP key + nonce persistence details.
- `../shared/sessions.md` — language-neutral rules and patterns.
- `../shared/security-requirements.md` — cookie/key/token hardening checklist.
- `../shared/troubleshooting.md` §refresh race — diagnosis.
- Upstream demo: `indigo/atproto/auth/oauth/cmd/oauth-web-demo/main.go`.

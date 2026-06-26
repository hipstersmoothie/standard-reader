# Rust — Session state, storage, and the refresh race

Two things need persistence: **pre-flow state** (10-minute TTL, keyed by `state`) and **per-user session** (long-lived, keyed by DID). The crate ships the trait for the first; the second is application-owned. For the shape of each, see `../shared/sessions.md`.

## Pre-flow state: `OAuthRequestStorage`

```rust
#[async_trait::async_trait]
pub trait OAuthRequestStorage: Send + Sync {
    async fn get_oauth_request_by_state(&self, state: &str) -> Result<Option<OAuthRequest>>;
    async fn delete_oauth_request_by_state(&self, state: &str) -> Result<()>;
    async fn insert_oauth_request(&self, request: OAuthRequest) -> Result<()>;
    async fn clear_expired_oauth_requests(&self) -> Result<u64>;
}
```

The OAuthRequest contains `oauth_state, issuer, authorization_server, nonce, pkce_verifier, signing_public_key, dpop_private_key, created_at, expires_at`. `expires_at` should be `created_at + 10 minutes`.

### Implementations to reach for

1. **`LruOAuthRequestStorage`** — enabled with `feature = "lru"`. In-memory LRU, good for single-node dev and test:

   ```rust
   use atproto_oauth::storage_lru::LruOAuthRequestStorage;
   let storage = LruOAuthRequestStorage::new(1000);  // capacity
   ```

2. **Database-backed** (production). Schema:

   ```sql
   CREATE TABLE oauth_requests (
     oauth_state            TEXT PRIMARY KEY,
     issuer                 TEXT NOT NULL,
     authorization_server   TEXT NOT NULL,
     nonce                  TEXT NOT NULL,
     pkce_verifier          TEXT NOT NULL,
     signing_public_key     TEXT NOT NULL,
     dpop_private_key       BYTEA NOT NULL,  -- encrypt at rest
     created_at             TIMESTAMPTZ NOT NULL,
     expires_at             TIMESTAMPTZ NOT NULL
   );
   CREATE INDEX oauth_requests_expires_at ON oauth_requests (expires_at);
   ```

   Implement the trait against `sqlx::Pool`. See the doc-example in `storage.rs:91-145` for a full sketch.

3. **Your own:** Redis, DynamoDB, etc. Keep TTL enforcement at the storage layer; don't rely on callers to check.

### Lifecycle

```rust
// Begin-flow handler:
let oauth_request = OAuthRequest {
    oauth_state, issuer, authorization_server,
    nonce, pkce_verifier,
    signing_public_key, dpop_private_key,
    created_at: Utc::now(),
    expires_at: Utc::now() + Duration::minutes(10),
};
storage.insert_oauth_request(oauth_request).await?;

// Callback handler:
let req = storage.get_oauth_request_by_state(&state).await?
    .ok_or("oauth state not found or expired")?;
// ... verify `iss`, run oauth_complete ...
storage.delete_oauth_request_by_state(&state).await?;   // single-use

// Background cron (every 5 min):
storage.clear_expired_oauth_requests().await?;
```

## Post-auth session state (application-owned)

The crate does not provide a session abstraction — it's application-specific. The shape from the reference impls:

```rust
#[derive(Clone, Serialize, Deserialize)]
pub struct SessionCookie {
    pub did: String,                           // primary key
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_at: DateTime<Utc>,             // absolute; drives refresh
    pub dpop_private_key: String,              // serialized KeyData — life of session
}

#[derive(Clone, Serialize, Deserialize)]
pub struct IdentityCookie {
    pub did: String,
    pub handle: Option<String>,
    pub pds_url: Option<String>,
}
```

### Two-cookie pattern

Set two cookies from the callback handler:

```rust
let session_header = build_session_cookie_header(domain, &encrypted_session, MAX_AGE)?;
let identity_header = build_identity_cookie_header(domain, &plain_identity, MAX_AGE)?;

let mut headers = HeaderMap::new();
headers.insert(header::SET_COOKIE, session_header);     // HttpOnly, Secure, SameSite=Lax
headers.append(header::SET_COOKIE, identity_header);    // NOT HttpOnly (read from JS)
```

The session cookie is AEAD-encrypted with the `cookie_secret`; the identity cookie carries only `{did, handle, pds}` for client-side display.

### Encryption

Use a symmetric cipher with per-deployment keys. `chacha20poly1305` with a 32-byte secret works; Smoke Signal uses Axum's `PrivateCookieJar` (AES-GCM). Either is fine — just:

- **Never put raw tokens in a non-encrypted cookie.**
- **Rotate the cookie_secret** periodically; run dual-secret decrypt (accept old + new) during transitions.
- **Zeroize after decode** if you copy secrets onto the heap.

## The refresh race

**The single most expensive bug in AT Proto OAuth clients.**

Two concurrent requests both see an expired access token. Both fire `oauth_refresh`. The AS invalidates the old refresh token on the first call and issues new one; the second call lands in the "token already used" window and returns `invalid_grant`, and whichever client copy wrote its session row **last** wins — the other one has a dead refresh token on file.

### Mitigation 1: per-session mutex

```rust
use tokio::sync::Mutex;
use std::sync::Arc;
use std::collections::HashMap;

#[derive(Clone, Default)]
pub struct RefreshLocks {
    // Keyed by DID. `Arc<Mutex<()>>` because Mutex is !Clone.
    inner: Arc<tokio::sync::RwLock<HashMap<String, Arc<Mutex<()>>>>>,
}

impl RefreshLocks {
    pub async fn lock_for(&self, did: &str) -> tokio::sync::OwnedMutexGuard<()> {
        let m = {
            let mut write = self.inner.write().await;
            write.entry(did.to_string())
                .or_insert_with(|| Arc::new(Mutex::new(())))
                .clone()
        };
        m.lock_owned().await
    }
}

// In the refresh path:
let _guard = state.refresh_locks.lock_for(&session.did).await;
// Re-read the session AFTER acquiring the lock — another task may have refreshed.
let session = read_session_from_db(&session.did).await?;
if !session.expires_within(Duration::minutes(5)) {
    return Ok(session);  // someone else refreshed while we waited
}
let refreshed = oauth_refresh(...).await?;
write_session_to_db(&session.did, &refreshed).await?;
```

Key: **re-read after lock**, so the winner's work is visible to everyone else in the queue.

### Mitigation 2: database row lock

```rust
// Postgres:
BEGIN;
SELECT ... FROM sessions WHERE did = $1 FOR UPDATE;   -- blocks concurrent refreshes
-- run oauth_refresh
UPDATE sessions SET access_token = ..., refresh_token = ... WHERE did = $1;
COMMIT;
```

Simpler if your session already lives in Postgres; combines the lock and the write atomically.

### Mitigation 3: single-flight

Cache the in-flight `oauth_refresh` future and await it from every waiter:

```rust
// Using `tokio::sync::broadcast` or a single-flight crate like `singleflight-async`.
```

Use this when you expect heavy concurrent access (BFF fronting many clients).

## Refresh scheduling

Two styles, both acceptable:

### Lazy (recommended default)

Refresh inline on the request that discovers the expiring access token. Wrap this in middleware so every handler sees a fresh session without thinking about it:

```rust
use chrono::{Duration, Utc};
use axum::http::{HeaderMap, HeaderValue, header};

pub struct RefreshOutcome {
    pub session: SessionCookie,
    pub set_cookie_header: Option<HeaderValue>,
}

async fn try_refresh_session(
    state: &AppState,
    session: SessionCookie,
    window: Duration,
) -> anyhow::Result<RefreshOutcome> {
    // 1. If the access token isn't near expiry, pass through unchanged.
    if session.expires_at > Utc::now() + window {
        return Ok(RefreshOutcome { session, set_cookie_header: None });
    }
    // 2. Need a refresh_token to even try.
    let refresh_token = session.refresh_token.clone()
        .ok_or_else(|| anyhow::anyhow!("no refresh_token — force re-login"))?;

    // 3. Take the per-DID refresh lock and re-read after acquiring (see §refresh race).
    let _guard = state.refresh_locks.lock_for(&session.did).await;
    let session = state.session_store.get(&session.did).await?
        .ok_or_else(|| anyhow::anyhow!("session vanished while waiting for lock"))?;
    if session.expires_at > Utc::now() + window {
        return Ok(RefreshOutcome { session, set_cookie_header: None });
    }

    // 4. Re-resolve the DID so PDS migrations are picked up before refreshing.
    let doc = state.identity_resolver.resolve(&session.did).await?;
    let dpop_key = identify_key(&session.dpop_private_key)?;

    // 5. Refresh.
    let token_response = atproto_oauth::workflow::oauth_refresh(
        &state.http, &state.oauth_client, &dpop_key, &refresh_token, &doc,
    ).await?;

    // 6. Build the new cookie, persist, return Set-Cookie.
    let new_session = SessionCookie {
        did: session.did,
        access_token: token_response.access_token,
        refresh_token: token_response.refresh_token.or(Some(refresh_token)),
        expires_at: Utc::now() + Duration::seconds(token_response.expires_in as i64),
        dpop_private_key: session.dpop_private_key,
    };
    state.session_store.put(&new_session).await?;
    let header = build_session_cookie_header(&state.cookie_domain, &new_session)?;
    Ok(RefreshOutcome { session: new_session, set_cookie_header: Some(header) })
}

async fn refresh_middleware(
    state: &AppState,
    headers: &HeaderMap,
    response_headers: &mut HeaderMap,
) -> anyhow::Result<SessionCookie> {
    let session = read_session_cookie(headers)?;
    let out = try_refresh_session(state, session, Duration::minutes(5)).await?;
    if let Some(h) = out.set_cookie_header {
        response_headers.insert(header::SET_COOKIE, h);
    }
    Ok(out.session)
}
```

The mandatory steps are: check-the-window → take-the-lock → re-check-the-window → refresh → persist → emit `Set-Cookie`. Skipping the second window check is the refresh-race bug in disguise.

### Proactive background

Spawn a per-session Tokio task that wakes at `expires_at - 5min`, refreshes, writes DB. Better for keeping request latency flat; more state to manage. Most apps don't need this.

## Cookie SameSite

```rust
format!(
    "session={value}; Domain={domain}; Path=/; HttpOnly; Secure; \
     SameSite=Lax; Max-Age={max_age}"
)
```

**`SameSite=Lax`, not `Strict`.** The OAuth callback is a cross-origin redirect from the AS — `Strict` drops the cookie, your callback handler can't find the session row, you end up in the debug workflow described in `../shared/troubleshooting.md` §"Cookie not sent on callback".

## Logout

```rust
pub async fn handle_auth_logout(...) -> impl IntoResponse {
    // 1. Local: expire cookies.
    let expire_session  = format!("session=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
    let expire_identity = format!("identity=; Path=/; Secure; SameSite=Lax; Max-Age=0");

    // 2. Delete server-side session row.
    session_store.delete(&did).await?;

    // 3. (Optional, best-effort) revoke at AS — `POST /oauth/revoke` with refresh_token.
    //    AT Proto profile doesn't mandate revoke support; ignore 404/405.

    let mut headers = HeaderMap::new();
    headers.insert(header::SET_COOKIE, expire_session.parse().unwrap());
    headers.append(header::SET_COOKIE, expire_identity.parse().unwrap());
    (headers, Redirect::to("/"))
}
```

Always do steps 1–2, even if you skip 3. A stolen session cookie remains valid until the underlying access/refresh tokens expire; revoking the refresh token is the only way to end a session at the AS, but that endpoint may not exist.

## Key hygiene

- **DPoP private key is immortal-for-session.** Never rotate during a session; rotating = end of session. Generate once in login handler, zeroize on logout.
- **Serialized form.** `KeyData::to_string()` produces a `did:key:z...` form. `identify_key(&str)` reverses it. Store the serialized string (it's short, UTF-8, no padding concerns).
- **Encryption at rest.** In production, wrap the stored `dpop_private_key` column with `pgcrypto` / envelope encryption / age. Same for `refresh_token`.
- **Enable `zeroize` feature** on the `atproto-oauth` dep. `OAuthRequest` and `TokenResponse` then zero on drop.

## Common pitfalls

- **Serializing `OAuthRequest` without the `zeroize` feature.** Heap copies of the DPoP private key proliferate; use `zeroize` or at least `secrecy::SecretString`.
- **Re-reading session after refresh without lock.** Lose the refresh race; dead tokens.
- **`clear_expired_oauth_requests` run on every request.** Run on a cron, not in the hot path — it scans the table.
- **Single-flight cache keyed by cookie value instead of DID.** A cookie refreshes and the key changes; the in-flight future completes but nobody reads the result. Key by DID.
- **Storing the session in an unsigned cookie for "simplicity".** The cookie value is the token itself at that point. Sign/encrypt always.

## See also

- `README.md` — crate surface.
- `flows.md` — where `OAuthRequestStorage` and session cookies plug in.
- `../shared/sessions.md` — language-neutral session rules and BFF/SPA/native patterns.
- `../shared/security-requirements.md` — cookie, key, and token hardening checklist.
- `../shared/troubleshooting.md` §refresh race, §cookie not sent on callback — the specific bugs this file exists to prevent.

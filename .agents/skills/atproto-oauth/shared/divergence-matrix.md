# Cross-Language Divergence Matrix (AT Proto OAuth)

Language-neutral. Captures the real behavioural differences between the Rust (`atproto-oauth`), TypeScript (`@atproto/oauth-client-node` / `@atproto/oauth-client-browser`), and Go (`indigo/atproto/auth/oauth`) OAuth stacks that anyone porting code, operating cross-stack, or auditing interop needs to know about.

Every per-language file (`rust/*.md`, `typescript/*.md`, `go/*.md`) links back here instead of restating the matrix.

## Library map

| Layer                      | Rust (`atproto-oauth`)             | TypeScript (`@atproto/oauth-client-*`)       | Go (`indigo/atproto/auth/oauth`)       |
| -------------------------- | ---------------------------------- | --------------------------------------------- | -------------------------------------- |
| Client shape               | Functions (`oauth_init`, `oauth_complete`, `oauth_refresh`) + `OAuthClient` struct as config bag | `NodeOAuthClient`, `BrowserOAuthClient` classes w/ `.authorize` / `.callback` / `.restore` | `ClientApp` struct w/ `StartAuthFlow` / `ProcessCallback` / `ResumeSession` |
| Confidential client        | Supported (ES256 / ES384 / ES256K) | Supported (ES256 only in practice via `JoseKey`) | Supported (ES256 only — hard-coded)  |
| Public / SPA client        | Supported (caller wires)           | **First-class** (`@atproto/oauth-client-browser`) | **Not supported** — BFF only        |
| Native / desktop client    | Supported (caller wires)           | `@atproto/oauth-client-node` with `token_endpoint_auth_method: none` | **Not supported** — BFF only        |
| DPoP minting (auth endpts) | `auth_dpop(key, method, url)` → `(token, header, claims)` | Hidden inside flow methods                    | `NewAuthDPoP(method, url, nonce, priv)` |
| DPoP minting (resource)    | `request_dpop(key, method, url, access_token)` | Hidden inside `session.fetchHandler`   | Hidden inside `ClientSession`'s transport |
| DPoP nonce retry           | `DpopRetry` middleware (1-try budget) | Inside `fetchHandler` (1-try budget)       | Inside flow methods + `ClientSession` (1-try budget) |
| Server-side DPoP validate  | `validate_dpop_jwt` + `DpopValidationConfig` | **Not shipped** — roll with `jose`      | **Not shipped** — roll with `jwx`      |
| Pre-flow state storage     | `OAuthRequestStorage` trait + `LruOAuthRequestStorage` | `StateStore` interface (user-impl)      | `ClientAuthStore` interface + `MemStore` |
| Session storage            | **Caller-owned** — no built-in abstraction | `SessionStore` interface (user-impl)      | `ClientAuthStore.SaveSession` (same interface as state) |
| Refresh lock               | **Caller-owned**                   | `NodeRequestLock` injected into `NodeOAuthClient` | **Not provided** — roll your own     |
| Handle resolution          | Via `atproto-identity` (separate crate) | Injected `handleResolver` (URL or function) | Via `atproto/identity` (plumbed in)  |
| Client metadata builder    | Caller writes the JSON directly (see `rust/client-metadata.md`) | `client.clientMetadata` echo-back            | `cfg.ClientMetadata()` (map)           |
| JWKS publisher             | Caller iterates `jwk::generate` over keys | `client.jwks` (library strips private halves) | `cfg.PublicJWKS()` (map)            |

The shape of the trade-off:

- **TypeScript ships the most out-of-the-box** — it has the only first-class SPA client, a built-in refresh lock abstraction, and a fetch handler that makes DPoP entirely invisible.
- **Rust ships the most primitives** — three function calls and a bag of types; you wire the flows yourself but get the only production-grade `validate_dpop_jwt` in any of the three stacks.
- **Go ships the least** — BFF-only, no refresh lock, no SPA, no server-side DPoP validator, and ES256 is hard-coded. But the `ClientApp` + `ClientAuthStore` + `ClientSession` trio covers the happy path cleanly.

---

## §client-metadata — metadata document + JWKS

| Aspect                         | Rust                                   | TypeScript                                | Go                                           |
| ------------------------------ | -------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Metadata representation        | Caller writes Serde struct             | `client.clientMetadata` (echo of constructor input) | `cfg.ClientMetadata()` → `map[string]any` |
| JWKS representation            | `jwk::generate(&KeyData)` → `WrappedJsonWebKey` (one key at a time) | `client.jwks` → `{ keys: JsonWebKey[] }` | `cfg.PublicJWKS()` → `map[string]any`    |
| Private component stripping    | **Caller must `to_public(&key)` first** before `jwk::generate` — easy to forget | Automatic (library strips)            | Automatic (library strips)                   |
| Multi-key rotation             | Pass `Vec<KeyData>` in config; all published | Pass `keyset: JoseKey[]` — all published | **Single-key API** — merge manually at serve time |
| Supported alg values           | ES256, ES384, ES256K                  | ES256 (practical — via `JoseKey`)          | ES256 (hard-coded)                           |
| Loopback dev shortcut          | Caller writes the metadata as usual    | Supported via `clientId = 'http://127.0.0.1/...'` | **First-class**: `oauth.NewLocalhostConfig(...)` |

**Practical bug one**: **Rust requires `to_public` before `jwk::generate`**. If you skip it, the private component `d` is serialized into your published JWKS, leaking the signing key. TS and Go guard against this by having the library strip private halves internally.

**Practical bug two**: **Go is single-key**. Key rotation requires two `ClientConfig` instances + a manual JSON merge at the `/jwks.json` handler. TS and Rust natively accept multi-key sets.

**Practical bug three**: `ClientMetadata()` in Go returns a mutable `map[string]any`. Overwriting a signed field (`redirect_uris`, `client_id`) after config-time silently breaks the signed PAR assertion. TS's `client.clientMetadata` is a live object that mirrors the constructor input — same risk exists if you mutate it.

---

## §flows — the three verbs

| Aspect                                  | Rust                                   | TypeScript                                | Go                                           |
| --------------------------------------- | -------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Begin-flow method name                  | `oauth_init(&client, &state, issuer)`  | `client.authorize(handle, options)`       | `app.StartAuthFlow(ctx, identifier)`         |
| Callback method name                    | `oauth_complete(&client, &request, params)` | `client.callback(params)`           | `app.ProcessCallback(ctx, params)`           |
| Refresh method name                     | `oauth_refresh(&client, &session)`     | `client.restore(did)` (auto-refreshes)    | `app.ResumeSession(ctx, did, sid)` (auto-refreshes) |
| Identity resolution inside begin        | Caller passes resolved `issuer`       | Library resolves `handle` internally      | Library resolves `identifier` internally     |
| `iss` parameter verification            | Caller compares against pre-flow state | Library verifies                          | Library verifies                             |
| DID / `sub` / `aud` cross-check         | Caller implements                      | Library verifies                          | Library verifies                             |
| Pre-flow state cleanup (single-use)     | Caller calls `storage.delete_oauth_request_by_state(state)` after `oauth_complete` | Library calls `stateStore.del(key)` | Library calls `store.DeleteAuthRequestInfo(ctx, state)` |
| Refresh token rotation on refresh       | Returned in `TokenResponse` — caller persists | Library persists via `sessionStore.set` | Library persists via `store.SaveSession` |
| Error representation                    | Typed: `TokenHttpRequestFailed`, `JsonParsingFailed`, `IssuerMismatch`, … | Typed: `OAuthResponseError`, `OAuthCallbackError`, `TokenRefreshError` | Plain `error` — inspect body/status        |

**Practical bug one**: **Rust is the only stack where the caller threads identity resolution in manually.** The other two resolve handles internally. Port a Rust BFF to TS or Go → you can drop your DID-resolution step; port TS or Go to Rust → you must add one.

**Practical bug two**: **Rust leaves the session abstraction to the caller**. TS and Go both define the session row shape the library writes and reads. In Rust, each downstream application ships its own `SessionCookie` / `SessionRow` type — cross-project sharing is painful.

**Practical bug three**: **Go error inspection requires body/status match**. TS and Rust let you `instanceof`/`match` on error types. Port code → Go defaults to string-matching until you factor out a custom error type.

---

## §dpop — proof minting and nonce handling

| Aspect                                  | Rust (`atproto_oauth::dpop`)           | TypeScript                                | Go (`indigo/atproto/auth/oauth`)            |
| --------------------------------------- | -------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Mint-for-auth helper                    | `auth_dpop(key, method, url)`          | N/A — hidden inside flow methods          | `NewAuthDPoP(method, url, nonce, priv)`      |
| Mint-for-resource helper                | `request_dpop(key, method, url, access_token)` | N/A — hidden inside `session.fetchHandler` | **None** — use `ClientSession` or hand-build |
| Nonce retry middleware                  | `DpopRetry` wraps `reqwest::Client`    | Inside `fetchHandler`                      | Inside `ClientSession`'s transport            |
| Check response body for `use_dpop_nonce`| Configurable (`check_response_body: bool`) | Always on                             | Always on                                    |
| Per-origin nonce cache                  | **Caller-managed** — `DpopRetry` is request-scoped | Library-managed, in-memory per session | Library-managed, persisted to `ClientSessionData.DPoPNonce` |
| `htu` auto-normalization                | **No** — caller strips query/fragment | Yes — library normalizes                   | **No** — caller strips query/fragment       |
| Server-side `validate_dpop_jwt`         | Full implementation + `DpopValidationConfig` | **Not shipped**                    | **Not shipped**                              |
| `jti` replay protection                 | **Caller implements** (not built in)   | N/A (client-only)                          | N/A (client-only)                            |
| Alg / curve mismatch guard              | None — `auth_dpop` hard-codes `ES256` in the header even for P-384 keys | Enforced at key-construction time (JoseKey pins alg) | Enforced at config-time (`SetClientSecret` requires P-256) |

**Practical bug one**: **Rust's `auth_dpop` hard-codes `ES256` in the JWT header regardless of key type.** Pass a P-384 key and the proof won't verify. Use `dpop::mint(...)` with a hand-built `Header` for non-P-256 keys. This is a latent bug documented in `rust/dpop.md`.

**Practical bug two**: **`htu` normalization is caller-side in Rust and Go.** TS strips query/fragment and default ports automatically. Port TS code → Rust/Go and `invalid_dpop_proof` from the PDS becomes the #1 failure mode until you add the normalization step.

**Practical bug three**: **Go has no resource-DPoP helper.** `NewAuthDPoP` omits `ath`. Either route everything through `ClientSession` (which handles resource DPoP automatically) or hand-build the proof with `golang-jwt/jwt/v5`.

**Practical bug four**: **Only Rust ships `validate_dpop_jwt`.** If you're writing an AS or resource server in Go/TS, you're on your own for DPoP validation.

---

## §sessions — storage and refresh-race

| Aspect                                  | Rust                                   | TypeScript                                | Go                                           |
| --------------------------------------- | -------------------------------------- | ----------------------------------------- | -------------------------------------------- |
| Pre-flow state interface                | `OAuthRequestStorage` trait (4 methods) | `StateStore` interface (3 methods)      | `ClientAuthStore` (6 methods, combined)      |
| Session row interface                   | **None** — caller defines              | `SessionStore` interface (3 methods)      | Same `ClientAuthStore` (session + request methods) |
| Built-in dev/in-memory impl             | `LruOAuthRequestStorage` (pre-flow only) | Caller implements                      | `MemStore`                                    |
| TTL handling for pre-flow state         | `clear_expired_oauth_requests()` method — **caller runs on cron** | Caller implements (Redis TTL is idiomatic) | Caller implements (cron on PG; TTL on Redis) |
| Refresh lock                            | **Caller-implemented** (Mutex/row lock/single-flight) | `NodeRequestLock` — library invokes around refresh | **Not invoked by library** — caller wraps `ResumeSession` |
| Distributed lock (multi-process)        | Caller integrates (Redis/PG advisory)  | `NodeRequestLock` user-provided            | Caller wraps `ResumeSession` (PG advisory / Redlock) |
| Session-cookie abstraction              | **None** — caller builds + encrypts    | **None** — caller builds + encrypts       | **None** — caller builds + encrypts           |
| DPoP key life                           | Immortal for session; caller persists  | Immortal for session; library persists    | Immortal for session; library persists in `ClientSessionData.DPoPKey` |
| `DPoPNonce` persistence                 | Caller-managed                         | In-memory per session                      | Persisted in `ClientSessionData.DPoPNonce`   |

**Practical bug one**: **Rust and Go leave the refresh lock entirely to the caller.** TS accepts a `NodeRequestLock` at client-construction time and invokes it around every refresh — zero-thought correctness as long as you wire one. Rust and Go will happily send two concurrent refresh calls for the same DID; whichever writes to storage last has the winning refresh token, the loser's refresh token is dead. See each language's `sessions.md` §refresh race.

**Practical bug two**: **Go's `ClientAuthStore` conflates state and session storage** — same interface, six methods. TS cleanly separates them, which makes it easier to put state in Redis (TTL) and sessions in Postgres (long-lived). In Go you either implement both against the same backend or compose two stores into one impl.

**Practical bug three**: **Rust has no session interface at all.** The `OAuthRequestStorage` trait covers only pre-flow state. Post-flow session storage is entirely application-code; this is deliberate (your session is your concern) but it means no two Rust codebases structure sessions the same way.

---

## §client-metadata vs §scopes interplay

The scope declared in `clientMetadata.scope` is the **upper bound**. The per-flow `scope` parameter in `authorize` / `StartAuthFlow` / `oauth_init` selects a subset.

- Rust: caller writes both. No validation that per-flow is a subset of metadata.
- TS: library enforces the subset check at `authorize`.
- Go: `NewPublicConfig(..., scopes)` sets metadata scope; `StartAuthFlow` uses metadata scope directly — **no per-flow override**. To request a different scope, build a different `ClientApp`.

**Practical bug**: Go's immutable per-`ClientApp` scope means permission-set UIs (ask the user which scopes to grant) are awkward. Either stand up a `ClientApp` per scope combination, or patch the scope into the PAR request manually. TS and Rust are more flexible here.

---

## Porting checklist

Moving code from **TypeScript → Rust**:
- Wire a `handleResolver` equivalent using `atproto-identity`; library won't resolve for you.
- Bring your own refresh lock; `NodeRequestLock` has no direct analogue.
- Define your session row type; no built-in `SessionStore`.
- Strip private components from keys before `jwk::generate` (easy miss).
- `htu` normalization: strip query + fragment before `auth_dpop`.

Moving code from **TypeScript → Go**:
- Same BFF assumptions transfer; no SPA support in Go.
- Implement `ClientAuthStore` against your DB; no split between state and session interfaces.
- Wrap `ResumeSession` in a per-DID mutex / advisory lock; library doesn't do it.
- Scope is fixed per `ClientApp`; stand up more than one if you need variable scopes.

Moving code from **Rust → TypeScript**:
- Delete your ad-hoc session type and use `SessionStore`.
- Remove your DID/AS resolution — inject `handleResolver`.
- Remove your refresh-lock code — wire `requestLock` and let the library invoke it.
- Key alg is practically pinned to ES256 via `JoseKey` — check your deploy isn't relying on ES384/ES256K.

Moving code from **Go → Rust**:
- Unpack `ClientApp` into the three function calls (`oauth_init` / `oauth_complete` / `oauth_refresh`).
- Bring your own identity resolver — `atproto-identity` crate.
- Support multiple alg values if your deploy uses anything besides ES256.
- Bring your own `validate_dpop_jwt` consumer if your server verifies proofs; Rust has the full validator.

---

## See also

- `spec.md` — normative rules for all entities and flows.
- `flows.md` — byte-level wire content.
- `dpop.md` — RFC 9449 profile.
- `sessions.md` — language-neutral session rules.
- `security-requirements.md` — cookie/key/token hardening checklist.
- `test-vectors.md` — shared test vectors for interop verification.
- `rust/README.md`, `typescript/README.md`, `go/README.md` — per-language entry points.

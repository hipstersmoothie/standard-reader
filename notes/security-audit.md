# Adversarial Security Audit: Standard Reader

**Date:** 2026-07-01

**Scope:** Full codebase at `/Users/andrew/Documents/standard-reader` — a TanStack Start + AT Protocol reading application with a firehose ingest tap, OAuth (ATProto) auth, a Neon Postgres read-model, an XRPC API layer, and a browser extension.

**Method:** Four parallel auditors mapped trust boundaries (server fns/auth/IDOR, injection/SSRF, secrets/config/deps, ingest/business-logic/concurrency). Every Critical and High finding was verified against the actual source before inclusion below.

---

## Table of Contents

- [Critical Findings](#critical-findings)
  - [C1. Unauthenticated SSRF via crafted JWT `iss` in XRPC auth](#c1-unauthenticated-ssrf-via-crafted-jwt-iss-in-xrpc-auth)
  - [C2. Unauthenticated SSRF via decoded (unverified) access token `iss`](#c2-unauthenticated-ssrf-via-decoded-unverified-access-token-iss)
  - [C3. SSRF via attacker-controlled labeler `serviceEndpoint` (automated, recurring)](#c3-ssrf-via-attacker-controlled-labeler-serviceendpoint-automated-recurring)
- [High Findings](#high-findings)
  - [H2. SSRF via `did:web` identity resolution](#h2-ssrf-via-didweb-identity-resolution)
  - [H3. SSRF via extension resolve endpoint](#h3-ssrf-via-extension-resolve-endpoint)
  - [H4. Ingest webhook auth fails OPEN when secret is unset](#h4-ingest-webhook-auth-fails-open-when-secret-is-unset)
- [Medium Findings](#medium-findings)
- [Low Findings](#low-findings)
- [Areas Checked — Found Safe](#areas-checked--found-safe)
- [Summary: The 5 Issues That Matter Most](#summary-the-5-issues-that-matter-most)
- [Systemic Patterns](#systemic-patterns)

---

## Critical Findings

### C1. Unauthenticated SSRF via crafted JWT `iss` in XRPC auth

**Severity:** Critical — unauthenticated; attacker fully controls the target URL; reaches cloud metadata endpoints and internal services.

**Location:** `src/server/xrpc/auth.ts:36-73` (`getSigningKey`), called from `verifyJwt` at line 79.

`verifyJwt` (from `@atproto/xrpc-server`) calls `getSigningKey(payload.iss, …)` **before** verifying the JWT signature. The `iss` comes from the unverified JWT payload. For `did:web`, the host is extracted and fetched with no validation:

```typescript
// auth.ts:45-47
} else if (did.startsWith("did:web:")) {
  const host = did.slice("did:web:".length).replaceAll(":", ".");
  docUrl = `https://${host}/.well-known/did.json`;
}
// auth.ts:53-55
const response = await fetch(docUrl, { signal: AbortSignal.timeout(8000) });
```

The only pre-checks (`exp`, `aud`, `lxm`, `isDidStringOrService`) are format/public-value checks trivially satisfied by an unsigned JWT.

**Attack scenario:**

1. Attacker sends `GET /xrpc/app.standard-reader.getPublication` with `Authorization: Bearer <unsigned-jwt>` where payload is `{"iss":"did:web:169.254.169.254","aud":"<public appview audience>","lxm":"app.standard-reader.getPublication","exp":9999999999}`.
2. `verifyServiceJwt` → `verifyJwt` → `getSigningKey("did:web:169.254.169.254", false)`.
3. Server fetches `https://169.254.169.254/.well-known/did.json` — AWS/GCP cloud metadata or any internal HTTPS service.
4. Response body (or error/timing) leaks internal network topology. On AWS, this can reach IMDSv1 endpoints.

**Fix:** Validate the DID host before fetching — reject IP literals, loopback, link-local (`169.254.0.0/16`), RFC1918 ranges, `*.internal`, `*.local`. Apply in `getSigningKey`. Better: route all DID resolution through the app's existing `resolveIdentity()` (`src/server/atproto/identity.ts`) which already handles PLC + did:web, rather than raw `fetch()` here.

---

### C2. Unauthenticated SSRF via decoded (unverified) access token `iss`

**Severity:** Critical — second independent unauthenticated SSRF vector; even more flexible (allows `http://` and arbitrary ports).

**Location:** `src/server/xrpc/auth.ts:89-101` (`resolvePdsFromAccessToken`), reached from `verifyAccessToken` at line 115-123.

`decodeJwt` from `jose` does **not** verify the signature — it base64-decodes the payload. The `iss` is fully attacker-controlled, and if it starts with `"http"` it's used directly as the PDS URL:

```typescript
// auth.ts:91-95
const payload = decodeJwt(token); // no signature verification
const iss = payload.iss;
if (typeof iss === "string" && iss.startsWith("http")) {
  return iss.replace(/\/+$/, "");
}
```

Then at line 116-123 the server fetches `${iss}/xrpc/com.atproto.server.getSession` with the attacker's token as `Authorization: Bearer <token>`.

This path is reached when `verifyServiceJwt` fails (always, for a crafted token) and scheme is `bearer` — `authenticateRequest` falls through at lines 159-168.

**Attack scenario:**

1. Attacker sends `GET /xrpc/app.standard-reader.getPublication` with `Authorization: Bearer <crafted-jwt>` where `iss: "http://internal-service.railway.internal:8080"`.
2. `verifyServiceJwt` fails (iss isn't a DID), caught at line 162.
3. Falls through to `verifyAccessToken` → `resolvePdsFromAccessToken`.
4. `iss` starts with `"http"` → PDS URL = `http://internal-service.railway.internal:8080`.
5. Server fetches `http://internal-service.railway.internal:8080/xrpc/com.atproto.server.getSession` — probing internal Railway services over HTTP, with the attacker's token forwarded as a Bearer header.

**Fix:** Never trust an unverified JWT claim as a URL. Resolve the PDS exclusively from `payload.sub` (a DID) via `resolveIdentity()`, which goes through proper PLC/did:web resolution. Remove the `iss.startsWith("http")` branch entirely. Additionally apply the same internal-IP blocklist as C1.

---

### C3. SSRF via attacker-controlled labeler `serviceEndpoint` (automated, recurring)

**Severity:** Critical — attacker fully controls the URL; triggered automatically every 2 minutes by the sync worker with no user interaction after initial registration.

**Location:**

- `src/server/ingest/handlers.ts:578` — stores `record.serviceEndpoint` verbatim (only checks `typeof === "string"`)
- `src/server/labeler/resolve.server.ts:56-61` — `resolveLabelerEndpoint()` returns the stored URL
- `src/server/labeler/labels.server.ts:229-247` — `queryLabeler()` fetches `${base}/xrpc/com.atproto.label.queryLabels`
- `src/server/labeler/sync.server.ts` — `syncAllLabels()` iterates all registered labelers every `SYNC_INTERVAL_MS = 2 * 60_000`

Verified full chain: the ingest handler stores `record.serviceEndpoint` with zero URL validation (`handlers.ts:578`), `resolveLabelerEndpoint` returns it (`resolve.server.ts:60`), and `queryLabeler` does `fetchWithTimeout(url.toString())` (`labels.server.ts:240`).

**Attack scenario:**

1. Attacker publishes an `app.standard-reader.labeler.service` record with `serviceEndpoint: "http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token"`.
2. Ingest tap stores it in `labeler_services.serviceEndpoint`.
3. Every 2 minutes, `syncAllLabels()` → `fetchAllLabelsFromLabeler(did)` → `queryLabeler(did, ["*"])` → `fetchWithTimeout("http://169.254.169.254/.../token/xrpc/com.atproto.label.queryLabels")`.
4. The server fetches the cloud metadata endpoint. The response body is parsed as JSON and any `labels` array is inserted into the DB — crafted responses inject arbitrary label data affecting other users' views.

**Fix:** Validate `serviceEndpoint` in `upsertLabelerService()` before storing — require `https://`, reject private/loopback/link-local IPs. Apply the same validation again in `queryLabeler()` before fetching (defense-in-depth). Consider an allowlist of approved labeler endpoints or manual approval before entering the sync rotation.

---

## High Findings

### H2. SSRF via `did:web` identity resolution

**Severity:** High — unauthenticated; attacker controls the hostname; reachable from firehose ingest, XRPC auth, and OG profile routes.

**Location:**

- `src/server/atproto/identity.ts:81-83` — `fetchDidDoc()` for `did:web`:
  ```typescript
  const host = did.slice("did:web:".length).replaceAll(":", "/");
  url = `https://${host}/.well-known/did.json`;
  ```
- `src/server/xrpc/auth.ts:45-47` — `getSigningKey()` for `did:web` (same pattern, covered in C1)

**Attack scenario:**

1. Attacker creates a `did:web:169.254.169.254` or `did:web:localhost` DID.
2. The server fetches `https://169.254.169.254/.well-known/did.json` — probing cloud metadata or internal services.
3. Reachable whenever `resolveIdentity(did)` or `getSigningKey(iss)` is called with an attacker-controlled DID (firehose events referencing the DID, XRPC auth, OG profile route).

**Fix:** Validate the `did:web` host before fetching — reject IP literals, localhost, private ranges. Apply in both `identity.ts:fetchDidDoc()` and `xrpc/auth.ts:getSigningKey()`.

---

### H3. SSRF via extension resolve endpoint

**Severity:** High — authenticated (extension session), but attacker fully controls the URL with no internal-IP filtering.

**Location:**

- `src/routes/api/extension/resolve.tsx:14-57` — endpoint handler
- `src/server/extension/resolve-page-url.server.ts:496-528` — `fetchDiscoveryHintsFromPageUrl(url)` fetches the URL server-side
- `src/server/extension/resolve-page-url.server.ts:615-622` — `resolvePageUrl()` calls `fetchDiscoveryHintsFromPageUrl(trimmed)` when canonical URL lookup misses

The only validation is `parsed.protocol !== "http:" && parsed.protocol !== "https:"` — `http://169.254.169.254` passes.

**Attack scenario:**

1. Attacker (with extension session) sends `GET /api/extension/resolve?url=http://169.254.169.254/computeMetadata/v1/`.
2. `resolvePageUrl()` tries canonical URL lookup (misses), then calls `fetchDiscoveryHintsFromPageUrl("http://169.254.169.254/...")`.
3. Server fetches the URL and parses up to `PAGE_FETCH_MAX_BYTES` of HTML response — internal service responses are fetched and partially parsed.

**Fix:** Add an SSRF guard rejecting URLs resolving to private IP ranges (RFC 1918, link-local `169.254.0.0/16`, loopback `127.0.0.0/8`). Consider restricting fetches to URLs matching publication URLs already in the DB.

---

### H4. Ingest webhook auth fails OPEN when secret is unset

**Severity:** High — a missing env var silently disables all ingest authentication, enabling unauthenticated DB-mirror writes and PDS fetch triggers.

**Location:** `src/server/ingest/auth.ts:19-23`

```typescript
export function verifyIngestAuth(request: Request): boolean {
  const secret = ingestConfig.webhookSecret;
  if (!secret) {
    return true;   // ← any caller is allowed
  }
```

`webhookSecret` resolves to `INGEST_WEBHOOK_SECRET ?? TAP_ADMIN_PASSWORD ?? null`. If neither env var is set, the gate is fully open. The ingest server (`src/server/ingest/service.ts`) is a standalone HTTP server on the `ingest` Railway service.

**Attack scenario:**

1. `INGEST_WEBHOOK_SECRET` and `TAP_ADMIN_PASSWORD` are both unset (misconfiguration, new deploy, env var dropped during migration).
2. Attacker who can reach the ingest port sends `POST /api/ingest/reconcile-repo` with body `{"did":"did:plc:target"}` — triggers `reconcileRepoFromPds()` (outbound PDS fetch the attacker controls + DB upserts into the read model).
3. Attacker sends `POST /api/ingest/recompute` to trigger expensive derived-table recompute (resource exhaustion).

**Fix:** Fail closed. When no secret is configured in production, reject all requests:

```typescript
if (!secret) {
  if (process.env.NODE_ENV === "production") return false;
  return true; // dev-only convenience
}
```

At minimum, log a loud warning when the ingest server starts with no secret in production.

---

## Medium Findings

### M1. Unauthenticated write to global `quote_shares` table (no auth, no owner, no rate limit)

**Severity:** Medium — confirmed: `createQuoteShare` is a POST server fn with no middleware and `upsertQuoteShare` writes to a global table with no `ownerDid` column.

**Location:** `src/integrations/tanstack-query/api-quote-share.functions.ts:13-15`, `src/server/reader/quote-shares.ts:16-50`

**Attack scenario:** An attacker POSTs `{"documentUri":"at://any","quote":"spam"}` repeatedly. Varying either field creates new rows (ID is a hash of the pair, so same pair is idempotent). This pollutes the quote-share data shown in document comments (`listQuoteSharesForDocument` returns up to 50 per document) and grows the table unbounded.

**Fix:** Add `requireAuthMiddleware` to `createQuoteShare`. Add a per-reader/per-document rate limit. Consider scoping quote shares to an owner DID like every other reader record.

---

### M2. No lexicon validation of firehose records before DB upsert

**Severity:** Medium — records from arbitrary repos flow into unbounded Postgres columns with only `typeof` checks on 1-2 fields.

**Location:** `src/server/ingest/consumer.ts:68-195`, `src/server/ingest/handlers.ts:194-269`

Records are cast with `as unknown as` and fields like `content` (stored via `sanitizeJson` — only strips NUL bytes, no size limit), `tags` (no array length cap), `contributors` (no cap, each spawning DB writes) are trusted. The DB columns (`textContent: text`, `contentJson: jsonb`) are unbounded.

**Attack scenario:** A malicious repo publishes a `site.standard.document` with a 100MB `content` blob or a `tags` array with 100,000 entries. The ingest tap stores it, consuming DB storage and memory.

**Fix:** Add a max byte size check on the serialized record before processing (e.g., reject > 1MB). Add array length caps (`.slice(0, 50)`). Add field-level length truncation for text fields. Consider `assertValidRecord` for app-owned lexicons.

---

### M3. Backfill/reconcile loops are unbounded

**Severity:** Medium — `listRecordsFromHost` explicitly supports unbounded enumeration; `reconcileTrackedWithBackfill` iterates all reader repos.

**Location:** `src/server/atproto/fetch-record.ts:191-238` (`limit` omitted by backfill callers), `src/server/ingest/repo-sync.ts:199-275`, `src/server/ingest/service.ts:93-145`

A malicious PDS returning millions of records causes millions of DB upserts + `ensureTracked` calls in a single invocation.

**Fix:** Add a `MAX_BACKFILL_RECORDS` cap (e.g., 1000). Cap the number of repos processed per `reconcileTrackedWithBackfill` run (e.g., `LIMIT 50`). Log when caps are hit.

---

### M4. DB SSL certificate validation disabled

**Severity:** Medium — encrypted but unauthenticated connection to Neon; MITM can intercept/modify queries including session tokens.

**Location:** `src/db/index.ts:46`

```typescript
ssl: isLocal ? undefined : { rejectUnauthorized: false },
```

The comment says this matches the connection string, but Neon provides verified certificates — `rejectUnauthorized: false` is unnecessary and disables certificate validation.

**Fix:** Use `sslmode=verify-full` in the connection string or set `ssl: { rejectUnauthorized: true }` (the default). Provide the Neon CA if needed.

---

### M5. App-password auth backdoor enabled by a single env var

**Severity:** Medium — a single env var misconfiguration enables an alternate, weaker auth path that bypasses OAuth entirely.

**Location:** `src/integrations/auth/app-password-session.server.ts:24-26`, `src/integrations/auth/restore-client.server.ts:78-84`

When `PERF_TEST_APP_PASSWORD` is set, `bootstrapAppPasswordSession()` accepts a Bluesky handle + app password to mint a full app session token — bypassing OAuth PKCE/DPoP/PAR. The env var is documented as "never set in production" but nothing enforces that.

**Fix:** Hard-gate on `NODE_ENV !== "production"`:

```typescript
export function isAppPasswordAuthEnabled(): boolean {
  return (
    process.env.NODE_ENV !== "production" &&
    Boolean(process.env.PERF_TEST_APP_PASSWORD?.trim())
  );
}
```

---

### M6. No Content-Security-Policy header on the web app

**Severity:** Medium — the app renders untrusted AT Protocol record content (markdown + raw HTML via `rehype-raw` + `rehype-sanitize`). If a sanitization bypass exists, there's no CSP to prevent script execution.

**Location:** No CSP header anywhere — not in `__root.tsx`, `vite.config.ts`, or any middleware.

**Fix:** Add a restrictive CSP header via a TanStack Start middleware:

```
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.bsky.network https://plc.directory; frame-ancestors 'none';
```

---

### M7. XRPC error responses leak internal error messages

**Severity:** Medium — unhandled errors in XRPC handlers return raw `error.message` to unauthenticated callers.

**Location:** `src/server/xrpc/errors.ts:38-45`

```typescript
if (cause instanceof Error) {
  return xrpcErrorResponse(new InvalidRequestError(cause.message));
}
```

DB errors (`ECONNREFUSED`, schema/table names), library internal errors, etc. are exposed in the JSON response body.

**Fix:** Return a generic message for non-`XRPCError` exceptions and log the real error server-side:

```typescript
if (cause instanceof Error) {
  console.error("[xrpc] unhandled error", cause);
  return xrpcErrorResponse(new InvalidRequestError("Internal error"));
}
```

---

### M8. Session cache allows revoked sessions for up to 30 seconds

**Severity:** Medium — logout doesn't invalidate the module-level cache; a compromised session remains valid for up to 30s after logout.

**Location:** `src/middleware/auth-session.server.ts:50-57, 234-277`

Three module-level `Map`s (`sessionTokenCache`, `didTokenCache`, `readerContextCache`) with a 30s TTL. There's no cache invalidation hook on logout. The comment claims "a logout creates a new token" but logout should invalidate the old one immediately.

**Fix:** Add an `invalidateSessionCache(token)` function that deletes the token from all three caches, and call it during logout. Alternatively reduce the TTL to ~5s.

---

### M9. OAuth state store TOCTOU — non-atomic read-then-delete allows state replay

**Severity:** Medium — concurrent requests with the same `stateId` can both read the entry before the delete executes.

**Location:** `src/integrations/auth/atproto.ts:58-94` (`getStoreValue` with `consume: true`)

The read (`findFirst`) and delete are separate queries. Between them, a concurrent request can also read the valid state.

**Fix:** Use an atomic delete-and-return:

```typescript
const [deleted] = await db
  .delete(schema.verification)
  .where(eq(schema.verification.identifier, identifier))
  .returning({
    value: schema.verification.value,
    expiresAt: schema.verification.expiresAt,
  });
```

---

### M10. `markDocumentsRead` loops sequentially with no cap — PDS round-trip amplification

**Severity:** Medium — up to 500 sequential PDS round trips per call.

**Location:** `src/server/reader/mark-documents-read.ts:32-34`, `src/server/reader/queries.ts:270` (default `limit = 500`)

Each call to `putReadRecord` is a separate PDS HTTP round trip. A user clicking "Mark all as read" can trigger 500 sequential writes taking 50-250 seconds.

**Fix:** Use `repoApplyWrites` (batch write — the codebase already has this primitive at `repo-records.ts:154-187`). Reduce the default limit and the `documentsInput` cap (currently `.max(500)`).

---

### M11. No rate limits on OG image generation, search, or shiki highlighting

**Severity:** Medium — unauthenticated OG image rendering is CPU-intensive; search has no per-IP rate limit.

**Location:** `src/routes/api/og/article.tsx:45-102` (unauthenticated, DB query + Satori + Resvg PNG render), `src/integrations/tanstack-query/api-search.functions.ts:94-104`

**Fix:** Add a simple in-memory token-bucket rate limiter per IP for OG image and search endpoints. Consider pre-generating OG images at ingest time.

---

### M12. `runApiDocsExample` exposes an unauthenticated XRPC-execution surface

**Severity:** Low-Medium — a POST server fn with no auth middleware that dispatches XRPC calls server-side.

**Location:** `src/integrations/tanstack-query/api-docs.functions.ts:19-27`, `src/server/api-docs/run-example.server.ts:188-257`

Accepts an `nsid` and arbitrary `params`/`body`. When `useSessionAuth` is false (default), it fetches `${getPublicUrl()}/xrpc/${nsid}` with attacker-supplied params — a secondary entry point for the C1/C2 SSRF.

**Fix:** Gate behind `requireAuthMiddleware`, or restrict to `NODE_ENV !== "production"`.

---

## Low Findings

### L1. SSRF via `resolveActorDid` handle resolution

**Severity:** Low — authenticated but the SSRF request is made before the response is validated.

**Location:** `src/server/labeler/resolve.server.ts:80-96`

Fetches `https://${actor}/.well-known/atproto-did` with no host validation — `actor: "169.254.169.254"` triggers SSRF.

**Fix:** Validate the `actor` hostname before fetching — reject IP literals, localhost, private ranges. Or resolve handles via the AppView's `com.atproto.identity.resolveHandle` XRPC.

---

### L2. SSRF via unvalidated avatar URL from Bluesky public API

**Severity:** Low — requires the Bluesky public API to return a malicious URL (trusted source).

**Location:** `src/lib/bluesky-public-profile.ts:19-22`, `src/routes/api/og/profile.tsx:96`

`avatarUrl` from public API fetched server-side for OG image with no scheme/host validation.

**Fix:** Validate that `avatarUrl` starts with `https://` and is on a known-safe host (`cdn.bsky.app`) before using it in `loadOgImage`.

---

### L3. LIKE wildcard injection in search

**Severity:** Low — affects search result relevance, not data access. Not SQL injection (Drizzle parameterizes).

**Location:** `src/integrations/tanstack-query/api-search.functions.ts:419-436`

User search for `%` or `_` matches unintended rows.

**Fix:** Escape LIKE wildcards in user input:

```typescript
function escapeLikePattern(value: string): string {
  return value
    .replaceAll("\\", "\\\\")
    .replaceAll("%", "\\%")
    .replaceAll("_", "\\_");
}
```

---

### L4. CSS injection via collection theme colors

**Severity:** Low — mitigated by `colorjs.io` parsing (invalid colors throw → null), but `declarations()` doesn't escape values.

**Location:** `src/lib/collections/radix-theme.ts:92-107`

**Fix (defense-in-depth):** Escape `;`, `{`, `}` in `declarations()` values.

---

### L5. `recordClientEvent` accepts arbitrary log attributes with no auth

**Severity:** Low — no auth, no cap on attribute count/value length.

**Location:** `src/integrations/tanstack-query/api-telemetry.functions.ts:17-22`

**Fix:** Add `maybeAuthMiddleware`, cap attribute count and value lengths, consider rate-limiting per-IP/per-session.

---

### L6. API extension routes have no request body size cap

**Severity:** Low — `request.json()` with no `Content-Length` check.

**Location:** `src/routes/api/extension/bookmark.tsx:17-21`, `resolve.tsx:30-37`

**Fix:** Add a `Content-Length` check before parsing (reject bodies > 10KB). Cap the batch URL array length (`.slice(0, 20)`).

---

### L7. Extension requests `<all_urls>` + `cookies` permissions

**Severity:** Low (extension, not server) — broad permissions give access to cookies/content on every website.

**Location:** `extension/src/lib/manifest-hosts.ts:2-6`, `extension/wxt.config.ts:109-119`

**Fix:** Replace `<all_urls>` with `activeTab`. Scope `cookies` permission to `standard-reader.app` only.

---

### L8. `nitro` pinned to a beta version

**Severity:** Low — production server runtime on a beta tag; no stability/security guarantees.

**Location:** `package.json:97`

**Fix:** Track a stable release of `nitro` / `nitropack`.

---

### L9. React canary builds in production

**Severity:** Low — canary builds lack release guarantees.

**Location:** `package.json:99,102`

**Fix:** When React 19.3 reaches stable, pin to the stable release.

---

### L10. OAuth callback logs full error objects to stdout

**Severity:** Low — server-log only, not exposed to clients.

**Location:** `src/routes/api/auth/atproto/callback.tsx:63,170`

**Fix:** Log `error.message` and `error.name` instead of the full object. Gate stack traces on `NODE_ENV !== "production"`.

---

### L11. Amplification via `ensureTracked`

**Severity:** Low — a record referencing many DIDs triggers many DB writes + HTTP calls.

**Location:** `src/server/ingest/handlers.ts:268,444,494`

**Fix:** Cap array lengths (e.g., `.slice(0, 50)`). Batch `ensureTracked` calls. Consider deferring to a background queue.

---

### L12. Collection rkey not validated

**Severity:** Low — safe (writes to own repo) but rkey format not validated.

**Location:** `src/integrations/tanstack-query/api-collections.functions.ts:1167`

**Fix:** Validate `data.rkey` matches TID format or contains no path separators.

---

## Areas Checked — Found Safe

| Area                                       | Status           | Notes                                                                                                                                                    |
| ------------------------------------------ | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQL injection**                          | ✅ Safe          | All SQL uses Drizzle's parameterized query builder. No raw string concatenation.                                                                         |
| **Command injection**                      | ✅ Safe          | No `child_process`/`exec`/`spawn` usage anywhere in `src/`.                                                                                              |
| **Path traversal**                         | ✅ Safe          | No `fs.readFile`/`path.join` with user input. Only repo-owned lexicon files read.                                                                        |
| **Header injection / response splitting**  | ✅ Safe          | OAuth callback uses `sanitizeAuthRedirectTarget()` enforcing same-origin + blocking `/_serverFn`, `/api/`, `/login`. `Location` built from `URL` object. |
| **Log injection**                          | ✅ Safe          | `logEvent()` uses `JSON.stringify()` which escapes newlines.                                                                                             |
| **Template/HTML injection (Shiki, KaTeX)** | ✅ Safe          | Shiki escapes HTML entities; KaTeX escapes by default.                                                                                                   |
| **Search headline sanitization**           | ✅ Safe          | `sanitizeTsHeadlineHtml` escapes all HTML first, then restores only `<mark>`.                                                                            |
| **Deserialization**                        | ✅ Safe          | All `JSON.parse` on untrusted data wrapped in try/catch with shape validation.                                                                           |
| **Write IDOR (PDS mutations)**             | ✅ Safe          | All `putRecord`/`deleteRecord`/`applyWrites` calls use `session.did`/`auth.did` as repo — never client-supplied.                                         |
| **Logout / session revocation**            | ✅ Safe          | `signOut` deletes only the cookie's own session row + revokes that DID's PDS session.                                                                    |
| **`isAdmin` flag**                         | ✅ Safe (benign) | Present on `user` table but no code path checks it — no broken privilege checks.                                                                         |
| **Subscribe flow**                         | ✅ Safe          | Auth-gated, writes to own repo, no force-subscribe.                                                                                                      |
| **Ingest upsert concurrency**              | ✅ Safe          | `onConflictDoUpdate` is atomic at Postgres level; dedup is intentionally eventual-consistent.                                                            |

---

## Summary: The 5 Issues That Matter Most

If you can only fix a handful today, prioritize these:

1. **C1 + C2 (SSRF via XRPC auth)** — `src/server/xrpc/auth.ts`. Two independent unauthenticated SSRF vectors through the public XRPC endpoint. Fix: validate/resolve DIDs before fetching, never trust unverified JWT claims as URLs. This is the highest-impact fix.

2. **C3 (SSRF via labeler `serviceEndpoint`)** — automated, recurring every 2 minutes, attacker-controlled URL stored from firehose. Fix: validate `serviceEndpoint` URL scheme + reject private IPs in `upsertLabelerService` and `queryLabeler`.

3. **H4 (Ingest fail-open)** — a missing env var silently disables all ingest auth. Fix: fail closed in production.

4. **M1 (`createQuoteShare` no auth)** — the only write server fn with zero auth, writing to a global unbounded table. Fix: add `requireAuthMiddleware`.

5. **H2 + H3 (SSRF via `did:web` / extension resolve)** — attacker-controlled hostnames/DIDs cause server-side fetches to internal services. Fix: validate hosts before fetching; covered by the systemic `assertSafeFetchUrl()` utility.

---

## Systemic Patterns

### 1. No SSRF protection anywhere

The dominant systemic issue. The codebase makes dozens of server-side `fetch()` calls to URLs from DID documents, AT Protocol records, and user input — none validate against internal IP ranges. A single `assertSafeFetchUrl()` utility applied at every outbound fetch from untrusted sources would close C1, C2, C3, H2, H3, and L1–L2 at once. Key files:

- `src/server/atproto/identity.ts` (`pdsFromDoc`, `fetchDidDoc`)
- `src/server/atproto/fetch-record.ts` (`getRecordFromBase`, `listRecordsFromHost`)
- `src/server/atproto/blob.ts` (`getBlobUrl` — validate `pds`)
- `src/server/content/resolve.ts` (`fetchTextBlob`)
- `src/server/markpub/resolve.ts`, `leaflet/resolve.ts`, `pckt/resolve.ts` (`fetchJsonBlob`/`fetchTextBlob`)
- `src/server/ingest/handlers.ts` (`upsertLabelerService` — validate `serviceEndpoint`)
- `src/server/labeler/labels.server.ts` (`queryLabeler`)
- `src/server/labeler/resolve.server.ts` (`resolveActorDid`)
- `src/server/xrpc/auth.ts` (`resolvePdsFromAccessToken`, `getSigningKey`)
- `src/server/extension/resolve-page-url.server.ts` (`fetchDiscoveryHintsFromPageUrl`)
- `src/server/og/load-image.ts` (`fetchSatoriImage`)

### 2. Trust-boundary split between TanStack server fns and the XRPC layer (intentional)

The server-fn layer uses `getReaderDidForRequest` (no `did` param) for reads and `session.did` for writes — serving the authenticated user's own data. The XRPC layer uses `allowDidParam` / `optional-did` to expose reader data (bookmarks, reading history, likes) by DID. This is intentional: in AT Protocol these records live in the reader's public repo and are queryable via `com.atproto.repo.listRecords` or the firehose. The XRPC layer mirrors already-public repo data from the DB. No change needed.

### 3. Fail-open defaults on internal services

The ingest auth returns `true` when no secret is set (H4). The app-password backdoor is gated on a single env var with no environment check (M5). Every auth gate should fail closed by default, with an explicit dev-mode override.

### 4. Error messages propagate to clients unfiltered

XRPC dispatch (`errors.ts:42`) and the API docs server fn (`run-example.server.ts:241`) return raw `error.message` to callers. A consistent error-sanitization layer at the trust boundary (generic message to clients, full detail server-side) closes multiple leakage paths.

### 5. No security headers

No CSP, no `X-Content-Type-Options`, no `X-Frame-Options`/`frame-ancestors` on the web app. These are cheap defense-in-depth measures, especially given the app renders untrusted record HTML.

### 6. Unbounded loops driven by untrusted input

Backfill enumeration (M3), `markDocumentsRead` PDS round trips (M10), firehose record field sizes (M2), and `ensureTracked` amplification (L11) all lack caps. Internal loops need hard limits even when the API surface is capped.

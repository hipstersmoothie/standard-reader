# Security Audit — Remediation Todo

> Companion to [`security-audit.md`](./security-audit.md). Each item links back to its finding.
>
> checkboxes link to the section anchor in the audit doc.

---

## Critical

- [x] [C1 — SSRF via crafted JWT `iss` in XRPC auth](./security-audit.md#c1-unauthenticated-ssrf-via-crafted-jwt-iss-in-xrpc-auth)
  - **File:** `src/server/xrpc/auth.ts:36-73` (`getSigningKey`)
  - **Fix:** Validate DID host before fetching — reject IP literals, loopback, link-local (`169.254.0.0/16`), RFC1918, `*.internal`, `*.local`. Better: route through existing `resolveIdentity()` instead of raw `fetch()`.
  - **Done:** Added `assertSafeFetchUrl()` guard in `getSigningKey` for `did:web` URLs only (the attacker-controlled host). `did:plc` URLs use the server-configured `TAP_PLC_URL` — not an SSRF vector. Guard also applied in `fetchDidDoc` (`identity.ts`) for the same `did:web` path.

- [x] [C2 — SSRF via decoded (unverified) access token `iss`](./security-audit.md#c2-unauthenticated-ssrf-via-decoded-unverified-access-token-iss)
  - **File:** `src/server/xrpc/auth.ts:89-101` (`resolvePdsFromAccessToken`)
  - **Fix:** Remove the `iss.startsWith("http")` branch entirely. Resolve PDS exclusively from `payload.sub` (a DID) via `resolveIdentity()`. Apply internal-IP blocklist.
  - **Done:** Removed the `iss.startsWith("http")` branch entirely. PDS is now resolved exclusively from `payload.sub` (a DID) via `resolveIdentity()`. The `fetchDidDoc` SSRF guard covers the `did:web` path.

- [x] [C3 — SSRF via attacker-controlled labeler `serviceEndpoint` (automated)](./security-audit.md#c3-ssrf-via-attacker-controlled-labeler-serviceendpoint-automated-recurring)
  - **Files:** `src/server/ingest/handlers.ts:578` (store), `src/server/labeler/labels.server.ts:229-247` (fetch)
  - **Fix:** Validate `serviceEndpoint` in `upsertLabelerService()` — require `https://`, reject private/loopback/link-local IPs. Re-validate in `queryLabeler()` before fetching (defense-in-depth).
  - **Done:** Applied `assertSafeFetchUrl()` in `upsertLabelerService()` (`handlers.ts`) to reject unsafe `serviceEndpoint` values before storing — bad URLs are silently dropped (matching existing invalid-record handling). Re-validated in `queryLabeler()` (`labels.server.ts`) as defense-in-depth before fetching, returning `[]` on failure (matching existing fetch-error handling). Both use the existing `assertSafeFetchUrl()` guard from `src/server/security/ssrf-guard.ts`.

---

## High

- [x] [H2 — SSRF via `did:web` identity resolution](./security-audit.md#h2-ssrf-via-didweb-identity-resolution)
  - **Files:** `src/server/atproto/identity.ts:81-83` (`fetchDidDoc`), `src/server/xrpc/auth.ts:45-47` (`getSigningKey`)
  - **Fix:** Validate `did:web` host before fetching — reject IP literals, localhost, private ranges. Apply in both locations.
  - **Done:** Already fixed by the C1/C2 work. `assertSafeFetchUrl()` is applied in `fetchDidDoc()` (`identity.ts:88-92`) for the `did:web` path, and in `getSigningKey()` (`auth.ts:51-55`) for the `did:web` path (the audit notes this is “same pattern, covered in C1”). Both reject IP literals, localhost, private/loopback/link-local ranges, and internal hostname suffixes.

- [x] [H3 — SSRF via extension resolve endpoint](./security-audit.md#h3-ssrf-via-extension-resolve-endpoint)
  - **Files:** `src/routes/api/extension/resolve.tsx:14-57`, `src/server/extension/resolve-page-url.server.ts:496-528`
  - **Fix:** Add SSRF guard rejecting private IP ranges (RFC 1918, link-local, loopback) in `fetchDiscoveryHintsFromPageUrl`. Consider restricting to publication URLs already in DB.
  - **Done:** Applied `assertSafeFetchUrl(url, { requireHttps: false })` in `fetchDiscoveryHintsFromPageUrl()` (`resolve-page-url.server.ts`) after the existing protocol check. Uses `requireHttps: false` because this path legitimately fetches HTTP publication URLs; the guard blocks private/loopback/link-local IPs and internal hostnames. Unsafe URLs return empty hints (matching existing error handling).

- [ ] [H4 — Ingest webhook auth fails OPEN when secret unset](./security-audit.md#h4-ingest-webhook-auth-fails-open-when-secret-is-unset)
  - **File:** `src/server/ingest/auth.ts:19-23`
  - **Fix:** Fail closed in production: `if (!secret) { return process.env.NODE_ENV !== "production"; }`. Log loud warning on startup with no secret in prod.

---

## Medium

- [ ] [M1 — `createQuoteShare` unauthenticated write to global table](./security-audit.md#m1-unauthenticated-write-to-global-quote_shares-table-no-auth-no-owner-no-rate-limit)
  - **Files:** `src/integrations/tanstack-query/api-quote-share.functions.ts:13-15`, `src/server/reader/quote-shares.ts:16-50`
  - **Fix:** Add `requireAuthMiddleware`. Add per-reader/per-document rate limit. Consider scoping to owner DID.

- [ ] [M2 — No lexicon validation of firehose records before DB upsert](./security-audit.md#m2-no-lexicon-validation-of-firehose-records-before-db-upsert)
  - **Files:** `src/server/ingest/consumer.ts:68-195`, `src/server/ingest/handlers.ts:194-269`
  - **Fix:** Max byte size check on serialized record (reject > 1MB). Array length caps (`.slice(0, 50)`). Field-level length truncation. Consider `assertValidRecord` for app-owned lexicons.

- [ ] [M3 — Backfill/reconcile loops are unbounded](./security-audit.md#m3-backfillreconcile-loops-are-unbounded)
  - **Files:** `src/server/atproto/fetch-record.ts:191-238`, `src/server/ingest/repo-sync.ts:199-275`, `src/server/ingest/service.ts:93-145`
  - **Fix:** Add `MAX_BACKFILL_RECORDS` cap (e.g., 1000). Cap repos per `reconcileTrackedWithBackfill` run (`LIMIT 50`). Log when caps are hit.

- [ ] [M4 — DB SSL certificate validation disabled](./security-audit.md#m4-db-ssl-certificate-validation-disabled)
  - **File:** `src/db/index.ts:46`
  - **Fix:** Use `sslmode=verify-full` in connection string or set `ssl: { rejectUnauthorized: true }`.

- [ ] [M5 — App-password auth backdoor enabled by single env var](./security-audit.md#m5-app-password-auth-backdoor-enabled-by-a-single-env-var)
  - **Files:** `src/integrations/auth/app-password-session.server.ts:24-26`, `src/integrations/auth/restore-client.server.ts:78-84`
  - **Fix:** Hard-gate on `NODE_ENV !== "production"`. Remove dead "last resort" fallback at `restore-client.server.ts:91-98`.

- [ ] [M6 — No Content-Security-Policy header on web app](./security-audit.md#m6-no-content-security-policy-header-on-the-web-app)
  - **Files:** Missing from `__root.tsx`, `vite.config.ts`, all middleware.
  - **Fix:** Add restrictive CSP via TanStack Start middleware. Start with `default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.bsky.network https://plc.directory; frame-ancestors 'none'`.

- [ ] [M7 — XRPC error responses leak internal messages](./security-audit.md#m7-xrpc-error-responses-leak-internal-error-messages)
  - **File:** `src/server/xrpc/errors.ts:38-45`
  - **Fix:** Return generic `"Internal error"` for non-`XRPCError` exceptions. Log full error server-side with `console.error`.

- [ ] [M8 — Session cache allows revoked sessions for 30s](./security-audit.md#m8-session-cache-allows-revoked-sessions-for-up-to-30-seconds)
  - **File:** `src/middleware/auth-session.server.ts:50-57, 234-277`
  - **Fix:** Add `invalidateSessionCache(token)` deleting from all three `Map`s. Call during logout. Alternatively reduce TTL to ~5s.

- [ ] [M9 — OAuth state store TOCTOU (non-atomic read-then-delete)](./security-audit.md#m9-oauth-state-store-toctou--non-atomic-read-then-delete-allows-state-replay)
  - **File:** `src/integrations/auth/atproto.ts:58-94` (`getStoreValue` with `consume: true`)
  - **Fix:** Use atomic delete-and-return: `db.delete(...).where(...).returning({ value, expiresAt })`.

- [ ] [M10 — `markDocumentsRead` sequential PDS round-trip amplification](./security-audit.md#m10-markdocumentsread-loops-sequentially-with-no-cap--pds-round-trip-amplification)
  - **Files:** `src/server/reader/mark-documents-read.ts:32-34`, `src/server/reader/queries.ts:270`
  - **Fix:** Use `repoApplyWrites` (batch write, exists at `repo-records.ts:154-187`). Reduce default limit from 500 to 100. Reduce `documentsInput` cap from 500 to 100.

- [ ] [M11 — No rate limits on OG image generation, search, shiki](./security-audit.md#m11-no-rate-limits-on-og-image-generation-search-or-shiki-highlighting)
  - **Files:** `src/routes/api/og/article.tsx:45-102`, `src/integrations/tanstack-query/api-search.functions.ts:94-104`
  - **Fix:** Add in-memory token-bucket rate limiter per IP for OG image and search. Consider pre-generating OG images at ingest time.

- [ ] [M12 — `runApiDocsExample` unauthenticated XRPC-execution surface](./security-audit.md#m12-runapidocsexample-exposes-an-unauthenticated-xrpc-execution-surface)
  - **Files:** `src/integrations/tanstack-query/api-docs.functions.ts:19-27`, `src/server/api-docs/run-example.server.ts:188-257`
  - **Fix:** Gate behind `requireAuthMiddleware`, or restrict to `NODE_ENV !== "production"`.

---

## Low

- [ ] [L1 — SSRF via `resolveActorDid` handle resolution](./security-audit.md#l1-ssrf-via-resolveactordid-handle-resolution)
  - **File:** `src/server/labeler/resolve.server.ts:80-96`
  - **Fix:** Validate `actor` hostname before fetching — reject IP literals, localhost, private ranges. Or use `com.atproto.identity.resolveHandle` XRPC.

- [ ] [L2 — SSRF via unvalidated avatar URL from Bluesky API](./security-audit.md#l2-ssrf-via-unvalidated-avatar-url-from-bluesky-public-api)
  - **Files:** `src/lib/bluesky-public-profile.ts:19-22`, `src/routes/api/og/profile.tsx:96`
  - **Fix:** Validate `avatarUrl` starts with `https://` and is on `cdn.bsky.app` before `loadOgImage`.

- [ ] [L3 — LIKE wildcard injection in search](./security-audit.md#l3-like-wildcard-injection-in-search)
  - **File:** `src/integrations/tanstack-query/api-search.functions.ts:419-436`
  - **Fix:** Escape LIKE wildcards (`%`, `_`, `\`) in user input before building pattern.

- [ ] [L4 — CSS injection via collection theme colors](./security-audit.md#l4-css-injection-via-collection-theme-colors)
  - **File:** `src/lib/collections/radix-theme.ts:92-107`
  - **Fix (defense-in-depth):** Escape `;`, `{`, `}` in `declarations()` values.

- [ ] [L5 — `recordClientEvent` accepts arbitrary log attrs, no auth](./security-audit.md#l5-recordclientevent-accepts-arbitrary-log-attributes-with-no-auth)
  - **File:** `src/integrations/tanstack-query/api-telemetry.functions.ts:17-22`
  - **Fix:** Add `maybeAuthMiddleware`. Cap attribute count and value lengths. Consider rate-limiting.

- [ ] [L6 — Extension API routes have no body size cap](./security-audit.md#l6-api-extension-routes-have-no-request-body-size-cap)
  - **Files:** `src/routes/api/extension/bookmark.tsx:17-21`, `resolve.tsx:30-37`
  - **Fix:** Add `Content-Length` check (reject > 10KB). Cap batch URL array (`.slice(0, 20)`).

- [ ] [L7 — Extension requests `<all_urls>` + `cookies` permissions](./security-audit.md#l7-extension-requests-all_urls--cookies-permissions)
  - **Files:** `extension/src/lib/manifest-hosts.ts:2-6`, `extension/wxt.config.ts:109-119`
  - **Fix:** Replace `<all_urls>` with `activeTab`. Scope `cookies` to `standard-reader.app` only.

- [ ] [L8 — `nitro` pinned to beta version](./security-audit.md#l8-nitro-pinned-to-a-beta-version)
  - **File:** `package.json:97`
  - **Fix:** Track a stable release of `nitro` / `nitropack`.

- [ ] [L9 — React canary builds in production](./security-audit.md#l9-react-canary-builds-in-production)
  - **File:** `package.json:99,102`
  - **Fix:** Pin to stable React 19.3 when released.

- [ ] [L10 — OAuth callback logs full error objects to stdout](./security-audit.md#l10-oauth-callback-logs-full-error-objects-to-stdout)
  - **File:** `src/routes/api/auth/atproto/callback.tsx:63,170`
  - **Fix:** Log `error.message` + `error.name` only. Gate stack traces on `NODE_ENV !== "production"`.

- [ ] [L11 — Amplification via `ensureTracked`](./security-audit.md#l11-amplification-via-ensurentracked)
  - **File:** `src/server/ingest/handlers.ts:268,444,494`
  - **Fix:** Cap array lengths (`.slice(0, 50)`). Batch `ensureTracked` calls. Consider background queue.

- [ ] [L12 — Collection rkey not validated](./security-audit.md#l12-collection-rkey-not-validated)
  - **File:** `src/integrations/tanstack-query/api-collections.functions.ts:1167`
  - **Fix:** Validate `data.rkey` matches TID format or contains no path separators.

---

## Systemic / Cross-cutting

These are not single-fix items but patterns to address structurally. See [Systemic Patterns](./security-audit.md#systemic-patterns) in the audit doc.

- [~] **Create `assertSafeFetchUrl()` utility** — single internal-IP blocklist applied at every outbound `fetch()` from untrusted sources. Closes C1, C2, C3, H2, H3, L1, L2 at once.
  - **Done (partial):** Created `src/server/security/ssrf-guard.ts` with `assertSafeFetchUrl()`. Applied to C1 (`getSigningKey` did:web path), C2 (via `fetchDidDoc` did:web path), C3 (`upsertLabelerService` store + `queryLabeler` fetch), H2 (same did:web paths as C1/C2), and H3 (`fetchDiscoveryHintsFromPageUrl` with `requireHttps: false`). Still needs to be applied at L1, L2.
- [ ] **Audit all auth gates for fail-open defaults** — every gate should fail closed in production with explicit dev overrides.
- [ ] **Add error-sanitization layer at trust boundary** — generic messages to clients, full detail server-side only.
- [ ] **Add security headers middleware** — CSP, `X-Content-Type-Options`, `X-Frame-Options`/`frame-ancestors`.
- [ ] **Add hard caps to all internal loops** — backfill, `markDocumentsRead`, firehose fields, `ensureTracked`.

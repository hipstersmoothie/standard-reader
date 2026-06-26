# Cross-Language Divergence Matrix (Identity Resolution)

This file is language-neutral. It captures the real behavioural differences between the Rust, TypeScript, and Go implementations of AT Protocol identity resolution that any skill user porting code or operating cross-stack needs to know about.

Every per-language file (`rust/*.md`, `typescript/*.md`, `go/*.md`) links back here instead of restating the matrix.

## Library choice

| Ecosystem | Primary library | DNS transport | HTTP transport | Browser support | Cache |
| --- | --- | --- | --- | --- | --- |
| Rust | [`atproto-identity`](https://docs.rs/atproto-identity) 0.14 | [`hickory-resolver`](https://docs.rs/hickory-resolver) (feature-gated `hickory-dns`); callers can swap via `DnsResolver` trait | [`reqwest`](https://docs.rs/reqwest), 10 s timeout | No — server/CLI only | [`lru`](https://docs.rs/lru) via `storage_lru` module (feature `lru`) |
| TypeScript | [`@atproto/identity`](https://www.npmjs.com/package/@atproto/identity) 0.4 (Node only) + [`@atproto-labs/handle-resolver`](https://www.npmjs.com/package/@atproto-labs/handle-resolver) (isomorphic) + [`@atproto/syntax`](https://www.npmjs.com/package/@atproto/syntax) (pure validation) | `node:dns/promises` (Node) or DoH via `AtprotoDohHandleResolver` (browser) | `fetch`, default timeout 3 000 ms | Yes — via the `@atproto-labs/*` packages | `MemoryCache` class (stale 1 h / max 24 h) |
| Go | [`github.com/bluesky-social/indigo/atproto/identity`](https://pkg.go.dev/github.com/bluesky-social/indigo/atproto/identity) + [`…/atproto/syntax`](https://pkg.go.dev/github.com/bluesky-social/indigo/atproto/syntax) | stdlib `net.Resolver.LookupTXT` + optional authoritative-DNS fallback via `LookupNS` | `net/http`, 10 s default | No (server only) | `CacheDirectory` (hashicorp/golang-lru/v2) + optional `redisdir` subpackage |

## Operation-level divergence

| Operation | Rust | TypeScript | Go |
| --- | --- | --- | --- |
| Input normalization + classification | `resolve::parse_input(&str) -> Result<InputType, ResolveError>` — returns `Handle` / `Plc` / `Web` (**no `WebVH` variant**; webvh strings classify as `Web`) | No exported `parse_input`; use `@atproto/syntax` `ensureValidHandle` / `ensureValidDid` or `AtIdentifier`-style helpers, then dispatch manually | `syntax.ParseAtIdentifier(string) (AtIdentifier, error)` + `.IsDID()` / `.IsHandle()` then `AsHandle()` / `AsDID()` |
| Handle validation | `validation::is_valid_handle(&str) -> Option<String>` (returns normalized or `None`) | `ensureValidHandle(h: string): void` (throws `InvalidHandleError`) | `syntax.ParseHandle(string) (Handle, error)` + `.Normalize()` + `.AllowedTLD()` |
| DID validation | `validation::is_valid_did_method_plc(&str) -> bool`, `is_valid_did_method_web(&str, strict: bool) -> bool`, `is_valid_did_method_webvh(&str, strict: bool) -> bool` | `ensureValidDid(d: string): void` (throws); webvh not supported | `syntax.ParseDID(string) (DID, error)` + `.Method()` + `.Identifier()` |
| Handle → DID resolution | `resolve::resolve_handle(http, dns, handle).await` — **parallel via `tokio::join!`**, strict-agreement (raises `ConflictingDIDsFound` on disagreement) | `HandleResolver#resolve(h).Promise<string \| undefined>` — **race** (whichever transport resolves first wins; loser is aborted). `resolveDnsBackup` (alt nameservers) fires only if both primaries failed | `BaseDirectory.ResolveHandle(ctx, h) (syntax.DID, error)` — **sequential**: DNS first, then HTTPS on failure. **No parallelism.** Authoritative-DNS + fallback-nameservers tried on failure |
| DID doc fetch: plc | `plc::query(http, plc_hostname, did) -> Result<Document, PLCDIDError>` | `DidResolver#resolve(did)` via `DidPlcResolver` (sends `Accept: application/did+ld+json,application/json`, `redirect: 'error'`) | `BaseDirectory.ResolveDID(ctx, did) (*DIDDocument, error)` — uses `PLCURL` field + optional `PLCLimiter` rate limiter |
| DID doc fetch: web | `web::query(http, did) -> Result<Document, WebDIDError>` | `DidWebResolver` (rewrites `localhost` to `http://`) | `BaseDirectory.ResolveDID` routes `did:web:` to `https://<host>/.well-known/did.json` |
| DID doc fetch: webvh | **Not implemented.** Validator exists (`is_valid_did_method_webvh`) but no resolver; `parse_input` misclassifies webvh as `Web` so fetch will 404 | **Not supported** — `DidResolver` only registers `plc` + `web`; webvh throws `UnsupportedDidMethodError` | **Not supported** — `ResolveDID` errors with "DID method not supported" |
| End-to-end resolve (handle or DID → document) | `InnerIdentityResolver::resolve(subject).await -> Result<Document>` (trait `IdentityResolver`) | `IdResolver#handle.resolve(h)` + `IdResolver#did.resolve(did)` (caller chains; no single call) | `Directory.LookupHandle`, `Directory.LookupDID`, or `Directory.Lookup(AtIdentifier)` → `*Identity` |
| Bidirectional handle check | Caller-owned (the crate exposes `Document::handles()` to read the first `at://` entry but does not verify against input) | Caller-owned (pattern: `resolveAtprotoData(did).handle === inputHandle`) | **Built in** to `LookupHandle` and `LookupDID` — mismatch → `ErrHandleMismatch` (LookupHandle) or sets `Identity.Handle = syntax.HandleInvalid` (LookupDID, unless `SkipHandleVerification`) |
| Errors | Typed enums: `ResolveError`, `WebDIDError`, `PLCDIDError` (match exhaustively) | Error classes: `DidNotFoundError`, `PoorlyFormattedDidError`, `UnsupportedDidMethodError`, `PoorlyFormattedDidDocumentError`, `UnsupportedDidWebPathError`. Handle-not-found is **not** thrown — `HandleResolver.resolve` returns `undefined` | Sentinels: `ErrHandleNotFound`, `ErrHandleMismatch`, `ErrHandleReservedTLD`, `ErrHandleNotDeclared`, `ErrDIDNotFound`, `ErrDIDResolutionFailed`, `ErrKeyNotDeclared` — compare with `errors.Is` |
| Reserved-TLD list | `validation::RESERVED_TLDS = [".localhost", ".internal", ".arpa", ".local"]` (**4 entries — spec lists 9**) | `@atproto/syntax::DISALLOWED_TLDS` (closer to spec coverage; exact entries in the package source) | `syntax.Handle#AllowedTLD()` rejects: `local`, `arpa`, `invalid`, `localhost`, `internal`, `example`, `onion`, `alt` (**8 entries — spec lists 9, missing `.test`**) |
| DID document type | `model::Document { id, also_known_as, verification_method: Vec<VerificationMethod>, service: Vec<Service>, … }`; helpers `pds_endpoints()`, `handles()`, `did_keys()` | `DidDocument` (re-exported from `@atproto/common-web`); helpers `getKey`, `getPds`, `parseToAtprotoDocument`, `getDid`, `getHandle` | `DIDDocument`; helpers `Identity.PDSEndpoint()`, `Identity.PublicKey()`, `Identity.GetServiceEndpoint(id)`, `Identity.GetPublicKey(id)`, `Identity.DeclaredHandle()` |
| `alsoKnownAs` selection for bidi | `Document::handles()` reads **only `also_known_as[0]`** and strips `at://` — ignores later entries. Stricter than spec | `getHandle(doc)` picks the first `at://` entry (skipping non-atproto entries) | `Identity.DeclaredHandle()` iterates `AlsoKnownAs`, takes the first `at://` URI, normalizes |

## Divergences worth highlighting in prose

### 1. Handle-resolution concurrency: parallel / race / sequential

The three ecosystems take **three different approaches** to combining DNS TXT and HTTPS well-known:

- **Rust (`atproto-identity`)** — runs both via `tokio::join!` and applies **strict agreement**. Any disagreement raises `ConflictingDIDsFound`; you cannot silently prefer one.
- **TypeScript (`@atproto/identity`)** — **races** via `Promise.race` semantics: whichever transport resolves first wins, the loser is aborted. No agreement check. If both primaries fail, falls back to `resolveDnsBackup` (custom nameservers).
- **Go (indigo)** — **sequential**: DNS first, HTTPS only if DNS errored. Explicit comment in the source says "could do resolution in parallel, but expecting that sequential is sufficient to start." No agreement check either.

All three strategies are **conformant** with the handle spec, which permits implementations to prefer DNS, prefer HTTPS, or require agreement. Pick one per service and document it — mixing strategies across a single ecosystem manifests as intermittent handle flapping.

If you are writing a new resolver and cross-stack parity matters, pick **parallel + strict-agreement** (Rust-style) — it catches the most misconfigurations and has bounded latency.

### 2. Browser support is TypeScript-only

Handle resolution requires a DNS TXT primitive, which the browser does not expose. The Rust and Go libraries are **server-only**. The TypeScript ecosystem splits into two layers:

- `@atproto/identity` — **Node only**. Imports `node:dns/promises` at module top; will not bundle for browsers.
- `@atproto-labs/handle-resolver` family — **isomorphic**. Abstracts DNS behind a `resolveTxt` dependency injection. Includes `AtprotoDohHandleResolver` (DNS-over-HTTPS against Cloudflare or Google), `XrpcHandleResolver` (delegates to a PDS's `com.atproto.identity.resolveHandle`), and `CachedHandleResolver`.

When writing a client that runs in a browser, pick one of three shapes: **XRPC delegation**, **DoH**, or **server-proxied resolution**. Never import `@atproto/identity` directly into browser code.

### 3. webvh is validated but not resolved

The `did:webvh:` method is **syntactically recognized** only by Rust's `atproto-identity::validation::is_valid_did_method_webvh`; neither TypeScript nor Go expose webvh validators. **None of the three libraries implements webvh resolution** (log fetch, hash-chain verification, witness proofs, SCID validation).

Worse, the Rust reference's `parse_input` does not branch on `did:webvh:` — a webvh DID starts with `did:web:` and is misclassified as the `Web` variant, after which the `web::query` call will 404 against `https://<scid>:<host>/.well-known/did.json`. If you need webvh support, you are writing it yourself; consult `shared/did-spec.md §3.3` and the [webvh spec](https://identity.foundation/didwebvh/).

Do **not** fall back to `did:web` resolution when a webvh fetch fails — the whole point of webvh is the verifiability.

### 4. Bidirectional check: caller-owned vs library-owned

- **Go** bakes the bidirectional check into `Directory.LookupHandle` (hard error on mismatch: `ErrHandleMismatch`) and `Directory.LookupDID` (soft — sets `Identity.Handle = syntax.HandleInvalid`, unless `SkipHandleVerification`). Callers get verification for free.
- **Rust** provides the building blocks (`Document::handles()`) but leaves the comparison to the caller. Stricter callers should re-check `alsoKnownAs` after every `resolve_subject`.
- **TypeScript** is caller-owned — pattern is `const data = await didRes.resolveAtprotoData(did); if (data.handle !== inputHandle) …`. Easy to forget; many client bugs originate here.

If you are porting logic and the source language is Go, double-check that the destination language's code is actually doing the `alsoKnownAs` comparison.

### 5. Error-handling shapes differ enough to change code structure

- **Rust**: typed enums, exhaustive `match`. `ResolveError` has 8 variants; per-method errors are richer.
- **Go**: sentinel values, compared with `errors.Is`. No enum-like exhaustiveness, but sentinels carry across wrap boundaries.
- **TypeScript**: classes (`DidNotFoundError`, `UnsupportedDidMethodError`, `UnsupportedDidWebPathError`, etc.) — `instanceof` checks. Plus: `HandleResolver.resolve` returns `undefined` for "not found" rather than throwing. `ensureAtpDocument` throws plain `Error` with a formatted message.

A port from Rust to TypeScript must convert exhaustive matches to a cascade of `instanceof` checks plus a `?? undefined` for handle-not-found. A port from Go to Rust must turn sentinel comparisons into enum variants — the Rust enum is typically *more* informative.

### 6. `handle.invalid` is surfaced differently

- **Rust**: no built-in `handle.invalid` emission — callers produce the sentinel string themselves after a failed bidirectional check.
- **TypeScript**: `@atproto/syntax` exports `INVALID_HANDLE = 'handle.invalid'` and `Handle#isInvalidHandle`; no automatic emission from resolvers.
- **Go**: `syntax.HandleInvalid` is a package-level `var`, and `Directory.LookupDID` sets `Identity.Handle = syntax.HandleInvalid` automatically on bidi failure (unless `SkipHandleVerification`).

Use the language-appropriate sentinel — never a bare string literal `"handle.invalid"` in call sites.

### 7. Reserved-TLD lists disagree with the spec

All three libraries ship a subset of the spec's 9 reserved TLDs:

| TLD          | Spec | Rust (`RESERVED_TLDS`) | Go (`AllowedTLD`) | TS (`DISALLOWED_TLDS`) |
| ------------ | ---- | ---------------------- | ----------------- | ---------------------- |
| `.localhost` | yes  | yes                    | yes               | yes                    |
| `.local`     | yes  | yes                    | yes               | yes                    |
| `.internal`  | yes  | yes                    | yes               | yes                    |
| `.arpa`      | yes  | yes                    | yes               | yes                    |
| `.invalid`   | yes  | **no**                 | yes               | yes                    |
| `.example`   | yes  | **no**                 | yes               | yes                    |
| `.onion`     | yes  | **no**                 | yes               | yes                    |
| `.alt`       | yes  | **no**                 | yes               | yes                    |
| `.test`      | yes  | **no**                 | **no**            | yes                    |

If you need spec-wide coverage, extend the Rust list in your application layer. For interop testing across languages, beware that a handle like `alice.invalid` is rejected by TS and Go but accepted by Rust.

## When in doubt, lean on the reference implementations

- **Rust**: [`atproto-identity`](https://docs.rs/atproto-identity) 0.14 — thorough, but weak on webvh and reserved TLDs.
- **TypeScript**: [`@atproto/identity`](https://www.npmjs.com/package/@atproto/identity) for Node + [`@atproto-labs/handle-resolver`](https://www.npmjs.com/package/@atproto-labs/handle-resolver) for isomorphic use. Both are maintained by Bluesky.
- **Go**: [`indigo/atproto/identity`](https://pkg.go.dev/github.com/bluesky-social/indigo/atproto/identity) inside [`indigo`](https://github.com/bluesky-social/indigo) — the deepest bidi-check integration of the three.

When porting a fixture, trust the spec (`shared/handle-spec.md`, `shared/did-spec.md`) over the implementations. The implementations have known gaps.

## Related

- `shared/handle-spec.md` — normative handle syntax + resolution transport rules.
- `shared/did-spec.md` — DID syntax + DID document requirements.
- `shared/resolution-flow.md` — the step-by-step sequence every implementation follows.
- `shared/test-vectors.md` — fixtures for cross-language agreement testing.

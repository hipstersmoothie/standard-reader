---
name: atproto-identity-resolution
description: This skill should be used when the user is resolving, validating, parsing, or debugging AT Protocol identities in Rust, TypeScript, or Go — handles (domain-name usernames like `alice.bsky.social`) and DIDs (`did:plc:…`, `did:web:…`, `did:webvh:…`). Triggers on phrases like "resolve a handle", "why does my handle return 404", "DNS TXT `_atproto.`", "`/.well-known/atproto-did`", "bidirectional verification", "handle.invalid", "`alsoKnownAs` not matching", "DID document", "atproto_pds service endpoint", "signing key multikey", "my PDS location is wrong", "can't find PDS endpoint", "did:web vs did:plc", "com.atproto.identity.resolveHandle", "rotation key", "handle resolution mismatch". Also triggers on dependency/import names like `atproto-identity` (Rust crate), `@atproto/identity`, `@atproto-labs/handle-resolver`, `@atproto/syntax`, `ensureValidHandle`, `ensureValidDid`, `IdResolver`, `HandleResolver`, `DidResolver`, `github.com/bluesky-social/indigo/atproto/identity`, `indigo/atproto/syntax`, `syntax.ParseHandle`, `syntax.ParseDID`, `identity.DefaultDirectory`, `identity.BaseDirectory`, `LookupHandle`, `LookupDID`, `HickoryDnsResolver`, or lockfile names `Cargo.toml`, `package.json`, `pnpm-lock.yaml`, `go.mod`, `go.sum`. Covers handle syntax rules and reserved TLDs; DNS TXT + HTTPS well-known handle resolution (concurrent, with conflict handling); input normalization (`at://`, `@` prefixes); DID method selection (plc, web, webvh — webvh is validated by all three reference libraries but not resolved: none of them ship a log verifier, and all three reject webvh inputs at fetch time rather than silently falling back); DID document requirements (handle binding in `alsoKnownAs`, `Multikey` with `#atproto` suffix, `AtprotoPersonalDataServer` service); bidirectional verification; `handle.invalid` semantics; caching guidance. Use to implement handle/DID resolvers, client-side auth onboarding, AppView handle lookups, PDS handle-change flows, or diagnostic tooling. Does NOT cover did:plc operation log format, key rotation cryptography, OAuth (see `atproto-oauth`), record CID computation (see `atproto-cid`), repo/MST traversal (see `atproto-repository`), or parsing `at://` URIs *inside records* (see `atproto-lexicon` — this skill covers identity-side `at://` normalization only).
version: 0.2.0
---

# AT Protocol Identity Resolution

Every AT Protocol account is a DID; most accounts also have a human-friendly handle. Turning either one into the other — and trusting the result — is the bedrock operation this skill covers. This file is a router that sits on top of a language-neutral spec in `shared/` and per-language guides in `rust/`, `typescript/`, `go/`.

## Defaults

An atproto identity resolution pipeline always does the same four things:

1. **Normalize and classify** the input (`at://`, `@`, whitespace stripped; then handle vs DID by prefix).
2. **Resolve handle → DID** using DNS TXT (`_atproto.<handle>`) and HTTPS (`/.well-known/atproto-did`) **concurrently** (the spec requires it; Rust uses `tokio::join!`, TypeScript races, Go's reference library currently runs sequentially and is a divergence — see `shared/handle-spec.md` §4.3 and `shared/divergence-matrix.md`), with a documented conflict policy.
3. **Fetch the DID document** via the method-specific transport (`did:plc` → PLC directory, `did:web` → host well-known, `did:webvh` → log + verifier).
4. **Validate the document and bidi-check**: `alsoKnownAs` contains `at://<handle>`, a `#atproto` `Multikey` is present, an `#atproto_pds` `AtprotoPersonalDataServer` service is present.

Anything outside those four steps (rotation keys, PLC operation logs, OAuth, records) belongs in an adjacent skill — see the frontmatter.

Full normative rules: `shared/handle-spec.md` and `shared/did-spec.md`. End-to-end sequence: `shared/resolution-flow.md`. Fixtures: `shared/test-vectors.md`. Cross-language differences: `shared/divergence-matrix.md`.

## Language detection

Before generating or reviewing identity-resolution code, determine the target language from project files or the file being edited:

- `Cargo.toml`, `*.rs`, `rust-toolchain.toml`, any mention of `atproto-identity` (crate) → **Rust** — read from `rust/`.
- `package.json`, `tsconfig.json`, `*.ts`, `*.tsx`, imports of `@atproto/identity` / `@atproto/syntax` / `@atproto-labs/handle-resolver` → **TypeScript** — read from `typescript/`. Also `*.js`/`*.jsx` when there is no `.ts` present in the repo.
- `go.mod`, `*.go`, imports of `github.com/bluesky-social/indigo/atproto/identity` or `.../atproto/syntax` → **Go** — read from `go/`.

Prefer the *file being edited* over the *repo root* when they disagree: a `.ts` client inside a Rust-workspace monorepo still means TypeScript for that task.

If multiple languages are present and the task does not point at one unambiguously, **ask which one applies**. Never mix resolver libraries across languages in generated code.

If an unsupported language is detected (Python, Java, Elixir, Swift, …), point the user at `shared/handle-spec.md` + `shared/did-spec.md` + `shared/resolution-flow.md` for the transport-level rules and offer the Rust `atproto-identity` crate as a reference implementation to transliterate from.

## Reading guide

For every identity-resolution task:

1. Read `shared/handle-spec.md` and `shared/did-spec.md` first — the rules your code must enforce.
2. Read the relevant task file in the detected language directory:
   - Validating handles or DIDs as strings → `{lang}/syntax.md`
   - Resolving handle → DID, DID → DID document, or end-to-end → `{lang}/resolution.md`
   - Validating a DID document (bidi check, required methods/services) → `{lang}/validation.md`
   - Dependency setup, library choice, idioms → `{lang}/README.md`
3. Consult `shared/divergence-matrix.md` when porting between languages or reviewing cross-stack interop — concurrency strategy, browser support, webvh support, and error shapes all diverge.

Always prefer the official library (`atproto-identity` in Rust, `@atproto/identity` + `@atproto/syntax` in TypeScript, `github.com/bluesky-social/indigo/atproto/identity` in Go) over hand-rolling.

## Architecture (shared concepts)

### Input normalization

Before any syntax check:

- Strip leading `at://`.
- Strip leading `@` (a UI convention; never stored).
- Trim whitespace.
- Lowercase handles (handles are case-insensitive). DIDs are case-sensitive — reject mis-cased.

An empty input after normalization is always an error, never a wildcard.

### Classification

Given normalized input, classify **in prefix order** — `did:webvh:` before `did:web:` before `did:plc:`, else handle:

```
did:webvh:…  → DID, method = webvh
did:web:…    → DID, method = web
did:plc:…    → DID, method = plc
<else>       → candidate handle (run handle syntax validation)
```

Note: classification is not the same as resolution. See §"DID methods across libraries" below — all three reference libraries classify webvh but none of them fetch the did:webvh log. Treat a webvh input as "validated syntax, resolution deferred" unless you wire in a webvh-specific resolver.

### Handle resolution (DNS + HTTPS)

Handles resolve by two transports run together:

- **DNS TXT** on `_atproto.<handle>`: filter records starting with `did=`, take the single value, fail if multiple distinct values appear.
- **HTTPS** on `https://<handle>/.well-known/atproto-did`: expect 2xx, body starting with `did:`, trimmed.

The **concurrency strategy** and the **conflict policy** differ across the three libraries — see `shared/divergence-matrix.md` §concurrency-strategy. In short: Rust runs both and fails on disagreement (strict-join); TypeScript races and takes the first to resolve (DNS preferred); Go runs DNS first, falls back to HTTPS on miss (sequential). All three are spec-conformant.

### DID document shape (what the bidi check asserts)

An atproto-usable DID document must contain all three:

1. **Handle binding** — an entry in `alsoKnownAs` of the form `at://<handle>`. First syntactically valid entry wins.
2. **Atproto signing key** — in `verificationMethod`, an entry whose `id` ends with `#atproto`, `type` is exactly `Multikey`, `controller` equals the DID, `publicKeyMultibase` is set.
3. **PDS service entry** — in `service`, an entry whose `id` ends with `#atproto_pds`, `type` is exactly `AtprotoPersonalDataServer`, `serviceEndpoint` is an HTTPS URL with only scheme + host + optional port (no path, userinfo, or query).

Any missing piece → the account is "likely broken" (DID spec wording). Treat as a resolution failure for almost all consumer operations.

### Bidirectional verification

For any resolution that started from a handle: the resolved DID document's `alsoKnownAs` must contain `at://<handle>` (case-insensitive on the handle label). If it does not → the handle does not trust this DID; emit `handle.invalid`.

Who performs the bidi check differs by library — Rust and TypeScript leave it to the caller by default, Go performs it internally in `LookupHandle`. See `shared/divergence-matrix.md` §bidi-check.

### DID methods across libraries

| Method         | Rust `atproto-identity`         | TypeScript `@atproto/identity`                | Go indigo                                |
| -------------- | ------------------------------- | --------------------------------------------- | ---------------------------------------- |
| `did:plc:…`    | Fetches from PLC directory.     | `DidPlcResolver` → PLC directory.             | `ResolveDIDPLC` → PLC directory.         |
| `did:web:…`    | Fetches `/.well-known/did.json`. | `DidWebResolver` → `/.well-known/did.json`.  | `ResolveDIDWeb` → `/.well-known/did.json`. |
| `did:webvh:…`  | Syntax only. `parse_input` has no webvh branch; its `did:web:` check is `starts_with("did:web:")` with the trailing colon, so webvh strings don't match web either — they fall through to handle validation and return `ResolveError::InvalidInput`. | Syntax only. No webvh resolver ships in `@atproto/identity`. | Syntax only. No webvh resolver ships in indigo. |

If you need real did:webvh resolution, wire in a language-specific webvh library alongside the atproto resolver. **Do not silently fall back to did:web on a webvh input** — webvh requires log integrity verification and a lossy fallback is a security regression. The webvh DID Method spec lives at <https://identity.foundation/didwebvh/> — transliterate the log-verification rules from there if no library exists for your stack.

### `handle.invalid`

Per the handle spec, the literal string `handle.invalid` replaces a real handle after DID resolution when any of:

- The bidirectional check failed (`alsoKnownAs` does not list this handle).
- Handle syntax is invalid.
- Handle resolution returned no DID at all after retries.

Do **not** emit `handle.invalid` during transient outages (PDS or PLC directory downtime). Retry with backoff first; latching prematurely is a worse UX than a temporary stale render.

## Decision rules

- **Conflict between DNS and HTTPS?** Pick and document one policy: strict-agreement (default in Rust; loud failures, good for PDSes) or prefer-DNS (default in TypeScript/Go; faster, tolerant of broken `/.well-known/`). Silent divergence across services manifests as intermittent handle flapping.
- **Cache successful resolutions?** Yes — minutes-to-hours at the application layer. DNS TTL is usually too short. DID documents cache for tens of minutes.
- **Cache failed resolutions?** Seconds-to-minutes only. Users retry faster than you'd expect.
- **Emit `handle.invalid` eagerly?** No. Emit only when the failure is structural (bidi mismatch, syntax, empty result after retries), not transient.
- **Accept a path-based `did:web:example.com:users:alice`?** Not in atproto. Reject.
- **Use `com.atproto.identity.resolveHandle` on a PDS instead of rolling a DNS stack?** Yes for client apps — it aggregates DNS and HTTPS with the PDS's own caching and saves you from shipping a resolver.

## Common pitfalls

Draw from the relevant `shared/` file and `shared/divergence-matrix.md`. The high-impact ones:

- **DNS returns two `did=…` records with different values** — publisher has a stale record. Reject and log; don't pick one silently.
- **`/.well-known/atproto-did` returns HTML** — host is serving a wildcard 200 page. Resolver must reject on `Content-Type` / prefix; don't try to parse.
- **`alsoKnownAs` lacks `at://<handle>`** — DID was configured for a different handle. Bidi check fails → `handle.invalid`.
- **DID document missing `#atproto` `Multikey` or `#atproto_pds` service** — document is not atproto-ready. Reject for atproto flows regardless of whether it's a valid generic DID document.
- **PDS endpoint has a path segment** — non-conformant per spec (scheme + host + optional port only). Reject.
- **`did:webvh:…` inputs rejected outright** — see §"DID methods across libraries". The Rust resolver returns `InvalidInput` (webvh falls through to handle validation); TypeScript and Go reject at the resolver entry point. No library silently downgrades to `did:web`; all three fail loudly, so you must wire in a webvh-aware resolver if your traffic contains webvh DIDs.
- **Reserved TLDs slipping through** — Rust's validator covers 4/9 reserved TLDs; Go covers 8/9; TypeScript covers 9/9. If you need full spec coverage in Rust, add the remainder yourself. See `shared/divergence-matrix.md` §reserved-tlds.
- **Browser-side handle resolution in TypeScript** — `@atproto/identity` requires Node's `dns`/`fetch` and does **not** run in browsers. Use `@atproto-labs/handle-resolver` with DoH or XRPC delegation for isomorphic code.

## Tools you can call

Prefer these MCP tools when the goal is to *compute* or *validate* an identity result rather than teach an implementation how.

- **`lexicon-garden`** → `resolve_identity(input)` does parse + resolve + document fetch against a trusted resolver. Use it to generate expected values for cross-language test vectors.
- **`atpmcp`** → `resolve_handle_to_did(handle)` and `resolve_identity(subject)` expose local resolver implementations with configurable DNS / PDS.
- **PDS XRPC** → `com.atproto.identity.resolveHandle?handle=<handle>` returns `{ did: "…" }` on success. Use when writing clients that shouldn't ship a DNS stack.
- **PLC directory** → `GET https://plc.directory/<did>` returns the current DID document for a `did:plc`. Also `/<did>/log` and `/<did>/log/audit` for operation history (outside this skill's scope).

## Directory layout

```
atproto-identity-resolution/
├── SKILL.md                          # this file — router
├── shared/
│   ├── handle-spec.md                # normative handle rules
│   ├── did-spec.md                   # normative DID rules + document shape
│   ├── resolution-flow.md            # end-to-end sequence (normalize → classify → resolve → verify)
│   ├── test-vectors.md               # fixtures
│   └── divergence-matrix.md          # cross-language differences
├── rust/
│   ├── README.md                     # crate setup, idioms
│   ├── syntax.md                     # is_valid_handle / is_valid_did_method_*
│   ├── resolution.md                 # parse_input, resolve_handle, InnerIdentityResolver
│   └── validation.md                 # Document helpers, bidi check, handle.invalid
├── typescript/
│   ├── README.md                     # @atproto/identity + @atproto/syntax + @atproto-labs setup
│   ├── syntax.md                     # ensureValidHandle / ensureValidDid / INVALID_HANDLE
│   ├── resolution.md                 # IdResolver / HandleResolver / DidResolver
│   └── validation.md                 # AtprotoData, bidi verification, signing-key helpers
└── go/
    ├── README.md                     # indigo atproto/identity + atproto/syntax setup
    ├── syntax.md                     # syntax.ParseHandle / ParseDID / HandleInvalid
    ├── resolution.md                 # Directory, BaseDirectory, DefaultDirectory, Lookup*
    └── validation.md                 # Identity struct helpers, built-in bidi check
```

## References

Everything below is reachable from the directory tree above. Listed here for quick grep:

- `shared/handle-spec.md`
- `shared/did-spec.md`
- `shared/resolution-flow.md`
- `shared/test-vectors.md`
- `shared/divergence-matrix.md`
- `rust/README.md`, `rust/syntax.md`, `rust/resolution.md`, `rust/validation.md`
- `typescript/README.md`, `typescript/syntax.md`, `typescript/resolution.md`, `typescript/validation.md`
- `go/README.md`, `go/syntax.md`, `go/resolution.md`, `go/validation.md`

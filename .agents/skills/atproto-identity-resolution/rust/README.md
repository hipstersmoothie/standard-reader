# Rust — `atproto-identity` setup and idioms

The reference Rust library for AT Protocol identity resolution is the `atproto-identity` crate (version 0.14.0 at time of writing). It ships the validators, resolvers, DID document type, key helpers, and a `tokio::join!`-based handle resolver in a single crate.

Crate landing: <https://docs.rs/atproto-identity>. Source: <https://tangled.org/ngerakines.me/atproto-crates> (subdir `atproto-identity`).

## Dependencies

```toml
[dependencies]
atproto-identity = { version = "0.14", features = ["hickory-dns"] }
anyhow = "1"
reqwest = { version = "0.12", features = ["rustls-tls"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros"] }
```

- `hickory-dns` feature adds `HickoryDnsResolver`, which is the concrete `DnsResolver` impl you almost always want. Without this feature you'd have to bring your own `DnsResolver`.
- `reqwest` is re-exported through the crate's function signatures (`resolve_handle_http(&reqwest::Client, …)`). Use the same major version the crate depends on to avoid type mismatches.
- `tokio` is required because resolution is async and uses `tokio::join!` internally.

## Module map

```
atproto_identity::resolve       -- parse_input, resolve_handle*, InnerIdentityResolver,
                                   SharedIdentityResolver, HickoryDnsResolver
atproto_identity::validation    -- is_valid_handle, is_valid_did_method_plc / web / webvh,
                                   is_valid_hostname, strip_handle_prefixes
atproto_identity::model         -- Document, DocumentBuilder, Service, VerificationMethod, Handle
atproto_identity::errors        -- ResolveError, WebDIDError, PLCDIDError, KeyError
atproto_identity::traits        -- IdentityResolver, DnsResolver, KeyResolver, DidDocumentStorage
atproto_identity::plc           -- per-method fetcher for did:plc
atproto_identity::web           -- per-method fetcher for did:web
atproto_identity::key           -- KeyType, KeyData, identify_key, IdentityDocumentKeyResolver
```

Walking these top-down: `resolve` orchestrates, `validation` gates inputs, `model` names the shapes, `plc` / `web` fetch, `key` handles crypto. For the core identity-resolution flow, you only import `resolve` and `model`; the others come in when you need deeper work.

## Typical wiring

The small-program shape — one-off resolution of a single subject — looks like this:

```rust
use std::sync::Arc;
use atproto_identity::resolve::{HickoryDnsResolver, InnerIdentityResolver, SharedIdentityResolver};
use atproto_identity::traits::IdentityResolver;

let http_client = reqwest::Client::builder()
    .timeout(std::time::Duration::from_secs(30))
    .build()?;

let dns_resolver = Arc::new(HickoryDnsResolver::create_resolver(&[]));

let inner = InnerIdentityResolver {
    dns_resolver,
    http_client,
    plc_hostname: "plc.directory".to_string(),
};
let resolver = SharedIdentityResolver(Arc::new(inner));

let document = resolver.resolve("alice.bsky.social").await?;
```

Key points in this snippet:

- `HickoryDnsResolver::create_resolver(&[])` uses system DNS; pass `&[std::net::IpAddr]` to force specific nameservers (useful in tests or locked-down environments).
- `InnerIdentityResolver` is the actual resolver; `SharedIdentityResolver` wraps it in `Arc` and delegates `IdentityResolver::resolve` to it. Wrap long-lived resolvers in `SharedIdentityResolver` so you can `.clone()` them across tasks cheaply.
- `plc_hostname` is configurable — point it at a local PLC mirror for tests, or at `plc.directory` in production.

## Idioms

- **Free functions for the primitives, methods for the orchestrator.** `parse_input`, `resolve_handle_dns`, `resolve_handle_http`, `resolve_handle`, and `resolve_subject` are free functions that take their dependencies as parameters. The `InnerIdentityResolver` struct wraps them into a single `resolve()` method that carries the HTTP/DNS/PLC state. Reach for the free functions in tests (you can pass mocks directly), and for the resolver in production code.
- **Return shapes vary by layer.** `parse_input` returns `InputType`. `resolve_handle` / `resolve_subject` return a DID `String`. `InnerIdentityResolver::resolve` returns a `Document` (the fetched DID document). Pick the layer that matches what you actually need — calling `resolve_subject` when you want a document is one extra step; calling `resolve` when you only want the DID is wasted work.
- **Bidirectional check is not automatic.** Even when you call `InnerIdentityResolver::resolve("alice.bsky.social")`, the crate does not verify that the returned document's `alsoKnownAs` lists `at://alice.bsky.social`. You must do that step yourself — see `validation.md` §bidi-check. This is a caller responsibility by design; the crate stays composable.
- **Strict agreement on DNS/HTTPS.** `resolve_handle` raises `ResolveError::ConflictingDIDsFound` if DNS and HTTPS disagree. If you want prefer-DNS semantics, wrap or reimplement `resolve_handle` — do not patch it silently.
- **Reserved TLDs: a 4-entry subset.** `validation.rs` has `RESERVED_TLDS = [".localhost", ".internal", ".arpa", ".local"]`. The full spec list has 9. If you need complete coverage, layer a pre-check (see `validation.md`).
- **did:webvh is validated but not resolved.** `validation::is_valid_did_method_webvh` exists and checks webvh syntax, but `parse_input` has no webvh branch. Its `did:web:` check uses a trailing colon (`starts_with("did:web:")`), so a `did:webvh:…` string does not match web either — it falls through to handle validation, which rejects it as a non-hostname. The observed behaviour: webvh inputs return `ResolveError::InvalidInput` today. Don't assume webvh works end-to-end; wire in a dedicated webvh resolver if you need it.

## See also

- `syntax.md` — exact function names and signatures for validating handles and DIDs.
- `resolution.md` — the resolution call graph, from `parse_input` to `InnerIdentityResolver::resolve`.
- `validation.md` — asserting the atproto document shape, bidirectional check, `handle.invalid` emission.
- `../shared/handle-spec.md` and `../shared/did-spec.md` — the normative rules this crate implements.
- `../shared/divergence-matrix.md` — how this crate's behaviour differs from `@atproto/identity` and indigo.

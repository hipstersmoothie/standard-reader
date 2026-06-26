# Rust — Resolving handles and DIDs

The resolution pipeline in `atproto_identity::resolve` is structured as free functions for the primitives plus an `InnerIdentityResolver` method for the orchestrator. Pick the layer that matches what you actually need.

## Call graph at a glance

```
parse_input(&str) -> InputType
   │
   ├─ InputType::Handle(h)   ─┐
   ├─ InputType::Plc(did)    ─┤
   └─ InputType::Web(did)    ─┘
                              │
resolve_handle(http, dns, h)  ┤  returns DID string on handle input
resolve_subject(http, dns, s) ┤  wraps parse_input + resolve_handle for mixed inputs
                              │
InnerIdentityResolver::resolve(&self, subject)
                              │
                              ├─ resolve_subject → DID string
                              ├─ re-parse DID
                              │    ├─ Plc → plc::query → Document
                              │    └─ Web → web::query → Document
                              └─ returns Document
```

No step performs the bidirectional handle check. The crate returns a DID document for consumers to verify; see `validation.md` for the caller-owned bidi step.

## `parse_input`

```rust
use atproto_identity::resolve::{parse_input, InputType};

match parse_input("@alice.bsky.social")? {
    InputType::Handle(h)  => …,   // "alice.bsky.social"
    InputType::Plc(did)   => …,   // "did:plc:z3f…"
    InputType::Web(did)   => …,   // "did:web:example.com"
}
```

`parse_input` normalizes (`at://` + `@` + trim) and classifies. It is pure and synchronous. Failure mode: `ResolveError::InvalidInput`.

**Three variants only.** There is no `InputType::WebVH`. A `did:webvh:…` input hits the handle-validation branch (because it does not start with `did:web:` exactly) and returns `InvalidInput`. If you want webvh support, don't rely on `parse_input`.

## `resolve_handle_dns` and `resolve_handle_http`

```rust
use atproto_identity::resolve::{resolve_handle_dns, resolve_handle_http};

let dns_did  = resolve_handle_dns(&*dns_resolver, "alice.bsky.social").await?;
let http_did = resolve_handle_http(&http_client,   "alice.bsky.social").await?;
```

- `resolve_handle_dns` queries `_atproto.<handle>` and filters TXT records starting with `did=`. Multiple distinct values → `MultipleDIDsFound`. Zero matches → `NoDIDsFound`.
- `resolve_handle_http` hits `https://<handle>/.well-known/atproto-did` with a 10-second timeout. Body must start with `did:` (trimmed) or you get `InvalidHTTPResolutionResponse`. **The crate does not check `Content-Type`.** If you want strict `text/plain` enforcement (to avoid accepting HTML from wildcard 200 pages), layer it yourself.

These are primitives — use them when you want to drive the two transports independently (e.g., to warn on DNS-only or HTTPS-only success) rather than through `resolve_handle`'s strict-agreement semantics.

## `resolve_handle` (strict agreement via `tokio::join!`)

```rust
use atproto_identity::resolve::resolve_handle;

let did = resolve_handle(&http_client, &*dns_resolver, "alice.bsky.social").await?;
```

Reconciliation:

| DNS    | HTTPS  | Outcome                                                       |
| ------ | ------ | ------------------------------------------------------------- |
| Ok(a)  | Ok(b)  | `a == b` → `a`; `a != b` → **`ConflictingDIDsFound` error**.  |
| Ok(a)  | Err    | Returns `a`. HTTPS failure is silently dropped.               |
| Err    | Ok(b)  | Returns `b`. DNS failure is silently dropped.                 |
| Err    | Err    | `NoDIDsFound`.                                                |

Strict-agreement is the crate's default. If you want prefer-DNS semantics (conformant per the spec but not implemented here), reimplement the reconciliation using `resolve_handle_dns` + `resolve_handle_http` directly — do not patch this function.

Concurrency: both transports run in a `tokio::join!`, so worst-case latency is `max(dns_rtt, http_rtt)`, not their sum.

## `resolve_subject`

```rust
use atproto_identity::resolve::resolve_subject;

// Any input form, returns the canonical DID.
let did = resolve_subject(&http_client, &*dns_resolver, "@alice.bsky.social").await?;
let did = resolve_subject(&http_client, &*dns_resolver, "did:plc:z3f…").await?;
```

Wraps `parse_input` + `resolve_handle`. For DID inputs (plc or web), returns the DID unchanged without hitting the network — it is a pure classification pass for those cases. For handle inputs, calls `resolve_handle`.

Use this when you want a DID *string* but no document. If you want the document, call `InnerIdentityResolver::resolve` instead — it does both.

## `InnerIdentityResolver::resolve`

```rust
use atproto_identity::resolve::{InnerIdentityResolver, SharedIdentityResolver};
use atproto_identity::traits::IdentityResolver;
use std::sync::Arc;

let resolver = SharedIdentityResolver(Arc::new(InnerIdentityResolver {
    dns_resolver: Arc::new(HickoryDnsResolver::create_resolver(&[])),
    http_client: reqwest::Client::new(),
    plc_hostname: "plc.directory".to_string(),
}));

let document: atproto_identity::model::Document =
    resolver.resolve("alice.bsky.social").await?;
```

End-to-end: resolves handle → DID, then fetches the DID document from the PLC directory or the `did:web` host. The second step uses `plc::query` (for `InputType::Plc`) or `web::query` (for `InputType::Web`). The resolver re-runs `parse_input` on the resolved DID — if it somehow classifies back as a handle (pathological input), you get `SubjectResolvedToHandle`.

### Why `SharedIdentityResolver` is not optional in practice

`InnerIdentityResolver` is not `Clone`. Wrap it in `SharedIdentityResolver` (which holds `Arc<InnerIdentityResolver>`) so you can clone it cheaply across Axum handlers, Tokio tasks, and spawned work. `SharedIdentityResolver: Clone + Deref<Target=InnerIdentityResolver>`.

### Tests without a network

For unit tests, inject your own `DnsResolver` and a `reqwest::Client` configured with a mock server (e.g., `wiremock`):

```rust
struct FakeDns(HashMap<String, Vec<String>>);

#[async_trait::async_trait]
impl DnsResolver for FakeDns {
    async fn resolve_txt(&self, domain: &str) -> Result<Vec<String>, ResolveError> {
        Ok(self.0.get(domain).cloned().unwrap_or_default())
    }
}
```

`resolve_handle_dns` and `resolve_handle_http` are the cleanest injection points because they take the transport directly.

## Error catalogue (`ResolveError`)

From `atproto_identity::errors::ResolveError`:

| Variant                           | Cause                                                                                 |
| --------------------------------- | ------------------------------------------------------------------------------------- |
| `InvalidInput`                    | `parse_input` rejected the string (including webvh inputs).                            |
| `NoDIDsFound`                     | Neither DNS nor HTTPS returned a DID for a handle.                                    |
| `MultipleDIDsFound`               | DNS TXT returned more than one distinct `did=` value.                                 |
| `ConflictingDIDsFound`            | DNS and HTTPS both succeeded but disagreed.                                           |
| `DNSResolutionFailed { error }`   | Transport error in DNS (wraps `hickory_resolver::ResolveError`).                      |
| `HTTPResolutionFailed { error }`  | Transport error in HTTP (wraps `reqwest::Error`).                                     |
| `InvalidHTTPResolutionResponse`   | HTTPS body did not start with `did:`.                                                  |
| `SubjectResolvedToHandle`         | Pathological: resolved DID re-classified as a handle. Should never occur in practice. |

Document-shape errors (`DidDocumentMalformed`, bidirectional-check failures) are **not** on this enum — you add them in your own caller code. `plc::query` and `web::query` can return `PLCDIDError` / `WebDIDError`; those are converted into `anyhow::Error` by the `InnerIdentityResolver` wrapper.

## Branch-by-branch procedure

Follow this when you need the full pipeline with bidi verification (which the crate does not give you for free):

```rust
use atproto_identity::resolve::{parse_input, InputType, resolve_handle};
use atproto_identity::traits::IdentityResolver;

let classified = parse_input(subject)?;

let (did_str, started_from_handle) = match classified {
    InputType::Handle(h) => {
        let did = resolve_handle(&http, &*dns, &h).await?;
        (did, Some(h))
    }
    InputType::Plc(d) | InputType::Web(d) => (d, None),
};

// Fetch the DID document.
let document = resolver.resolve(&did_str).await?;

// Caller-owned: structural + bidi checks. See validation.md.
ensure_atproto_shape(&document)?;
if let Some(handle) = started_from_handle {
    ensure_bidirectional(&handle, &document)?;
}
```

`ensure_atproto_shape` and `ensure_bidirectional` are functions you write yourself on top of `Document::handles()` and `Document::pds_endpoints()` — see `validation.md`.

## See also

- `syntax.md` — `parse_input`'s building blocks.
- `validation.md` — DID-document shape checks and bidirectional verification (the missing second half of the pipeline).
- `../shared/resolution-flow.md` — language-neutral sequence of this procedure.
- `../shared/divergence-matrix.md` — why Rust uses strict-agreement while the TypeScript / Go references diverge.

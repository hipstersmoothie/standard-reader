# Go — `indigo/atproto/identity` setup and idioms

The canonical Go identity-resolution library is `github.com/bluesky-social/indigo/atproto/identity`, paired with `github.com/bluesky-social/indigo/atproto/syntax` for the string-level types. Unlike the Rust and TypeScript references, this library runs the bidirectional handle check **inside** `LookupHandle` — the caller does not have to add it.

## Install

```bash
go get github.com/bluesky-social/indigo/atproto/identity
go get github.com/bluesky-social/indigo/atproto/syntax
```

## Package map

```
atproto/syntax
  ├─ Handle             // type (string alias) — regex-validated
  │    ├─ ParseHandle("…") → (Handle, error)
  │    ├─ (h).Normalize() Handle
  │    ├─ (h).AllowedTLD() bool    — rejects 8 reserved TLDs
  │    ├─ (h).IsInvalidHandle() bool
  │    └─ HandleInvalid = Handle("handle.invalid")
  ├─ DID                // type (string alias)
  │    └─ ParseDID("did:plc:…") → (DID, error)
  ├─ AtIdentifier       // union of Handle | DID — ParseAtIdentifier
  ├─ AtURI, NSID, TID, RecordKey, CID  — not covered here
  └─ Datetime, Language  — not covered here

atproto/identity
  ├─ Directory                        // interface — LookupHandle/LookupDID/Lookup/Purge
  ├─ Resolver                         // interface — ResolveHandle/ResolveDID/ResolveDIDRaw
  ├─ BaseDirectory                    // struct — bottom-level resolver, configurable HTTP/DNS
  ├─ CacheDirectory                   // wraps any Directory with an LRU cache
  ├─ MockDirectory                    // fixture-based resolver for tests
  ├─ DefaultDirectory()               // returns a BaseDirectory wrapped in CacheDirectory
  ├─ Identity                         // struct — parsed atproto-view of a DID document
  │    ├─ (i).PDSEndpoint() string
  │    ├─ (i).PublicKey()  (atcrypto.PublicKey, error)   — gets #atproto key
  │    ├─ (i).GetPublicKey(id)  (atcrypto.PublicKey, error)
  │    ├─ (i).GetServiceEndpoint(id) string
  │    └─ (i).DeclaredHandle() (syntax.Handle, error)
  ├─ DIDDocument                      // raw parsed DID doc struct
  ├─ ParseIdentity(doc)  Identity     // extract atproto view from raw doc
  └─ errors: ErrHandleResolutionFailed, ErrHandleNotFound, ErrHandleMismatch,
             ErrHandleNotDeclared, ErrHandleReservedTLD, ErrDIDNotFound,
             ErrDIDResolutionFailed, ErrKeyNotDeclared, ErrInvalidHandle

atproto/identity/apidir       // APIDirectory — delegate to a remote service (e.g. AppView)
atproto/identity/redisdir     // RedisDirectory — cache layer backed by Redis
```

## Typical wiring

The shortest path to a usable resolver:

```go
import "github.com/bluesky-social/indigo/atproto/identity"

dir := identity.DefaultDirectory()

// Later:
ident, err := dir.LookupHandle(ctx, syntax.MustParseHandle("alice.bsky.social"))
```

`DefaultDirectory()` returns a `BaseDirectory` (system DNS, 10-second HTTP timeout, PLC directory at `plc.directory`, `TryAuthoritativeDNS: true`, `.bsky.social` excluded from DNS because the primary Bluesky PDS only serves the HTTPS well-known) wrapped in a `CacheDirectory` with 250,000-entry LRU and 24-hour TTL for hits, 2-minute TTL for errors, 5-minute TTL for `handle.invalid` latches.

For a custom resolver:

```go
base := identity.BaseDirectory{
    PLCURL: "https://plc.directory",
    HTTPClient: http.Client{Timeout: 3 * time.Second},
    Resolver: net.Resolver{
        Dial: func(ctx context.Context, network, address string) (net.Conn, error) {
            return (&net.Dialer{Timeout: time.Second}).DialContext(ctx, "udp", "1.1.1.1:53")
        },
    },
    TryAuthoritativeDNS: true,
    // SkipDNSDomainSuffixes: []string{".myhost.example"},
    // FallbackDNSServers:    []string{"8.8.8.8:53"},
    // SkipHandleVerification: true,   // only for relays / trust-less callers
    // UserAgent: "my-service/0.1",
}
dir := identity.NewCacheDirectory(&base, 10_000, time.Hour, time.Minute, 5*time.Minute)
```

Key points:

- `BaseDirectory{}` zero value is valid — all fields are optional, with sensible zero-value defaults — but almost nothing is cached, so wrap it in `CacheDirectory` for production.
- `CacheDirectory` takes four durations: `capacity`, `hitTTL`, `errTTL`, `invalidHandleTTL`. The last one matters — `handle.invalid` is latched shorter than a successful resolution so a fixed handle unlatches quickly.
- DNS + HTTP resolution is **sequential**, not parallel. See `resolution.md`.

## Idioms

- **`syntax.Handle` and `syntax.DID` are typed strings, not plain `string`.** Functions take them directly; use `ParseHandle`/`ParseDID` at entry points and let the type carry validation further in. `MustParseHandle` is available for test fixtures and panics on invalid input.
- **Normalization is explicit.** `Handle.Normalize()` lowercases. Call it before comparing; the library does not implicitly normalize in every code path.
- **Bidi check is built into both lookups, but fails differently.** `LookupHandle` hard-fails with `ErrHandleMismatch` when the DID document doesn't list the handle; `LookupDID` soft-fails by latching `Handle = identity.HandleInvalid` on the result so callers can still render the document. No caller-owned step, unlike Rust and TypeScript. See `resolution.md` for the semantics.
- **Errors are sentinel values wrapped with `%w`.** Use `errors.Is(err, identity.ErrHandleNotFound)` for classification. The library never panics for "expected" failure modes.
- **Reserved TLDs: `AllowedTLD()` rejects 8 of the 9 spec entries.** `.local`, `.arpa`, `.invalid`, `.localhost`, `.internal`, `.example`, `.onion`, `.alt` are rejected; `.test` is permitted (for testing and development). If you want to reject `.test` in production, layer your own check.
- **`did:webvh` is validated-by-syntax-only.** `syntax.ParseDID` accepts a webvh string; `BaseDirectory.ResolveDID` returns `ErrDIDResolutionFailed` because the dispatch looks for `plc` or `web` methods only. No fallback-to-web.
- **Context is mandatory.** Every resolver function takes `context.Context` for timeouts and cancellation. Pass a deadline from the caller rather than relying on the HTTP client's static timeout.

## When to use which Directory

| Directory         | Use case                                                                 |
| ----------------- | ------------------------------------------------------------------------ |
| `BaseDirectory`   | Lowest level — no caching. Use as an inner resolver.                     |
| `CacheDirectory`  | In-process LRU wrap. Default for single-instance services.               |
| `redisdir.RedisDirectory` | Shared cache across replicas. Adds a Redis dep.                   |
| `apidir.APIDirectory` | Delegate to a remote service (usually an AppView) via XRPC. Thin client, minimal deps. |
| `MockDirectory`   | Tests — insert fixtures directly; no network.                            |

## See also

- `syntax.md` — `ParseHandle`, `ParseDID`, `AllowedTLD`, `HandleInvalid`.
- `resolution.md` — `ResolveHandle`, `ResolveDID`, `LookupHandle`, `LookupDID`, `Lookup`.
- `validation.md` — the `Identity` struct, its helpers, and the already-verified bidi check.
- `../shared/handle-spec.md`, `../shared/did-spec.md` — the normative rules.
- `../shared/divergence-matrix.md` — how this library differs from Rust and TypeScript (sequential DNS+HTTP, built-in bidi).

# Go — Resolving handles and DIDs

The indigo resolver has two layers: a `Resolver` interface for primitives (handle → DID, DID → document) and a `Directory` interface for orchestrated lookups with the atproto bidi check baked in. Use `Directory` for almost everything; reach for `Resolver` only when you need to drive DNS and HTTP separately.

## Layered API

```
Resolver (primitives) ─────── Directory (orchestrated) ─────── cache wrappers
   ResolveHandle                  LookupHandle                   CacheDirectory
   ResolveDID                     LookupDID                      RedisDirectory
   ResolveDIDRaw                  Lookup                         APIDirectory
                                   Purge
```

`BaseDirectory` implements *both* interfaces. `CacheDirectory` / `RedisDirectory` / `APIDirectory` / `MockDirectory` implement `Directory` only — they're caches or remote delegates, not primitive resolvers.

## Primitives (`Resolver`)

```go
import "github.com/bluesky-social/indigo/atproto/identity"

dir := &identity.BaseDirectory{PLCURL: "https://plc.directory"}

// handle → DID
did, err := dir.ResolveHandle(ctx, syntax.MustParseHandle("alice.bsky.social"))

// DID → parsed DID document
doc, err := dir.ResolveDID(ctx, did)

// DID → raw JSON (for auditing / cross-implementation checks)
raw, err := dir.ResolveDIDRaw(ctx, did)
```

`ResolveHandle` semantics:

1. Normalize the handle (`.Normalize()` — lowercase).
2. Reject if `IsInvalidHandle()` (caller passed `handle.invalid`) — returns `ErrInvalidHandle`.
3. Reject if `!AllowedTLD()` — returns `ErrHandleReservedTLD`.
4. Unless the handle matches a suffix in `SkipDNSDomainSuffixes`, try DNS:
   - `ResolveHandleDNS` → system resolver `_atproto.<handle>` TXT lookup.
   - If that returns `ErrHandleNotFound` and `TryAuthoritativeDNS` is true → `ResolveHandleDNSAuthoritative` (find NS, query directly).
   - If still `ErrHandleNotFound` and `FallbackDNSServers` is non-empty → `ResolveHandleDNSFallback` (query configured resolvers).
5. Fall back to `ResolveHandleWellKnown` — HTTP GET `https://<handle>/.well-known/atproto-did` with a 2KB read cap.
6. Return the first DID obtained, else the most-specific error.

**This is sequential.** DNS runs first; HTTP runs only on DNS miss. Rust runs them in parallel; TypeScript races them. Go amortizes latency through caching and accepts the worst-case ~2× latency of a DNS-miss + HTTP round trip.

The HTTP path parses the body through `syntax.ParseDID`, so a wildcard-200 HTML page is rejected at the DID-syntax gate (the body won't look like `did:…`).

`ResolveDID` semantics:

- `did.Method() == "plc"` → `GET <PLCURL>/<did>`, parse JSON.
- `did.Method() == "web"` → `GET https://<hostname>/.well-known/did.json`, parse JSON.
- `did.Method() == "webvh"` or anything else → `ErrDIDResolutionFailed`. No webvh log fetching ships.

## Orchestrated (`Directory`)

```go
dir := identity.DefaultDirectory()

// Any form:
ident, err := dir.LookupHandle(ctx, handle)   // hard-fails on bidi mismatch
ident, err = dir.LookupDID(ctx, did)          // soft-fails (sets Handle = HandleInvalid)
ident, err = dir.Lookup(ctx, atIdentifier)    // dispatches based on form
dir.Purge(ctx, atIdentifier)                  // cache-invalidate
```

### `LookupHandle` — hard bidi

`LookupHandle`:

1. Normalizes the handle.
2. Calls `ResolveHandle` → DID.
3. Calls `ResolveDID` → DID document.
4. Calls `ParseIdentity` → `Identity`.
5. Calls `ident.DeclaredHandle()` — the first `at://` entry in `alsoKnownAs`, normalized.
6. Compares: if `declared != input`, returns `ErrHandleMismatch`.
7. On match, sets `ident.Handle = declared` and returns.

If bidi fails, **you get an error, not an Identity with `HandleInvalid`**. This is deliberate — handle-first lookup means the caller believed this handle claim, and a mismatch is a failure worth surfacing loudly.

### `LookupDID` — soft bidi

`LookupDID`:

1. Calls `ResolveDID` → DID document.
2. Calls `ParseIdentity` → `Identity`.
3. If `SkipHandleVerification` is set on the `BaseDirectory`, returns with `Handle = HandleInvalid` and skips the handle round-trip.
4. Otherwise calls `ident.DeclaredHandle()`. If there's no handle claim → `Handle = HandleInvalid`.
5. If there *is* a claim → resolve the claimed handle back to a DID. If that errors (not-found, resolution failure) → `Handle = HandleInvalid`. If it succeeds but returns a different DID → `Handle = HandleInvalid`. If it matches → `Handle = declared`.

DID-first lookup returns an `Identity` *even on bidi failure*, with the handle latched to the sentinel. Callers that only need the DID's PDS or signing key don't need to inspect the handle.

### `Lookup` — dispatch

```go
func (d *BaseDirectory) Lookup(ctx context.Context, a syntax.AtIdentifier) (*Identity, error) {
    handle, err := a.AsHandle()
    if err == nil { return d.LookupHandle(ctx, handle) }
    did, err := a.AsDID()
    if err == nil { return d.LookupDID(ctx, did) }
    return nil, errors.New("at-identifier neither a Handle nor a DID")
}
```

Use this when the caller can provide either form. Errors propagate from the dispatched method — `LookupHandle`'s hard bidi vs `LookupDID`'s soft bidi, even via `Lookup`.

## Error catalogue

All sentinel values in `identity.*`, match with `errors.Is`:

| Error                          | Returned from               | Meaning                                                   |
| ------------------------------ | --------------------------- | --------------------------------------------------------- |
| `ErrHandleResolutionFailed`    | `ResolveHandle`, `LookupHandle` | Transport failure (DNS error, HTTP non-2xx).            |
| `ErrHandleNotFound`            | `ResolveHandle*`            | No `did=` TXT record, no 2xx well-known response.         |
| `ErrHandleMismatch`            | `LookupHandle`              | Bidi check failed.                                        |
| `ErrHandleNotDeclared`         | `Identity.DeclaredHandle`   | DID document has no `at://` entry in `alsoKnownAs`.       |
| `ErrHandleReservedTLD`         | `ResolveHandle`             | Handle ends in one of the 8 reserved TLDs.                |
| `ErrInvalidHandle`             | `ResolveHandle`             | Input was `handle.invalid` sentinel.                       |
| `ErrDIDNotFound`               | `ResolveDID`, `LookupDID`   | PLC directory 404 or DID document 404.                    |
| `ErrDIDResolutionFailed`       | `ResolveDID`, `LookupDID`   | Transport error, unsupported method, malformed JSON.      |
| `ErrKeyNotDeclared`            | `Identity.GetPublicKey`     | No verification method with the requested fragment id.    |

## Custom resolver configuration

```go
import (
    "github.com/bluesky-social/indigo/atproto/identity"
    "golang.org/x/time/rate"
)

base := &identity.BaseDirectory{
    PLCURL: "https://plc.directory",
    PLCLimiter: rate.NewLimiter(rate.Limit(50), 10),
    DIDWebLimitFunc: func(ctx context.Context, hostname string) error {
        // apply your own per-host limiting here
        return nil
    },
    HTTPClient: http.Client{Timeout: 5 * time.Second},
    Resolver: net.Resolver{
        // Use a specific recursive resolver
        PreferGo: true,
    },
    TryAuthoritativeDNS:   true,
    SkipDNSDomainSuffixes: []string{".bsky.social"},
    FallbackDNSServers:    []string{"8.8.8.8:53"},
    UserAgent:             "my-service/0.1",
}
```

Notes:

- `SkipDNSDomainSuffixes`: the default `DefaultDirectory` includes `.bsky.social` because the Bluesky PDS serves only HTTPS well-known. Add your own hosts if you know they are HTTPS-only.
- `PLCLimiter` / `DIDWebLimitFunc` apply to the outbound request path, not to the cache read path — cached hits bypass them.
- `SkipHandleVerification` on `BaseDirectory` only affects `LookupDID`. It doesn't affect `LookupHandle` or `ResolveHandle`. Relays and trust-less consumers set it to avoid the extra DNS round-trip on every DID lookup.

## Testing with `MockDirectory`

```go
import "github.com/bluesky-social/indigo/atproto/identity"

m := identity.NewMockDirectory()
m.Insert(identity.Identity{
    DID:    syntax.DID("did:plc:z3f…"),
    Handle: syntax.Handle("alice.bsky.social"),
    AlsoKnownAs: []string{"at://alice.bsky.social"},
    Services: map[string]identity.ServiceEndpoint{
        "atproto_pds": {Type: "AtprotoPersonalDataServer", URL: "https://pds.example"},
    },
})

ident, err := m.LookupHandle(ctx, syntax.MustParseHandle("alice.bsky.social"))
```

`MockDirectory` implements the full `Directory` interface against an in-memory map. No DNS, no HTTP — pure lookup.

## End-to-end idiom

```go
import "github.com/bluesky-social/indigo/atproto/identity"

dir := identity.DefaultDirectory()

atid, err := syntax.ParseAtIdentifier(userInput)
if err != nil { return err }

ident, err := dir.Lookup(ctx, atid)
if err != nil {
    switch {
    case errors.Is(err, identity.ErrHandleMismatch):
        // Hard fail: handle was claimed but bidi didn't verify.
    case errors.Is(err, identity.ErrHandleNotFound):
        // Retry-worthy if the handle is known to exist.
    case errors.Is(err, identity.ErrDIDNotFound):
        // The DID itself doesn't exist. Likely permanent.
    default:
        return err
    }
    return err
}

// ident.Handle is either the verified handle or syntax.HandleInvalid.
// ident.PDSEndpoint() and ident.PublicKey() are ready to use.
```

## See also

- `syntax.md` — `ParseHandle` / `ParseDID` / `AllowedTLD`.
- `validation.md` — `Identity` helpers and the `HandleInvalid` lifecycle.
- `../shared/resolution-flow.md` — language-neutral sequence.
- `../shared/divergence-matrix.md` §concurrency-strategy — why Go's sequential DNS+HTTP differs from Rust and TypeScript.

# TypeScript — Resolving handles and DIDs

Resolution comes from `@atproto/identity` (Node-only) or from the `@atproto-labs/*` packages (isomorphic). Both surfaces agree on the data model but differ in transport and caching.

## `@atproto/identity` — Node resolver

### `IdResolver` (composite)

```ts
import { IdResolver } from "@atproto/identity";

const resolver = new IdResolver({
  plcUrl: "https://plc.directory",
  timeout: 3000,
  backupNameservers: ["1.1.1.1", "8.8.8.8"],
});

resolver.handle;  // HandleResolver
resolver.did;     // DidResolver
```

Instantiate once per process. The constructor sets up the in-memory LRU caches; re-creating the resolver flushes them.

### `HandleResolver`

```ts
const did = await resolver.handle.resolve("alice.bsky.social");
// did: string | undefined
```

Internals:

- Races `resolveDns(handle)` and `resolveHttp(handle)` via `Promise.race`. **First non-rejected value wins.** In practice, DNS usually returns first, so DNS is the effective authority.
- On race, the losing transport's failure is never observed — you don't get a `ConflictingDIDsFound`-style error even when DNS and HTTPS disagree. This is a spec-permitted policy ("prefer DNS" in effect).
- If both reject, `resolve` returns `undefined` (not `throw`). Check for `undefined` before using the result.
- `resolveDnsBackup(handle)` uses DoH against `backupNameservers` — called automatically if the primary DNS lookup fails.

**This is the biggest behavioural divergence from Rust.** The Rust crate uses strict-agreement (fail on disagreement). `@atproto/identity` uses race-and-accept. If you port a resolver between the two, the error surface will change.

### `DidResolver`

```ts
const doc = await resolver.did.resolve(did);                        // DidDocument | null
const doc = await resolver.did.ensureResolve(did);                  // throws DidNotFoundError if null
const data = await resolver.did.resolveAtprotoData(did);            // AtprotoData — always throws on missing
const key = await resolver.did.resolveAtprotoKey(did);              // string — the multibase signing key
const ok = await resolver.did.verifySignature(did, data, sig);      // boolean
```

Methods:

- `resolve(did)` dispatches on method. `did:plc:…` → `DidPlcResolver.resolve`; `did:web:…` → `DidWebResolver.resolve`. Everything else → `UnsupportedDidMethodError`.
- Returns the raw DID document. For the atproto-filtered view (`{did, signingKey, handle, pds}`), use `resolveAtprotoData`.
- Cached in-memory. `forceRefresh: true` bypasses the cache.

### `BaseResolver` methods (shared by plc / web resolvers)

If you're working at the method-specific layer:

```ts
import { DidPlcResolver, DidWebResolver } from "@atproto/identity";

const plc = new DidPlcResolver("https://plc.directory", 3000);
const web = new DidWebResolver(3000);
```

Both expose the same interface as `DidResolver` — `resolve`, `ensureResolve`, `resolveAtprotoData`, `resolveAtprotoKey`, `verifySignature`.

## `@atproto-labs/*` — isomorphic

When you can't depend on Node's `dns`:

### `DohHandleResolver`

```ts
import { DohHandleResolver } from "@atproto-labs/handle-resolver";

const r = new DohHandleResolver("https://cloudflare-dns.com/dns-query");
const did = await r.resolve("alice.bsky.social");
```

Single transport — DNS-over-HTTPS only. No HTTPS `/.well-known/atproto-did` fallback. You pay a correctness cost (can't catch bad DNS records vs broken web servers) for portability.

### `XrpcHandleResolver` / `AppViewHandleResolver`

```ts
import { AppViewHandleResolver } from "@atproto-labs/handle-resolver";
import { AtpBaseClient } from "@atproto/api";

const agent = new AtpBaseClient({ service: "https://public.api.bsky.app" });
const r = new AppViewHandleResolver({ api: agent.api });
const did = await r.resolve("alice.bsky.social");
```

Delegates handle resolution to an AppView via `com.atproto.identity.resolveHandle`. Cheapest option for browser clients already wired to an AppView — zero DNS code ships.

### `DidResolverCommon` + `DidResolverCached`

```ts
import { DidResolverCached, DidResolverCommon } from "@atproto-labs/did-resolver";

const inner = new DidResolverCommon({ plcUrl: "https://plc.directory" });
const cached = new DidResolverCached(inner, {/* maxSize, maxAge */});
const doc = await cached.resolve("did:plc:z3f…");
```

Composition is the point. Swap in a different inner resolver (e.g., one that fetches from a local mirror) without re-implementing the cache.

## Error types

From `@atproto/identity`:

```ts
import {
  DidNotFoundError,           // ensureResolve / resolveAtprotoData / resolveAtprotoKey couldn't find a document
  PoorlyFormattedDidError,    // DID string didn't parse
  UnsupportedDidMethodError,  // DID method not in { plc, web }
} from "@atproto/identity";

try {
  const data = await resolver.did.resolveAtprotoData(did);
} catch (err) {
  if (err instanceof DidNotFoundError)      { /* maybe retry */ }
  else if (err instanceof PoorlyFormattedDidError) { /* caller input bug */ }
  else if (err instanceof UnsupportedDidMethodError) { /* webvh, key, ion, etc. */ }
  else throw err;
}
```

Catch by `instanceof`, not by error-code string matching.

Handle-side resolution uses `undefined`, not a thrown error, for "no DID found". That's asymmetric with the DID-side; test for both patterns in your wrapper.

## End-to-end procedure (handle → AtprotoData)

```ts
import { IdResolver } from "@atproto/identity";
import {
  normalizeAndEnsureValidHandle,
  INVALID_HANDLE,
} from "@atproto/syntax";

const resolver = new IdResolver({ plcUrl: "https://plc.directory" });

async function lookup(raw: string) {
  let handle: string;
  try {
    handle = normalizeAndEnsureValidHandle(raw);
  } catch {
    return { displayHandle: INVALID_HANDLE, did: null, data: null };
  }

  const did = await resolver.handle.resolve(handle);
  if (!did) return { displayHandle: INVALID_HANDLE, did: null, data: null };

  let data;
  try {
    data = await resolver.did.resolveAtprotoData(did);
  } catch {
    return { displayHandle: INVALID_HANDLE, did, data: null };
  }

  // Bidi check — see validation.md
  const matches = data.handle.toLowerCase() === handle.toLowerCase();
  return {
    displayHandle: matches ? handle : INVALID_HANDLE,
    did,
    data,
  };
}
```

Points:

- `resolveAtprotoData` already returns `data.handle` — the document's claimed handle. The bidi check is a case-insensitive compare.
- `data.handle` is the first `at://` entry in `alsoKnownAs` (after stripping the prefix). If that entry is a different handle, bidi fails.
- Emit `INVALID_HANDLE` instead of the failing handle; don't throw.

## Caching

`IdResolver` (and both halves) ships LRU caches:

- Handle cache: 10-minute default TTL.
- DID document cache: 24-hour default TTL.

Configure via `IdResolver` constructor options (see package docs for current names). For diagnostic flows, call `resolve(did, /* forceRefresh */ true)`.

`@atproto-labs/did-resolver` uses `DidResolverCached` — explicit composition rather than baked-in. Prefer that when you want to plug your own cache (Redis, disk).

## Testing without the network

The cleanest injection point is the transport, not the resolver class. For `HandleResolver`, the easiest stub is a custom `dnsResolveTxt` implementation via the constructor options (check the package version). Alternatively, wrap `IdResolver` in a class you control and mock the wrapper.

For `@atproto-labs/handle-resolver`, the variants are already composable — `AppViewHandleResolver` accepts an `api` object that you can stub directly in tests.

## See also

- `syntax.md` — pre-flight validators.
- `validation.md` — post-fetch atproto shape and bidi checks.
- `../shared/resolution-flow.md` — language-neutral sequence.
- `../shared/divergence-matrix.md` §concurrency-strategy — why race vs strict-join matters.

# TypeScript — `@atproto/identity` and friends

The TypeScript identity-resolution surface is split across three Bluesky-maintained packages. Pick the right one for your runtime — a Node-only choice will explode in a browser bundle.

## Packages at a glance

| Package                              | Runtime target   | Purpose                                                            |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------ |
| `@atproto/syntax`                    | isomorphic       | Handle / DID / at-uri / NSID syntax validators. Pure, no I/O.      |
| `@atproto/identity`                  | **Node only**    | Full resolver: handle → DID, DID → DID document, signing-key helpers. Uses Node's `dns` module. |
| `@atproto-labs/handle-resolver`      | isomorphic       | Handle → DID, implementation-agnostic. Has browser-safe variants (DoH, XRPC). |
| `@atproto-labs/did-resolver`         | isomorphic       | DID → DID document, implementation-agnostic. |
| `@atproto-labs/identity-resolver`    | isomorphic       | The two above, composed. |

**If your code must run in a browser, do not import from `@atproto/identity`.** Its `HandleResolver` calls `dns.resolveTxt` from the Node standard library. Use `@atproto-labs/handle-resolver` with a `DohHandleResolver` or an XRPC-delegating resolver instead.

## Install

For a pure server-side resolver:

```bash
pnpm add @atproto/identity @atproto/syntax
```

For an isomorphic (browser + server) client:

```bash
pnpm add @atproto-labs/handle-resolver @atproto-labs/did-resolver @atproto/syntax
```

For validators only (no network):

```bash
pnpm add @atproto/syntax
```

## Module map (Node-side)

```
@atproto/identity
  ├─ IdResolver             // composite — HandleResolver + DidResolver
  ├─ HandleResolver         // resolveDns + resolveHttp race
  │    ├─ resolveDns(handle)        // Node dns.resolveTxt
  │    ├─ resolveHttp(handle)       // fetch /.well-known/atproto-did
  │    ├─ resolveDnsBackup(handle)  // DoH fallback via HTTP
  │    └─ resolve(handle)           // race of Dns + Http
  ├─ DidResolver            // composite — plc + web, caches in-memory
  │    ├─ resolve(did, forceRefresh?)
  │    ├─ ensureResolve(did, forceRefresh?)   // throws on missing
  │    ├─ resolveAtprotoData(did, forceRefresh?)  // AtprotoData
  │    ├─ resolveAtprotoKey(did, forceRefresh?)   // multikey only
  │    └─ verifySignature(did, data, sig)
  ├─ DidPlcResolver / DidWebResolver  // method-specific
  ├─ BaseResolver                     // shared cache + methods
  └─ errors: DidNotFoundError, PoorlyFormattedDidError, UnsupportedDidMethodError
```

```
@atproto/syntax
  ├─ ensureValidHandle(handle)        // throws on invalid
  ├─ ensureValidDid(did)
  ├─ ensureValidAtUri(uri)
  ├─ ensureValidNsid(nsid)
  ├─ isValidHandle(handle)            // boolean
  ├─ isValidDid(did)
  ├─ normalizeAndEnsureValidHandle(handle) // strip @, at://, lowercase, then validate
  └─ INVALID_HANDLE                    // "handle.invalid"
```

## Typical wiring (Node)

```ts
import { IdResolver } from "@atproto/identity";

const ids = new IdResolver({
  plcUrl: "https://plc.directory",
  timeout: 3000,   // ms, per transport
  // backupNameservers: ["1.1.1.1", "8.8.8.8"],  // for DoH fallback
});

const handle = "alice.bsky.social";
const did = await ids.handle.resolve(handle);  // "did:plc:..."
if (!did) throw new Error("did not found");

const data = await ids.did.resolveAtprotoData(did);
// { did, signingKey, handle, pds }
```

Key points:

- `IdResolver` composes `HandleResolver` + `DidResolver` and shares their configuration. Use it unless you explicitly need just one half.
- `did.resolveAtprotoData(did)` is the most convenient entry point — it returns a `{ did, signingKey, handle, pds }` tuple pulled from the DID document *after* applying atproto's shape rules (first `#atproto` Multikey, first `#atproto_pds` service, etc.).
- `timeout` is per-transport. The handle resolver races DNS and HTTP — the effective latency ceiling is still `timeout`, not `2 × timeout`.

## Typical wiring (isomorphic / browser)

```ts
import { DohHandleResolver } from "@atproto-labs/handle-resolver";
import { DidResolverCached, DidResolverCommon } from "@atproto-labs/did-resolver";

const handleResolver = new DohHandleResolver("https://cloudflare-dns.com/dns-query");
const didResolver = new DidResolverCached(new DidResolverCommon({ plcUrl: "https://plc.directory" }));

const did = await handleResolver.resolve("alice.bsky.social");
const doc = await didResolver.resolve(did!);
```

Points:

- `DohHandleResolver` uses DNS-over-HTTPS — safe in a browser because it's a `fetch` call.
- `XrpcHandleResolver` / `AppViewHandleResolver` (also in `@atproto-labs/handle-resolver`) delegate the whole handle-resolution step to an AppView via `com.atproto.identity.resolveHandle`, which is the usual approach in client apps that talk to an AppView anyway. Cheaper than bundling DNS logic client-side.

## Idioms

- **Classes, not free functions.** `@atproto/identity` is class-based; instances hold config + in-memory caches. Don't re-instantiate per request; hold one resolver for the lifetime of the process.
- **Resolution is async, all the way down.** There is no sync path to `AtprotoData` even when the cache is warm — the cache returns a Promise either way.
- **Errors are class instances.** Catch `DidNotFoundError`, `PoorlyFormattedDidError`, `UnsupportedDidMethodError` by `instanceof`. These are exported from `@atproto/identity`.
- **`did:webvh` is not supported.** Passing `did:webvh:…` to `DidResolver.resolve` throws `UnsupportedDidMethodError`. `@atproto/syntax.ensureValidDid` does accept webvh at the syntax level, but the resolver rejects it at fetch time. Wire in a third-party webvh resolver if you need it.
- **Bidirectional check is caller-owned.** Like the Rust crate, `@atproto/identity` gives you a verified DID document without asserting `also_known_as` contains your handle. The check is one line (see `validation.md`) — add it.
- **Browser-safe DNS requires DoH or delegation.** A handle-to-DID step from a browser is doable but must use `DohHandleResolver` or an XRPC resolver. The Node resolver will blow up on `dns` module imports when Webpack / Vite tries to bundle it.

## See also

- `syntax.md` — `@atproto/syntax` validators and how to compose them with `@atproto/identity`.
- `resolution.md` — `HandleResolver`, `DidResolver`, and the race / cache details.
- `validation.md` — `AtprotoData` fields, bidi check, `INVALID_HANDLE`.
- `../shared/handle-spec.md`, `../shared/did-spec.md` — normative rules.
- `../shared/divergence-matrix.md` — how this package diverges from the Rust and Go reference implementations.

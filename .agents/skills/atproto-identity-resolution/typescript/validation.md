# TypeScript — DID document validation and `AtprotoData`

`@atproto/identity` exposes a richer built-in DID-document filter than the Rust crate: `resolveAtprotoData` returns the atproto-specific fields directly, with the structural checks already applied. Your remaining job is the bidirectional handle check and the `INVALID_HANDLE` emission policy.

## The `AtprotoData` shape

```ts
import type { AtprotoData } from "@atproto/identity";

type AtprotoData = {
  did: string;        // always === the input DID
  signingKey: string; // did:key:… format — the #atproto Multikey
  handle: string;     // first at:// entry in alsoKnownAs, prefix stripped
  pds: string;        // #atproto_pds serviceEndpoint (https://host[:port])
};
```

This is produced by `DidResolver.resolveAtprotoData(did)`. It applies the atproto shape rules to a raw DID document:

- `signingKey` comes from the first `verificationMethod` with `id` ending `#atproto`, `type === "Multikey"`, `controller === did`, and a non-empty `publicKeyMultibase`. The raw multibase string is wrapped into `did:key:` form for you.
- `handle` comes from the first `alsoKnownAs` entry starting with `at://`, with the prefix stripped.
- `pds` comes from the first `service` entry with `id` ending `#atproto_pds`, `type === "AtprotoPersonalDataServer"`, and a valid `https://` endpoint.

If any piece is missing or malformed, `resolveAtprotoData` throws — you do not need to repeat those checks.

## Bidirectional handle check

Given a handle-origin resolution, the DID document must claim the handle back:

```ts
import type { AtprotoData } from "@atproto/identity";
import { INVALID_HANDLE } from "@atproto/syntax";

function verifyHandle(claimedHandle: string, data: AtprotoData): string {
  const ok = data.handle.toLowerCase() === claimedHandle.toLowerCase();
  return ok ? claimedHandle : INVALID_HANDLE;
}
```

Notes:

- Compare case-insensitively on the handle label. `data.handle` comes from the DID document, which may have mixed case even though atproto prefers lowercase — normalize both sides before compare.
- The check uses `data.handle` (the first at:// entry). If the DID document legitimately lists multiple at:// entries (an identity with multiple handles), this single check only catches the first one. For apps that need to accept *any* listed handle, iterate the raw document:

```ts
async function anyHandleMatches(did: string, claimed: string, resolver: IdResolver) {
  const doc = await resolver.did.ensureResolve(did);
  const normalized = claimed.toLowerCase();
  return (doc.alsoKnownAs ?? [])
    .filter((aka) => aka.startsWith("at://"))
    .some((aka) => aka.slice(5).toLowerCase() === normalized);
}
```

Single-handle is correct for the vast majority of accounts; multi-handle is a niche you only need to handle if your product supports it.

## `INVALID_HANDLE` emission policy

Emit `INVALID_HANDLE` when the failure is structural:

- `normalizeAndEnsureValidHandle` threw (handle syntax is invalid).
- `IdResolver.handle.resolve(h)` returned `undefined` after retries (no DID found).
- `resolveAtprotoData` threw with `DidNotFoundError` or a malformed document.
- Bidi check returned false.

Do **not** emit `INVALID_HANDLE` when the failure is transient:

- Network error on the DNS transport (still worth trying the HTTPS transport — `HandleResolver.resolve` already does this).
- `DohHandleResolver` timeout — retry.
- `BadResponseError` from a specific PDS — retry or mark the PDS for investigation, but don't latch `INVALID_HANDLE` on the identity.

Treat `INVALID_HANDLE` as a steady-state sentinel, not an error flag. Clients consuming your API should render it by hiding the handle ("?") rather than showing the literal string.

## Raw-document inspection

When you need the full document (for auditing, debugging, or non-atproto fields):

```ts
const doc = await resolver.did.ensureResolve(did);

// doc.id
// doc.alsoKnownAs
// doc.verificationMethod  — array of { id, type, controller, publicKeyMultibase? }
// doc.service              — array of { id, type, serviceEndpoint }
// doc["@context"]
```

Apply your own filters if the atproto shape isn't enough — for example, to pick up non-`#atproto` Multikeys for other services (labelers, feed generators).

## Signature verification

`@atproto/identity` ships the verifier wired to the atproto signing key:

```ts
const ok: boolean = await resolver.did.verifySignature(did, data, sig);
```

- `data` and `sig` are `Uint8Array`.
- Returns `false` on any cryptographic mismatch. Returns `true` only when the signature validates against the current `#atproto` key.

The DID document is fetched (or cached) internally. For high-volume verification, pre-warm the cache with `resolveAtprotoData`.

## `UnsupportedDidMethodError` cases

`@atproto/identity`'s `DidResolver` supports `did:plc` and `did:web`. Other methods (`did:webvh`, `did:key`, `did:ion`, …) throw `UnsupportedDidMethodError`. Catch it explicitly and map it to your user-facing error:

```ts
import { UnsupportedDidMethodError } from "@atproto/identity";

try {
  await resolver.did.resolveAtprotoData(did);
} catch (err) {
  if (err instanceof UnsupportedDidMethodError) {
    // For atproto purposes, this identity is unusable. Surface as handle.invalid
    // or a distinct error depending on your product.
  }
}
```

Do **not** silently fall back to treating a `did:webvh` as a `did:web` — that breaks webvh's integrity guarantee.

## Common mistakes

| Mistake                                                                      | Fix                                                                              |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Calling `resolveAtprotoData` and expecting `undefined` on missing            | It throws `DidNotFoundError`. Catch, don't check-for-null.                       |
| Calling `handle.resolve` and expecting a thrown error on missing             | It returns `undefined`. Null-check, don't catch.                                 |
| Hard-coding `"handle.invalid"`                                               | Import `INVALID_HANDLE` from `@atproto/syntax`.                                  |
| Skipping the bidi check because `resolveAtprotoData` succeeded               | It succeeds on any well-formed atproto-shaped document. Bidi is the only defence against impersonation. |
| Comparing `data.handle === claimedHandle` case-sensitively                   | Handles are case-insensitive. Lowercase both.                                    |
| Treating `UnsupportedDidMethodError` as transient                            | It's permanent for that identity under the current resolver. Don't retry. |
| Silent webvh → web fallback                                                  | `did:webvh` requires log verification. Let the error propagate.                  |

## See also

- `resolution.md` — how `AtprotoData` is produced.
- `syntax.md` — `INVALID_HANDLE` and the validators that gate this pipeline.
- `../shared/did-spec.md` — the normative field requirements `resolveAtprotoData` encodes.
- `../shared/divergence-matrix.md` §bidi-check — TS shares caller-owned bidi with Rust; Go differs.

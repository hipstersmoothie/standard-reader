# TypeScript — `@atproto/syntax` validators

`@atproto/syntax` is the pure, isomorphic, zero-I/O validator package. Bundle it into browsers and CLI tools without pulling in Node's `dns` module. Import it whenever you need to gate user input *before* you talk to the network.

## Functions

```ts
import {
  // handle
  ensureValidHandle,              // (handle: string) => void — throws on invalid
  isValidHandle,                  // (handle: string) => boolean
  normalizeAndEnsureValidHandle,  // (handle: string) => string — lowercases and returns
  INVALID_HANDLE,                 // "handle.invalid"

  // did
  ensureValidDid,                 // (did: string) => void
  isValidDid,                     // (did: string) => boolean

  // at-uri
  ensureValidAtUri,               // (uri: string) => void
  AtUri,                          // parse/construct class

  // nsid
  ensureValidNsid,                // (nsid: string) => void
  isValidNsid,                    // (nsid: string) => boolean

  // tid
  TID,                            // class — generate, parse, compare
} from "@atproto/syntax";
```

This skill covers the handle / DID validators. `AtUri`, `NSID`, and `TID` belong to the `atproto-lexicon` skill (see `atproto-lexicon/typescript/records.md`).

## Validating a handle

Two flavours — `ensure*` throws (good when you already trust the input is probably valid and want loud failure); `isValid*` returns a boolean (good for pre-submit form validation).

```ts
import { ensureValidHandle, isValidHandle, normalizeAndEnsureValidHandle } from "@atproto/syntax";

// Throws: `alice..bsky.social` has a double-dot
ensureValidHandle("alice..bsky.social");

// Returns `false` for the same input
isValidHandle("alice..bsky.social");

// Strips `@` / `at://`, lowercases, throws on invalid, returns the canonical form.
const h: string = normalizeAndEnsureValidHandle("@Alice.Bsky.Social");
// h === "alice.bsky.social"
```

Prefer `normalizeAndEnsureValidHandle` at the boundary — it's the one-liner that matches what atproto wants stored on the wire.

### Reserved TLDs

`@atproto/syntax` implements the full spec list — 9 reserved TLDs — and rejects them at validation time:

```
.alt, .arpa, .example, .internal, .invalid, .local, .localhost, .onion, .test
```

(`.test` is permitted in development-only tooling, but the validator rejects it in the default mode. If you want `.test` allowed for local fixtures, skip the validator for those cases rather than patching it.)

This is the only reference validator that ships complete TLD coverage. Rust covers 4 of 9; Go covers 8 of 9. See `../shared/divergence-matrix.md` §reserved-tlds.

## Validating a DID

```ts
ensureValidDid("did:plc:z3f2222fa222f5c33c2f27ez"); // ok
ensureValidDid("did:web:example.com");              // ok
ensureValidDid("did:webvh:QmFoo:example.com");      // ok at syntax layer
ensureValidDid("did:web:Example.COM");              // throws — DIDs are case-sensitive
```

`ensureValidDid` validates the generic DID grammar: `did:<method>:<id>` with method lowercase and id drawn from `[A-Za-z0-9._:%-]` with `%` only as percent-encoding. It does **not** enforce method-specific constraints — a 23-character `did:plc:…` passes the generic check even though it violates the PLC spec. `@atproto/identity`'s resolver applies method-specific validation later (at fetch time).

### Unsupported vs invalid

`@atproto/syntax.ensureValidDid` accepts `did:webvh:`, `did:key:`, and any other well-formed method. The resolver in `@atproto/identity` will throw `UnsupportedDidMethodError` for methods it doesn't fetch (see `resolution.md`). Distinguish the two layers in your error messages: "invalid DID string" is a syntax problem; "unsupported method" is a resolver-capability problem.

## `INVALID_HANDLE` sentinel

```ts
import { INVALID_HANDLE } from "@atproto/syntax";
// === "handle.invalid"
```

Use this constant — never the literal string. If the package changes the sentinel format (unlikely but possible), you inherit it. Reach for `INVALID_HANDLE` when:

- The bidirectional check (see `validation.md`) failed.
- Handle syntax was invalid upstream.
- Handle resolution returned no DID after retries.

Don't emit `INVALID_HANDLE` during transient network failures.

## Composition with `@atproto/identity`

```ts
import { ensureValidHandle, normalizeAndEnsureValidHandle, INVALID_HANDLE } from "@atproto/syntax";
import { IdResolver } from "@atproto/identity";

const resolver = new IdResolver({ plcUrl: "https://plc.directory" });

async function lookup(rawInput: string): Promise<{ did: string; handle: string }> {
  let handle: string;
  try {
    handle = normalizeAndEnsureValidHandle(rawInput);
  } catch {
    return { did: "", handle: INVALID_HANDLE };
  }

  const did = await resolver.handle.resolve(handle);
  if (!did) return { did: "", handle: INVALID_HANDLE };

  // bidi check — see validation.md
  return { did, handle };
}
```

The validator catches malformed input early; the resolver does the rest.

## Browser-safe usage

`@atproto/syntax` is pure TypeScript with no `dns` / `fs` / `node:crypto` imports. Tree-shake-friendly: only the imports you use ship in your bundle. Use it for client-side form validation and as a universal gate across your application.

## Common mistakes

| Mistake                                                         | Fix                                                                              |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Using `ensureValidHandle` without `normalizeAndEnsureValidHandle` | Strip `@` / `at://` and lowercase first, or call the `normalizeAnd…` helper.     |
| Relying on `ensureValidDid` to catch unsupported methods        | It doesn't — it only validates the generic grammar. Use `UnsupportedDidMethodError` from the resolver. |
| Hard-coding `"handle.invalid"` as a string literal              | Import `INVALID_HANDLE` from `@atproto/syntax`.                                  |
| Bundling `@atproto/identity` into a browser                     | It pulls in Node's `dns` module. Use `@atproto-labs/handle-resolver` + `@atproto/syntax` client-side. |

## See also

- `resolution.md` — the resolver that uses these validators.
- `validation.md` — post-resolution checks and the `INVALID_HANDLE` lifecycle.
- `../shared/handle-spec.md` — normative handle rules the validators enforce.
- `../shared/did-spec.md` — the generic DID grammar.

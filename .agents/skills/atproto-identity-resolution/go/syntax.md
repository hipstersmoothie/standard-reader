# Go — `atproto/syntax` validators

`github.com/bluesky-social/indigo/atproto/syntax` is the pure syntax layer. Every network-capable part of the ecosystem (`identity`, `repo`, XRPC servers) takes `syntax.Handle` / `syntax.DID` / `syntax.AtIdentifier` at its boundaries, not bare `string`s. Use these types from the start; don't round-trip through `string` in your data model.

## Types

```go
import "github.com/bluesky-social/indigo/atproto/syntax"

// All typed string aliases:
syntax.Handle          // validated via handleRegex
syntax.DID             // validated via didRegex (+ fast path for did:plc:…)
syntax.AtIdentifier    // union of Handle | DID
syntax.AtURI
syntax.NSID
syntax.TID
syntax.RecordKey
syntax.CID
syntax.Datetime

// Sentinel:
syntax.HandleInvalid   // = Handle("handle.invalid")
```

Below we cover handle, DID, and at-identifier — the rest belong to adjacent skills.

## Validating handles

```go
h, err := syntax.ParseHandle("alice.bsky.social")
if err != nil {
    // handle is syntactically invalid
}
```

Rules enforced:

- Max 253 characters total.
- Matches the regex `^([a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?\.)+[a-zA-Z]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$`. That's ≥2 labels, each 1–63 chars, no leading/trailing hyphen, final label starts with a letter.
- Preserves case — `ParseHandle("Alice.BSKY.Social")` succeeds and returns `"Alice.BSKY.Social"`. Call `.Normalize()` to lowercase.

`ParseHandle` does **not** strip `@` or `at://`. If your input may carry those prefixes, strip them first:

```go
raw = strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(raw), "at://"), "@")
h, err := syntax.ParseHandle(raw)
```

For fixture / test code, `syntax.MustParseHandle("alice.bsky.social")` panics on invalid input — never use it for live user data.

### `Normalize`, `IsInvalidHandle`

```go
h = h.Normalize()           // = syntax.Handle(strings.ToLower(string(h)))
if h.IsInvalidHandle() {    // == (h.Normalize() == syntax.HandleInvalid)
    // the special sentinel
}
```

Compare handles through `.Normalize()` on both sides; don't rely on case-sensitive equality.

### `AllowedTLD`

```go
if !h.AllowedTLD() {
    // rejected at the syntax layer
}
```

Rejects 8 reserved TLDs: `.local`, `.arpa`, `.invalid`, `.localhost`, `.internal`, `.example`, `.onion`, `.alt`.

`.test` is explicitly **permitted** by this function (comment in the source: "expected that '.test' domain resolution will fail in a real-world network"). If you want to reject `.test` in production environments, layer a check:

```go
if h.TLD() == "test" && !config.Dev {
    return ErrReservedTLD
}
```

The atproto spec lists 9 reserved TLDs; `AllowedTLD` covers 8 of them (everything but `.test`).

### `TLD`, `IsInvalidHandle`, string conversions

```go
h.TLD()        // final label, lowercase
h.String()     // the backing string
```

`Handle` implements `MarshalText` / `UnmarshalText` so it round-trips JSON through `ParseHandle`. Persist handles as this type in your structs, not as `string`.

## Validating DIDs

```go
did, err := syntax.ParseDID("did:plc:z3f2222fa222f5c33c2f27ez")
```

Rules:

- Max 2048 bytes.
- Regex: `^did:[a-z]+:[a-zA-Z0-9._:%-]*[a-zA-Z0-9._-]$`.
- `did:plc:…` has a fast-path (32-char length check, avoids the regex). Note this fast-path does **not** enforce the PLC base32 alphabet — it only checks that the suffix is alphanumeric ASCII, so a 24-character suffix with digits `0` or `1` or `8` or `9` would pass here but fail method-specific validation. The `identity` package accepts this because the PLC directory itself will reject malformed IDs at fetch time.

```go
did.Method()       // "plc", "web", "webvh", …  (lowercased)
did.Identifier()   // the part after the method
```

`ParseDID` accepts `did:webvh:…` at the syntax level. The `identity` resolver then returns `ErrDIDResolutionFailed` on a webvh fetch because the dispatch is `method == "plc" || method == "web"`.

## `AtIdentifier`

```go
atid, err := syntax.ParseAtIdentifier("alice.bsky.social")  // Handle branch
atid, err = syntax.ParseAtIdentifier("did:plc:z3f…")         // DID branch

h, err := atid.AsHandle()   // (Handle, error)
d, err := atid.AsDID()      // (DID, error)
```

This is the type the `identity.Directory.Lookup(ctx, AtIdentifier)` method takes — it lets callers pass either form and dispatches internally. Use this type whenever you accept a user-supplied identifier that may be either a handle or a DID.

## Normalization at the boundary

Pull the same normalization chain through every entry point:

```go
func parseInput(raw string) (syntax.AtIdentifier, error) {
    s := strings.TrimSpace(raw)
    s = strings.TrimPrefix(s, "at://")
    s = strings.TrimPrefix(s, "@")
    s = strings.TrimSpace(s)
    if s == "" {
        return "", errors.New("empty input")
    }
    return syntax.ParseAtIdentifier(s)
}
```

`ParseAtIdentifier` itself does **not** strip prefixes. Do it upstream.

## Common mistakes

| Mistake                                                              | Fix                                                                                  |
| -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Storing handles as plain `string`                                    | Use `syntax.Handle`; the type documents validation.                                  |
| Comparing handles without `.Normalize()`                             | Upper/mixed-case handles from user input will mismatch stored lowercase values.      |
| Relying on `AllowedTLD` to catch `.test`                             | It doesn't. Layer a product-specific check if you care.                              |
| Relying on `ParseDID` for method-specific validation                 | It only validates the generic grammar + PLC fast-path. PLC directory / webvh fetchers do the real check. |
| Calling `ParseHandle` on an input with `@` or `at://` prefix         | It fails. Strip the prefix first.                                                    |
| Using `MustParseHandle` on live user input                           | It panics. Reserve it for tests and fixtures.                                        |

## See also

- `resolution.md` — how these types flow through `ResolveHandle` / `LookupHandle`.
- `validation.md` — `HandleInvalid` lifecycle and the `Identity.DeclaredHandle` bidi check.
- `../shared/handle-spec.md` — normative rules.

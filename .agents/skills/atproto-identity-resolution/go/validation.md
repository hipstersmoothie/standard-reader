# Go — `Identity` validation and caller-owned extras

Unlike Rust (where the caller runs every structural and bidi check) and TypeScript (where `resolveAtprotoData` runs the structural check but the caller owns bidi), the Go `identity` package does **almost all the validation for you** — inside `ParseIdentity` and `LookupHandle` / `LookupDID`. This file documents what it already covers, and the narrow set of checks that remain caller-owned.

## The `Identity` struct

```go
import "github.com/bluesky-social/indigo/atproto/identity"

type Identity struct {
    DID         syntax.DID
    Handle      syntax.Handle
    AlsoKnownAs []string
    Services    map[string]ServiceEndpoint   // keyed by fragment: "atproto_pds" → {…}
    Keys        map[string]VerificationMethod // keyed by fragment: "atproto" → {…}
}

type ServiceEndpoint struct {
    Type string
    URL  string
}

type VerificationMethod struct {
    Type               string
    PublicKeyMultibase string
}
```

Key design choices:

- `Handle` is `syntax.Handle`, not a `string`. After a successful `LookupHandle`, it holds the verified handle. After a `LookupDID` with failed bidi, it holds `syntax.HandleInvalid`. Never trust a handle that hasn't passed through one of those two entry points.
- `Services` and `Keys` are **maps keyed by the DID-document ID fragment**, not by full ID. To get the PDS endpoint, look up the `"atproto_pds"` key. To get the atproto signing key, look up the `"atproto"` key.
- Maps do not preserve DID-document order — the struct doesn't round-trip byte-for-byte.

## `ParseIdentity` — the filter

`identity.ParseIdentity(doc *DIDDocument) Identity` is what `LookupHandle` / `LookupDID` call internally. It applies a narrow filter to the raw document:

1. For each `VerificationMethod`:
   - Split `ID` on `#`; skip if there's no fragment.
   - **Skip if `Controller != doc.DID.String()`.** Keys delegated to other DIDs are dropped.
   - First-write-wins on fragment collision (later duplicates ignored).
2. For each `Service`:
   - Split `ID` on `#`; skip if there's no fragment.
   - First-write-wins on fragment collision. **No controller check.**
3. `Handle` is always set to `syntax.HandleInvalid`. Callers must run a bidi check and latch the verified handle themselves — which is exactly what `LookupHandle` does.

Things `ParseIdentity` does **not** do:

- It does not verify `Type` matches atproto expectations (`Multikey` for keys, `AtprotoPersonalDataServer` for services). Those types end up in the struct as-is; it's your `PublicKey()` call that validates the type.
- It does not strip invalid `alsoKnownAs` entries — the slice is copied through verbatim.
- It does not validate PDS URLs. `url.Parse` runs only inside `GetServiceEndpoint`.

## Built-in bidi — don't re-implement it

`LookupHandle` does the bidi check *for you*:

```go
ident, err := dir.LookupHandle(ctx, handle)
// err == ErrHandleMismatch → bidi failed, no Identity returned
// err == nil → ident.Handle is the verified handle
```

`LookupDID` also does it, but soft-fails:

```go
ident, err := dir.LookupDID(ctx, did)
// err == nil, ident.Handle == syntax.HandleInvalid → bidi failed, Identity returned
// err == nil, ident.Handle == <handle> → bidi succeeded
```

Do not write a second bidi check on top of a resolved `Identity` — you'd be duplicating what the library already did, and you'd likely disagree on normalization edge cases.

The only time you add your own check is if you need **multi-handle** support. The built-in bidi uses `DeclaredHandle()`, which returns only the *first* `at://` entry in `alsoKnownAs`. If your product accepts any listed handle, scan the slice yourself:

```go
func matchesAnyDeclared(ident *identity.Identity, claimed syntax.Handle) bool {
    want := claimed.Normalize()
    for _, aka := range ident.AlsoKnownAs {
        if !strings.HasPrefix(aka, "at://") {
            continue
        }
        h, err := syntax.ParseHandle(aka[5:])
        if err != nil {
            continue
        }
        if h.Normalize() == want {
            return true
        }
    }
    return false
}
```

Single-handle is correct for the overwhelming majority of accounts; reach for this only if you know you need it.

## `Identity.DeclaredHandle`

```go
hdl, err := ident.DeclaredHandle()
// err == ErrHandleNotDeclared → no at:// entry, or none parseable as a handle
```

Walks `AlsoKnownAs` in order, returns the first `at://<handle>` where `ParseHandle` succeeds, normalized lowercase. Used by `LookupHandle` for bidi and by `LookupDID` for the soft-bidi attempt.

Use this when you need "the DID's primary claimed handle" regardless of whether bidi ran. Do not use it as a substitute for `Identity.Handle` in user-facing contexts — `DeclaredHandle` returns an *unverified* handle.

## `Identity.PDSEndpoint` and `GetServiceEndpoint`

```go
url := ident.PDSEndpoint()
// url == "" → no atproto_pds service, or URL failed to parse
```

`PDSEndpoint()` is `GetServiceEndpoint("atproto_pds")`. Returns `""` for both "no such service" and "URL unparseable" — the caller can't distinguish. If you need that distinction, index `ident.Services["atproto_pds"]` directly:

```go
svc, ok := ident.Services["atproto_pds"]
// ok == false → no service at this fragment
// svc.Type may be the wrong string — the library doesn't validate it
```

Note that `GetServiceEndpoint` validates URLs only by running `url.Parse` and discarding the result — any string that parses as a URL is accepted. It does **not** enforce `https://`, ban paths, or reject userinfo. If you accept this endpoint as a PDS for trust-sensitive operations (OAuth issuance, signature verification, record writes), layer your own check:

```go
func validatePDSEndpoint(raw string) error {
    u, err := url.Parse(raw)
    if err != nil {
        return err
    }
    if u.Scheme != "https" {
        return errors.New("PDS endpoint must be https")
    }
    if u.User != nil {
        return errors.New("PDS endpoint must not contain userinfo")
    }
    if u.RawQuery != "" || u.Fragment != "" {
        return errors.New("PDS endpoint must not have query or fragment")
    }
    return nil
}
```

## `Identity.PublicKey` and `GetPublicKey`

```go
import "github.com/bluesky-social/indigo/atproto/atcrypto"

key, err := ident.PublicKey()              // shorthand for GetPublicKey("atproto")
key, err = ident.GetPublicKey("atproto")   // explicit
```

`key` is `atcrypto.PublicKey` — an interface, not a struct. Supported verification-method types:

| `Type` field                         | Parse path                                              |
| ------------------------------------ | ------------------------------------------------------- |
| `Multikey`                           | `atcrypto.ParsePublicMultibase`                         |
| `EcdsaSecp256r1VerificationKey2019`  | base58 decode (after `z` prefix) → `ParsePublicUncompressedBytesP256` |
| `EcdsaSecp256k1VerificationKey2019`  | base58 decode (after `z` prefix) → `ParsePublicUncompressedBytesK256` |

Returns `ErrKeyNotDeclared` for missing fragment, a typed error for multibase decode failure, and a generic `unsupported atproto public key type` for anything else.

Modern atproto identities use `Multikey`; the 2019 variants exist for historical compatibility. Don't write code that assumes only `Multikey` — the library accepts either, and so should you.

## Reserved TLD gap (`.test`)

`syntax.Handle.AllowedTLD` rejects 8 of the 9 spec entries. `.test` is **permitted** — the comment in the source says "expected that '.test' domain resolution will fail in a real-world network". That's not always enough. If you want to reject `.test` in production:

```go
func validateHandleStrict(h syntax.Handle, allowTest bool) error {
    if !h.AllowedTLD() {
        return identity.ErrHandleReservedTLD
    }
    if !allowTest && h.TLD() == "test" {
        return identity.ErrHandleReservedTLD
    }
    return nil
}
```

Wire this into your input parser, not into the resolver — the resolver shouldn't know about your dev/prod split.

## What the caller still owns

| Concern                     | Caller's job? | Notes                                                     |
| --------------------------- | ------------- | --------------------------------------------------------- |
| Handle syntax validation    | No            | `syntax.ParseHandle` at the boundary.                     |
| Structural DID-doc check    | No            | `ParseIdentity` + `LookupHandle/LookupDID`.               |
| Bidi check                  | No (single-handle) | `LookupHandle` hard-fails; `LookupDID` soft-fails.   |
| Bidi check (multi-handle)   | Yes           | Scan `AlsoKnownAs` manually.                              |
| `.test` rejection in prod   | Yes           | `AllowedTLD` doesn't reject it.                           |
| HTTPS-only PDS enforcement  | Yes           | `GetServiceEndpoint` accepts any parseable URL.           |
| Non-atproto verification methods | Yes      | Use `ident.Keys[<fragment>]` directly.                    |
| Signature verification      | Yes           | `atcrypto` package, fed from `ident.PublicKey()`.         |
| `handle.invalid` UI         | Yes           | Render as "(handle unverified)" or hide, don't show literal. |

## `handle.invalid` lifecycle

`LookupDID` latches `syntax.HandleInvalid` when:

- The DID document has no `at://` entry (`DeclaredHandle` returns `ErrHandleNotDeclared`).
- The claimed handle resolves back to a different DID.
- The claimed handle fails to resolve at all (transient or permanent).
- `SkipHandleVerification` is set on the `BaseDirectory`.

`LookupHandle` never returns an `Identity` with `HandleInvalid` — bidi failure becomes `ErrHandleMismatch` instead. If your code branches on `ident.Handle.IsInvalidHandle()`, that branch only fires for DID-first lookups.

When rendering: treat `HandleInvalid` as "the account exists but the handle is unverifiable right now." The DID is still valid and the PDS is still callable.

## Signature verification (pointer, not procedure)

Wiring `Identity` into signature verification:

```go
key, err := ident.PublicKey()
if err != nil {
    return err
}
if err := key.HashAndVerify(msg, sig); err != nil {
    return err   // signature invalid
}
```

`HashAndVerify` is on `atcrypto.PublicKey`. For details on signing-algorithm selection, key rotation, and how this interacts with OAuth token issuance, see the `atproto-oauth` skill.

## See also

- `resolution.md` — `LookupHandle` / `LookupDID` and when each latches `HandleInvalid`.
- `syntax.md` — `syntax.Handle.AllowedTLD` and the reserved-TLD gap.
- `../shared/did-spec.md` — the normative field requirements the library encodes.
- `../shared/divergence-matrix.md` §bidi-check — why Go's built-in bidi differs from Rust and TypeScript.

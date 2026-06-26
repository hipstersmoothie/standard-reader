# Divergence matrix — Rust / TypeScript / Go

High-frequency cross-language differences when authoring lexicons, validating records, or invoking XRPC. The rules are the same; the idioms and strictness defaults differ.

Full per-language detail in the `{lang}/` guides. This file is the **pivot** — consult when porting between languages or debugging interop.

## 1. Library choice and authority

| Concern                         | Rust                                                              | TypeScript                                   | Go                                                          |
| ------------------------------- | ----------------------------------------------------------------- | -------------------------------------------- | ----------------------------------------------------------- |
| Lexicon model + validation      | `atproto-lexicon` (`BaseCatalog`, `validate_record`)              | `@atproto/lexicon` (`Lexicons`)              | `indigo/atproto/lexicon` (`BaseCatalog`, `ValidateRecord`)  |
| Record data model               | `atproto-lexicon::validation::{DataValue, Blob, CIDLink, Bytes}`  | `@atproto/lexicon` + `@atproto/api` types    | `indigo/atproto/data` + `indigo/lex/util` (two parallel stacks) |
| XRPC client                     | `atproto-client` (`Auth::{None,DPoP,AppPassword}`)                | `@atproto/xrpc` (`XrpcClient`), `@atproto/api` (`AtpAgent`) | `indigo/xrpc` (`Client`) + generated `api/atproto` |
| XRPC server                     | `atproto-xrpcs`                                                   | `@atproto/xrpc-server`                       | hand-rolled (e.g. `net/http` + `xrpc`)                      |
| Subscription / firehose         | `atproto-jetstream`                                               | `@atproto/xrpc-server` (`Subscription`, `Frame`) | `indigo/events` (`HandleRepoStream`, schedulers)        |
| Codegen                         | none standard; hand-roll or use community tooling                 | `@atproto/lex-cli` (`gen-api`, `gen-server`) | `indigo/cmd/lexgen` + `cbor-gen`                            |

## 2. Validation defaults

| Behavior                            | Rust                                           | TypeScript                                            | Go                                                |
| ----------------------------------- | ---------------------------------------------- | ----------------------------------------------------- | ------------------------------------------------- |
| Strict by default on unknown fields | yes (rejects)                                  | yes for closed objects; open objects allow extras     | strict on write, lenient on read (opt-in `ValidateFlags`) |
| Legacy blob acceptance              | behind `ValidateFlags::ALLOW_LEGACY_BLOB`      | legacy form raises `ValidationError` unless pre-shimmed | behind `ValidateFlags::AllowLegacyBlob`         |
| Datetime strictness                 | behind `ValidateFlags::ALLOW_LENIENT_DATETIME` | accepts RFC 3339 variants by default                  | behind `ValidateFlags::AllowLenientDatetime`      |
| Unknown `$type` on closed union     | rejects                                        | rejects                                               | rejects                                           |
| Unknown `$type` on open union       | passes through                                 | passes through                                        | passes through                                    |
| Recursive validation inside `unknown`| no by default                                 | no                                                    | opt-in via `StrictRecursiveValidation`            |

## 3. Mutation vs. immutability

- **TypeScript** `Lexicons` is mutable — `lex.add(doc)` modifies in place.
- **Rust** `BaseCatalog` builds via `.add_schema(...)` calls on a mutable `&mut self`.
- **Go** `BaseCatalog.LoadDirectory` / `AddSchemaFile` is mutation; idiomatic usage loads once at startup.

All three are usually shared across a process and not cloned per-request. The TS `Lexicons` reference is passed by value into `XrpcClient` constructor; Rust and Go pass the catalog by reference through the API surface.

## 4. Blob shape divergence (Go in particular)

Go maintains **two parallel data-model stacks**:

- Modern `atproto/data`: `Blob{Ref CIDLink; MimeType string; Size int64}`. Used by the validator and by schema-agnostic code.
- Legacy `lex/util`: `LexBlob{Ref LexLink; MimeType string; Size int64}`. Still emitted by `cmd/lexgen` generated code.

Anything imported from `api/atproto` touches `lex/util.LexBlob`. Runtime values crossing library boundaries often need conversion. Rust and TypeScript do not have this split.

## 5. `BlobRef` class vs. plain object (TypeScript)

`@atproto/lexicon`'s `BlobRef` is a **class instance**, not a plain object. `assertValidRecord` on a plain-object blob throws `ValidationError`. When hand-constructing records in TS, use `new BlobRef(cid, mimeType, size)`.

Rust's `Blob` and Go's `Blob` are plain structs. Cross-language JSON interchange is fine; cross-language in-memory interchange across FFI is not a real scenario, but a TS consumer of a JSON string produced by Rust must call `BlobRef.fromLex` (or equivalent) to wrap.

## 6. Generated-code presence

- **TypeScript:** Bluesky ships `@atproto/api` with generated wrappers for every `com.atproto.*` and `app.bsky.*` NSID. `@atproto/lex-cli` regenerates for your lexicons.
- **Go:** `indigo/api/atproto` and `indigo/api/bsky` are generated. `cmd/lexgen` regenerates for your lexicons. `api/agnostic` is the schema-agnostic escape hatch (same signatures, `Value` is `*json.RawMessage`).
- **Rust:** no standard codegen. Practitioners use `atproto-client::com::atproto::repo::*` hand-written helpers and the agnostic `DataValue` model. Community codegen projects exist but are not canonical.

## 7. Subscription / firehose API shape

| Concern                           | Rust                                       | TypeScript                                               | Go                                                        |
| --------------------------------- | ------------------------------------------ | -------------------------------------------------------- | --------------------------------------------------------- |
| Frame decoding                    | `atproto-jetstream` or manual DAG-CBOR     | `@atproto/xrpc-server::Frame, MessageFrame, ErrorFrame`  | `events.HandleRepoStream` hides framing                   |
| Event dispatch                    | callback-per-type                          | async iterator                                           | `RepoStreamCallbacks` struct + `Scheduler`                |
| Backpressure                      | caller builds                              | caller builds (async iterator)                           | built-in schedulers: `sequential`, `parallel`, `autoscaling` |
| Hidden pitfall                    | —                                          | `Subscription` export location has moved between releases | heavy work in callback vs. scheduled handler             |

## 8. `xrpc.Client.Do` parameter order (Go-specific)

`(ctx, kind, inpenc, method, params, body, out)` — unusual ordering. `kind` is `xrpc.Query`/`xrpc.Procedure` (string constants `"GET"`/`"POST"`); `inpenc` is request content-type; `method` is the NSID. Easy to invert `method` and `kind` on first use.

Rust and TypeScript both take `(nsid, params, input?, opts?)` with consistent argument roles.

## 9. Error handling shape

| Language   | Error shape                                                     |
| ---------- | --------------------------------------------------------------- |
| Rust       | `DataValidationError` (enum variants), `atproto_client::Error`  |
| TypeScript | `ValidationError` (throws), `XRPCError { status, error, message }`, `XRPCInvalidResponseError` |
| Go         | `error` with `errors.Is/As`; `*xrpc.Error` has `.IsThrottled()`, `.Ratelimit` |

Custom error names declared in a lexicon's `errors` array:

- **TS (generated):** statically-typed literal union.
- **Go (generated):** string comparison on `xrpc.Error.Error`.
- **Rust:** string comparison on an error-body field.

## 10. `$type` omission from sub-objects

Only **records** require `$type`. Sub-objects (fields inside a record whose schema is a plain `object`, not a union) do **not** require `$type`. Lenient implementations (Go, TS) ignore an unexpected `$type` on such objects; Rust's strict path rejects it unless a matching union is in scope. Spec does not mandate either behavior.

## 11. Schema-agnostic record access

Often you need to get a record out of a PDS whose lexicon you don't have loaded:

- **Go:** `api/agnostic.RepoGetRecord(...)` — `Value` is `*json.RawMessage`. Idiomatic.
- **TypeScript:** call `XrpcClient` without a matching lexicon — the result is untyped `data`. `@atproto/lexicon` can still validate if you pass the lexicon separately.
- **Rust:** `atproto_client::com::atproto::repo::get_record(...)` returns `GetRecordResponse::Record { value: serde_json::Value, .. }`. Decode into `DataValue` or a custom struct.

## 12. When porting: canonical checks

1. Byte-for-byte DAG-CBOR round trip of the `shared/test-vectors.md` fixtures.
2. strongRef's `cid` must encode as **string** (CBOR major 3), not tag 42.
3. Open-vs-closed union behavior on unknown `$type` — opposite outcomes must match across languages.
4. Legacy-blob acceptance must be opt-in in all three.
5. Subscription frame pair ordering (header then body) and `op` values (`1` / `-1`).

## See also

- `lexicon-spec.md`, `record-model.md`, `xrpc-wire.md`, `backward-compat.md`, `test-vectors.md` — normative rules these differences implement.
- `../rust/README.md`, `../typescript/README.md`, `../go/README.md` — per-language setup.

# Backward compatibility — change matrix

Source: https://atproto.com/specs/lexicon#versioning-and-breaking-changes (spec section is brief; this matrix is community consensus extending it).

This file is the authoritative reference for "will this change break existing clients?". Use it when reviewing lexicon edits, stamping `revision`, or planning a rollout.

## 1. The matrix

| Change                                                           | Breaking? |
| ---------------------------------------------------------------- | --------- |
| **Fields — adding**                                              |           |
| Add required field                                               | BREAKING  |
| Add optional field                                               | non-breaking *(see §2 strict decoders)* |
| **Fields — removing**                                            |           |
| Remove field (any kind)                                          | BREAKING  |
| Rename field                                                     | BREAKING (remove + add) |
| **Fields — mutating**                                            |           |
| Change field `type`                                              | BREAKING  |
| Make optional field required                                     | BREAKING  |
| Make required field optional                                     | non-breaking |
| Add a field to `nullable`                                        | non-breaking |
| Remove a field from `nullable`                                   | BREAKING (writers may have been emitting `null`) |
| **Constraints**                                                  |           |
| Tighten (`maxLength` down, `minimum` up, shorter `maxGraphemes`) | BREAKING  |
| Loosen (`maxLength` up, `minimum` down, longer `maxGraphemes`)   | non-breaking |
| Add `format` to an existing `string`                             | BREAKING (existing valid strings may no longer match) |
| Remove `format`                                                  | non-breaking |
| **Enums and knownValues**                                        |           |
| Add value to `knownValues` (open)                                | non-breaking |
| Remove value from `knownValues`                                  | non-breaking (list is informational) |
| Add value to `enum` (closed)                                     | BREAKING  |
| Remove value from `enum`                                         | BREAKING  |
| Replace `knownValues` with `enum`                                | BREAKING (tightens to closed) |
| Replace `enum` with `knownValues`                                | non-breaking (loosens to open) |
| **Unions**                                                       |           |
| Add `ref` to open union (`closed: false` or omitted)             | non-breaking |
| Add `ref` to closed union                                        | BREAKING  |
| Remove `ref` from any union                                      | BREAKING  |
| Flip `closed: false` → `closed: true`                            | BREAKING  |
| Flip `closed: true` → `closed: false`                            | non-breaking |
| **Methods**                                                      |           |
| Add new method (new NSID)                                        | non-breaking |
| Remove method                                                    | BREAKING  |
| Change method from `query` ↔ `procedure`                         | BREAKING (HTTP verb changes) |
| Add parameter to `parameters` (required)                         | BREAKING  |
| Add parameter to `parameters` (optional)                         | non-breaking |
| Add new error name to `errors`                                   | non-breaking (clients tolerate unknown) |
| Remove declared error name                                       | non-breaking on the wire; **breaking** for clients that switch on it |
| **Records**                                                      |           |
| Change `record.key` format                                       | BREAKING (existing keys no longer match) |
| Change `$type` (rename the lexicon or the def)                   | BREAKING (consumer dispatch fails) |
| Add new `record` lexicon (new NSID)                              | non-breaking |

## 2. Strict decoders and "add optional field"

The matrix above assumes **lenient decoders that preserve unknown fields**. If a decoder is strict and rejects unknown keys — which some implementations are at write time — "add optional field" becomes breaking in practice: old writers that don't know about the new field produce records the new validator… still accepts (omitting a non-required field is fine). But old **readers** that strictly reject unknown keys will fail on new records.

Rule of thumb for publishers: treat strict-reader breakage as a client bug you still must communicate. Add optional fields in announced revisions and give consumers a window to upgrade.

## 3. Error handling is forward-compat by contract

Clients **must** tolerate unknown `error` names (§`xrpc-wire.md §5`). Treat an unknown error name as a generic error at its HTTP status. This is what makes "add new error name" non-breaking.

Server-side: if you remove a declared error name, you don't stop clients from continuing to expect it — but they won't see it, so their branches become dead code, not runtime errors.

## 4. Stamping `revision`

The top-level `revision` field is a monotonic integer. Conventional practice:

- Bump on any change, breaking or not.
- Non-breaking changes across revisions are safe to deploy incrementally.
- Breaking changes should be announced and, if possible, scheduled against a new NSID (`com.example.foo.v2`) rather than mutating the existing lexicon.

The spec does not enforce `revision`. It is a social signal.

## 5. Anti-patterns to flag in review

- **Adding a required field without a new NSID.** Plan a deprecation cycle or mint a v2.
- **Tightening `maxLength`.** Always breaking. If the data that needs trimming exists already, you have a migration problem that a schema edit can't solve.
- **Switching `knownValues` to `enum`.** Almost always a mistake — the open-vs-closed semantics matter more than they look.
- **Removing an `errors` entry because it "no longer happens".** Leave it; clients may still branch on it. Costs nothing to keep.
- **Renaming the `main` def.** Breaks every consumer using the fragment-less form. Mint a new lexicon if the semantic changed.

## 6. See also

- `lexicon-spec.md` — the def types these rules apply to.
- `xrpc-wire.md` — error response shape and `error` name handling.
- `divergence-matrix.md` — how each language's validator surfaces breakage.

# Revisions and backward compatibility

How to version a published lexicon. Short answer: integer `revision`, monotonic, bumped on every publish, breaking changes discouraged — mint a new NSID instead.

## The `revision` field

- Integer, top-level on the lexicon document (so also top-level on the `com.atproto.lexicon.schema` record).
- Starts at `1` on first publish (or omitted — equivalent). Bump by 1 on every subsequent publish.
- **Monotonic.** Lowering it confuses consumer caches; reusing it means consumers may not see your update.
- **Not semver.** There is no "major/minor/patch". Both breaking and non-breaking changes share one counter.
- Not enforced by the PDS. A pure social signal. A consumer that trusts `revision` as monotonic can short-circuit re-fetches when their cached copy's `revision` >= the served one; a consumer that doesn't trust it will always refetch.

## Non-breaking vs breaking — the matrix

Use the authoritative matrix in `skills/atproto-lexicon/shared/backward-compat.md`. It covers every change kind (add/remove/mutate field, tighten/loosen constraints, open/closed unions, method parameter changes, etc.).

Summary of the common cases for lexicon publishers:

| Change                                 | Breaking? | Publish approach                |
| -------------------------------------- | --------- | ------------------------------- |
| Add optional field                     | no        | Bump `revision`, publish        |
| Add required field                     | yes       | Mint new NSID (`*V2`)            |
| Remove any field                       | yes       | Mint new NSID                    |
| Tighten constraint (shorter maxLength) | yes       | Mint new NSID                    |
| Loosen constraint                      | no        | Bump `revision`, publish         |
| Add value to open `knownValues`        | no        | Bump `revision`, publish         |
| Add value to closed `enum`             | yes       | Mint new NSID                    |
| Add new def (not `main`)               | no        | Bump `revision`, publish         |
| Rename `main`                          | yes       | Mint new NSID (conceptual break) |

"Mint new NSID" does not mean abandon the old one. Publish the new NSID at its own rkey (e.g. `com.example.foo.getBarV2`), keep the old one alive for consumers who haven't migrated, and deprecate via documentation or a `description` field.

## Running the check before publish

Always run `lexicon-garden.check_compatibility(old_doc, new_doc)` before incrementing `revision`:

```
old = get_record(at://<did>/com.atproto.lexicon.schema/<nsid>).value
new = <the doc you're about to publish>
report = check_compatibility(old, new)
```

If `report` flags breaks:

- **Stop.** Do not bump `revision` and publish.
- Decide: is this break necessary? If yes, mint a new NSID. If no (accidental), fix the new doc to be compatible.
- If the user insists on a breaking revision bump — document it. Do not do it silently. Consumers relying on the previous shape will start failing without warning, because there's no error signal at the record layer; they'll just start validating records against a schema that no longer matches what producers send.

## Deprecation without breaking

To signal "please stop using this, switch to the new one":

- Leave the old lexicon published and functional.
- Add a `description` mentioning the new NSID and the deprecation.
- Optionally bump `revision` to make the deprecation notice visible to cached consumers.
- Do not delete the old record until you're confident no consumers still resolve it. Deletion is soft breakage — consumers with stale CIDs keep working against the old definition until they try to re-resolve.

## Rolling forward consumers

Consumers generally don't cache lexicons forever — they refetch on startup, on a timer, or on explicit invalidation. A typical rollout of a non-breaking change:

1. Author and validate locally.
2. Publish with bumped `revision`.
3. Within minutes, `describe_lexicon` returns the new document to consumers who refetch.
4. Long-running consumers pick it up on their next cache-bust.

For a non-breaking change, this is fully transparent. For a breaking change *at a new NSID*, existing consumers simply don't see it; they keep using the old NSID. Migration is opt-in on their side.

## Anti-patterns

- **Reusing or lowering `revision`.** Either breaks consumer caches or signals nothing changed when something did.
- **Breaking changes under the same NSID.** The protocol permits it, but it's silent breakage for consumers.
- **Semver in `description`.** If you must carry marketing-facing version strings, use `description`; do not repurpose `revision` as the minor/patch half of a semver.
- **Deleting a lexicon instead of deprecating.** A delete removes the record but doesn't invalidate cached CIDs; it just makes the chain unresolvable for anyone who needs to refetch. Prefer deprecation notices and new NSIDs.

## See also

- `skills/atproto-lexicon/shared/backward-compat.md` — full matrix of breaking vs non-breaking changes.
- `record-shape.md` — `revision` as a record field.
- `authority-and-ownership.md` — why new-NSID strategies still work within the same authority.

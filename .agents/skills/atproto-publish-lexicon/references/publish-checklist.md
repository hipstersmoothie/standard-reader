# Publish pre-flight checklist

Walk through this list before every `putRecord` on `com.atproto.lexicon.schema`. Each item maps to a failure mode observed in practice.

## Document shape

- [ ] `$type` is exactly `com.atproto.lexicon.schema`.
- [ ] `lexicon` is `1` (integer, not string).
- [ ] `id` is a well-formed NSID (matches the grammar in `skills/atproto-lexicon/shared/nsid.md`).
- [ ] `id` **exactly equals** the rkey you're about to use. No casing differences, no trailing characters.
- [ ] `defs` is an object.
- [ ] If the NSID names a `record`/`query`/`procedure`/`subscription`, `defs.main` exists with matching `type`.
- [ ] No stray top-level fields not in {`$type`, `lexicon`, `id`, `revision`, `description`, `defs`}.

## Validation

- [ ] `lexicon-garden.validate_lexicon(doc)` or `atpmcp.validate_lexicon_schema(doc)` returns no errors.
- [ ] All internal `#ref`s resolve within `defs` (or to other published lexicons).
- [ ] No warnings about unknown def types or malformed constraints.

## Authority

- [ ] Authority domain correctly derived from the NSID (reverse all segments except the final name segment).
- [ ] DNS `_lexicon.<authority>` TXT exists and contains `did=<did>`.
- [ ] That DID equals the DID you're publishing from.
- [ ] Exactly one `did=` entry in the TXT — no conflicting records.

If any of the above fails, **do not publish**. A publish under the wrong authority is a silent no-op: it succeeds on your PDS and is invisible to consumers.

## Prior version

- [ ] Fetched any existing record at `at://<did>/com.atproto.lexicon.schema/<nsid>`.
- [ ] If present: `check_compatibility(old, new)` returns no breaking changes, OR you've explicitly decided to mint a new NSID instead.
- [ ] `revision` is `old.revision + 1` (or `1` if first publish).
- [ ] `revision` has not been reused or lowered.

## CID sanity

- [ ] `create_record_cid(record)` returns a CID that round-trips through DRISL canonical encoding.
- [ ] If you computed a CID locally in your SDK, it matches the MCP tool's output.

## XRPC call

- [ ] Using `putRecord` (preferred) or `createRecord` (first-publish only).
- [ ] `collection = com.atproto.lexicon.schema`.
- [ ] `rkey = <the full NSID, verbatim>`.
- [ ] `validate: true`.
- [ ] Authenticated with credentials for the publishing DID.

## Post-publish verification

- [ ] `getRecord` on the same `(repo, collection, rkey)` returns the record.
- [ ] Returned `cid` matches the CID from the sanity check.
- [ ] `lexicon-garden.describe_lexicon(<nsid>)` returns the record (resolves via the full chain). If this fails but `getRecord` works, re-check the authority TXT.

## Failure modes this checklist prevents

| Symptom                                                       | Item that would have caught it |
| ------------------------------------------------------------- | ------------------------------ |
| PDS rejects with "id does not match rkey"                     | Document shape — `id == rkey`  |
| PDS rejects with "InvalidRecord"                              | Validation                     |
| Publish succeeds, `describe_lexicon` returns 404              | Authority                      |
| Consumer hits stale schema after update                       | Prior version — `revision` bump |
| Downstream breakage reported days after publish               | Prior version — `check_compatibility` |
| CID mismatch between what you announced and what PDS computed | CID sanity                     |
| `createRecord` fails with conflict on second publish          | XRPC call — use `putRecord`    |

## See also

- Main `SKILL.md` procedure — the narrative version of this checklist.
- `record-shape.md` — field-by-field rules the PDS enforces.
- `authority-and-ownership.md` — why authority check is non-negotiable.

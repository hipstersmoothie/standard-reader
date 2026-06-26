---
name: atproto-publish-lexicon
description: This skill should be used when the user is publishing an AT Protocol lexicon as a `com.atproto.lexicon.schema` record on the network, or resolving such a record back to a lexicon document. Triggers on phrases like "publish my lexicon", "publish lexicon to PDS", "lexicon publication", "lexicon registry", "schema registry", "who owns this NSID", "NSID authority", "`_lexicon.` TXT record", "lexicon DNS record", "lexicon resolution", "resolve an NSID to a lexicon", "describe_lexicon", "`com.atproto.lexicon.schema`", "putRecord lexicon", "createRecord lexicon", "lexicon revision", "lexicon versioning", "publish NSID", "how do clients fetch my lexicon", "rkey is the NSID". Also covers error surfaces like "InvalidRecord" when publishing a lexicon, the `rkey = <full NSID>` convention, and the authority-to-DID binding that gates resolution at consumer time. Uses the `lexicon-garden` and `atpmcp` MCP tools (`validate_lexicon`, `check_compatibility`, `create_record_cid`, `invoke_xrpc`, `describe_lexicon`, `get_record`) rather than hand-rolled validators. Does NOT cover authoring the lexicon JSON document, catalog loading, codegen, or client-side record/XRPC validation (see `atproto-lexicon`); DID/handle resolution internals or the `_atproto.` TXT record (see `atproto-identity-resolution`); CAR/MST/commit signing (see `atproto-repository`); CID computation internals (see `atproto-cid`); or Bluesky-domain (`app.bsky.*`) lexicons (out of scope for this plugin).
version: 0.1.0
---

# AT Protocol Lexicon Publication

A lexicon isn't published until it's a record. This skill covers the protocol-level workflow that takes a validated lexicon JSON document, wraps it as a `com.atproto.lexicon.schema` record, writes it to the authoring DID's repo, and makes it resolvable by NSID. The inverse — consumers resolving an NSID back to a lexicon — is the other half.

Authoring the JSON document itself is the sibling skill `atproto-lexicon`'s job. This skill starts the moment you're ready to put that document on the network.

## When to use

- The user is publishing a new lexicon or a revision to an existing one (`putRecord` / `createRecord` on `com.atproto.lexicon.schema`).
- The user is debugging why their published lexicon doesn't resolve — authority mismatch, missing `_lexicon.` TXT, wrong rkey.
- The user is consuming a lexicon by NSID at runtime and wants to understand the resolution chain (NSID → authority → DNS → DID → PDS → record).
- The user is planning a breaking change and needs to know how `revision` and the authority model interact.

## What this skill provides

- A **publish pipeline**: form the record, validate, check authority, diff against any prior revision, compute the CID, publish, verify.
- The **`com.atproto.lexicon.schema` record shape** — what's top-level, what `id` must equal, what `lexicon: 1` means.
- The **resolution flow** for consumers: reverse-DNS the NSID, look up `_lexicon.<authority>` TXT, resolve the DID, fetch the record.
- The **authority model**: who's allowed to publish under which NSID prefix, and why the PDS doesn't enforce it.
- **Revision discipline**: monotonic integers, no semver, how to gate breaking changes.

Detail lives in `references/`; this file is the procedure.

## Procedure

Follow these steps in order. Skipping authority or compatibility checks is how lexicons ship broken.

1. **Form the record.** A `com.atproto.lexicon.schema` record is the lexicon document with a `$type` stamped on top. Top-level fields:
   - `$type`: `com.atproto.lexicon.schema` (required)
   - `lexicon`: `1` — the lexicon *language* version, fixed at 1 today (not a semver of your doc)
   - `id`: the NSID, e.g. `com.example.foo.getBar` — **MUST equal the rkey you'll publish under**
   - `revision`: optional integer; omit for the first publish, bump monotonically thereafter
   - `description`: optional top-level string
   - `defs`: the map of definition names to def objects (`main`, plus any secondary defs)

   See `references/record-shape.md` for a field-by-field breakdown and a canonical example.

2. **Validate the lexicon body.** Call one of:
   - `lexicon-garden.validate_lexicon(doc)` — spec-conformant validator, remote.
   - `atpmcp.validate_lexicon_schema(doc)` — local equivalent.

   Fix every error before touching the network. A malformed `defs` map, an unresolvable internal `#ref`, or a missing `main` when the NSID names a `record`/`query`/`procedure`/`subscription` will all be rejected here. Don't paper over warnings — publishing a broken lexicon is worse than not publishing at all, because other actors may cache the CID.

3. **Check authority.** Derive the authority domain from the NSID by reversing the first segments *except* the final name segment:
   - `com.example.foo.getBar` → authority = `example.com`
   - `app.bsky.feed.post` → authority = `bsky.app`
   - `social.pdsls.tools.listBookmarks` → authority = `pdsls.social` (final segment is the name; everything before it reverses to the domain)

   Then:
   - Query the DNS `_lexicon.<authority>` TXT record. It contains `did=did:plc:...` (or any DID method).
   - That DID is the only one whose publications under this NSID prefix will be honored by consumers.
   - The DID the user is publishing *from* must match. If it doesn't, stop — the publish will succeed on their PDS but silently no-op at resolution time.

   For resolving the DID itself to a PDS endpoint, defer to `atproto-identity-resolution`. See `references/authority-and-ownership.md` for the squatting model and edge cases.

4. **Check for a prior version.** Fetch the current on-network record, if any:
   - `atpmcp.get_record(at://<publisher-did>/com.atproto.lexicon.schema/<nsid>)`, or
   - `atpmcp.invoke_xrpc("com.atproto.repo.getRecord", {repo: <did>, collection: "com.atproto.lexicon.schema", rkey: <nsid>})`, or the `lexicon-garden` equivalents.

   If one exists:
   - Run `lexicon-garden.check_compatibility(old_doc, new_doc)`.
   - Bump `revision` to `old.revision + 1` (or start at `1` if absent).
   - **Refuse to publish breaking changes silently.** If the check flags a break, require the user to either mint a new NSID (e.g. `com.example.foo.getBarV2`) or explicitly acknowledge the break. The `revision` spec is a social signal, not a gate — surfacing the break is your job, not the PDS's.

   Full break/non-break matrix: defer to `skills/atproto-lexicon/shared/backward-compat.md` rather than duplicating. Revision-specific rules: `references/backward-compat-revisions.md`.

5. **Compute the canonical CID.** Run `lexicon-garden.create_record_cid(record)` (or the `atpmcp` equivalent). This is a sanity check — it round-trips the record through DRISL canonical CBOR. If the CID your encoder produces disagrees with the MCP tool's, your encoder is non-canonical somewhere and the PDS will compute a different CID than you expect. Investigate before publishing; a wrong CID means consumers can't verify the record against any reference you hand them. DRISL details live in `skills/atproto-repository` §drisl; CID encoding in `skills/atproto-cid`.

6. **Publish.** Call `com.atproto.repo.putRecord`:

   ```
   collection: com.atproto.lexicon.schema
   rkey:       <the full NSID, verbatim — e.g. com.example.foo.getBar>
   record:     <the doc from step 1>
   validate:   true
   ```

   Use `putRecord` (idempotent) rather than `createRecord` for updates; either works for a first publish. The PDS will re-validate the record against the `com.atproto.lexicon.schema` lexicon. The most common reject is `id != rkey`.

   For SDK-level snippets in your stack, defer to:
   - Rust → `skills/atproto-lexicon/rust/xrpc-client.md`
   - TypeScript → `skills/atproto-lexicon/typescript/xrpc-client.md`
   - Go → `skills/atproto-lexicon/go/xrpc-client.md`

   This skill does not duplicate those.

7. **Verify resolution end-to-end.** Immediately after publish:
   - Re-fetch via `getRecord` and compare the returned CID to the one from step 5. They should match exactly.
   - Optionally call `lexicon-garden.describe_lexicon(<nsid>)` to confirm the network's spec-conformant resolver can see your record. A 404 here when `getRecord` works usually means your `_lexicon.` TXT is missing or points at the wrong DID.

   If resolution fails but `getRecord` succeeds, the record is published but unclaimable — re-check step 3.

See `references/publish-checklist.md` for a condensed pre-flight list you can walk through each time.

## Resolution (consumer side)

The inverse of publishing. Given an NSID, how does a client fetch the lexicon?

1. **Reverse-DNS the NSID** to extract the authority domain (same rule as step 3 above: reverse all segments except the final name segment).
2. **Resolve authority → DID** via the `_lexicon.<authority>` TXT record, parsing the `did=` key.
3. **Resolve DID → PDS** via standard DID-doc resolution — defer to `atproto-identity-resolution`.
4. **Fetch the record** with `com.atproto.repo.getRecord`:
   - `repo = <did>`
   - `collection = com.atproto.lexicon.schema`
   - `rkey = <the full NSID>`
5. **Use the record as a lexicon document.** The record's fields (`id`, `lexicon`, `defs`, `revision`, ...) are the lexicon document. Hand it to your catalog (`atproto-lexicon` covers catalog loading).

`lexicon-garden.describe_lexicon(nsid)` collapses all five steps behind one MCP call; call it first unless you're specifically debugging the resolution chain.

Full diagram and edge cases: `references/resolution-flow.md`.

## MCP tools this skill drives

- **`lexicon-garden`** → `validate_lexicon(doc)`, `check_compatibility(old, new)`, `create_record_cid(record)`, `describe_lexicon(nsid)`, `invoke_xrpc(method, params, input?)`.
- **`atpmcp`** → `validate_lexicon_schema(doc)`, `get_record(at_uri)`, `get_lexicon(nsid)`, `create_record_cid(record)`, `invoke_xrpc(method, params, input?)`.

Prefer `lexicon-garden` for spec-conformant checks and network resolution. Prefer `atpmcp` when working against a local dev PDS or when you need deterministic behavior in scripts.

## References

- `references/record-shape.md` — `com.atproto.lexicon.schema` field-by-field, with example.
- `references/resolution-flow.md` — NSID → authority → DNS → DID → PDS → record, with diagram.
- `references/authority-and-ownership.md` — why the PDS doesn't enforce NSID authority, and why consumers do.
- `references/backward-compat-revisions.md` — `revision` monotonicity, deprecation windows, and when to mint a new NSID instead.
- `references/publish-checklist.md` — pre-flight checklist to walk through before every publish.

External specs:

- <https://atproto.com/specs/lexicon> — lexicon document + resolution.
- <https://atproto.com/specs/nsid> — NSID grammar and authority rules.
- `lexicons/com/atproto/lexicon/schema.json` in `bluesky-social/atproto` — the record lexicon this skill publishes against.

Adjacent skills:

- `atproto-lexicon` — authoring the JSON, catalog loading, codegen, client-side validation, XRPC invocation.
- `atproto-identity-resolution` — DID/handle resolution, `_atproto.` TXT, DID-doc shape.
- `atproto-repository` — CAR/MST/commit signing, DRISL canonical CBOR.
- `atproto-cid` — CID parsing/construction, tag 42.

## Examples

### Publish trace

```
NSID:        com.example.foo.getBar
Publisher:   did:plc:abc123 (owns example.com)
Step 1: Form record
   { $type: "com.atproto.lexicon.schema",
     lexicon: 1,
     id: "com.example.foo.getBar",
     revision: 3,
     defs: { main: { type: "query", ... } } }
Step 2: validate_lexicon(doc) → OK
Step 3: DNS _lexicon.example.com TXT → did=did:plc:abc123 ✓ matches publisher
Step 4: get_record(at://did:plc:abc123/com.atproto.lexicon.schema/com.example.foo.getBar)
   → existing record, revision 2. check_compatibility(old, new) → OK (added optional field).
Step 5: create_record_cid(record) → bafyrei…7xq ✓
Step 6: invoke_xrpc("com.atproto.repo.putRecord", {
           repo: "did:plc:abc123",
           collection: "com.atproto.lexicon.schema",
           rkey: "com.example.foo.getBar",
           record: <doc>,
           validate: true
         }) → 200 OK, cid: bafyrei…7xq
Step 7: describe_lexicon("com.example.foo.getBar") → returns the new record ✓
```

### Resolution trace

```
Input:       com.example.foo.getBar
Step 1: authority = example.com
Step 2: DNS _lexicon.example.com TXT → did=did:plc:abc123
Step 3: DID doc → PDS at https://pds.example.com
Step 4: com.atproto.repo.getRecord(repo=did:plc:abc123,
          collection=com.atproto.lexicon.schema,
          rkey=com.example.foo.getBar)
        → { $type, lexicon: 1, id, defs, revision, ... }
Step 5: hand to catalog; use for validation/invocation.
```

## Backlog

- A `scripts/verify-authority.sh` (or similar) that given an NSID + DID resolves `_lexicon.<authority>` and reports match/mismatch. Useful for CI gates on lexicon repos. Not in v0.1; add if users report hitting authority errors frequently.

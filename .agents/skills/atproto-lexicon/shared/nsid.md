# NSID — Namespaced Identifiers (Reference)

Source of truth: https://atproto.com/specs/nsid

An NSID is a globally-unique identifier for a lexicon — the reversed domain authority plus a name segment. It is the `id` field of a lexicon document, the collection segment of an AT-URI, and the path segment of an XRPC request.

## 1. Grammar

```abnf
nsid         = domain-authority "." name-segment
authority    = segment *("." segment)        ; 2+ segments, reversed DNS
segment      = [a-zA-Z] *([a-zA-Z0-9-]) [a-zA-Z0-9]
                                              ; no leading digit, no trailing hyphen
name-segment = [a-zA-Z] *([a-zA-Z0-9])       ; letters only after first; NO hyphens, NO digits at position 0
```

Minimum 3 segments total: at least a two-segment authority + one name (e.g., `com.example.foo`).

## 2. Constraints

- **Total length:** max 317 bytes.
- **Per-segment length:** 63 bytes max each.
- **Character class:** ASCII only. Punycode must already be applied — an NSID never contains non-ASCII bytes.
- **Case preservation:** the spec preserves case on disk, but resolution of the authority (DNS lookup side) is case-insensitive. The **name segment's case is significant**. Consensus practice: normalize the authority to lowercase; leave the name segment alone.
- **Hyphens:** allowed only in authority segments. The name segment must not contain `-`.
- **No digits at name-segment position 0:** `com.example.1foo` is invalid.

## 3. Examples

Valid:

```
com.example.foo
com.example.sub.bar
com.atproto.repo.getRecord
app.bsky.feed.post
```

Invalid (and why):

```
com.example.1foo           name segment starts with digit
com.example.foo-bar        hyphen in name segment
example.foo                only 2 segments
com.example.foo.           trailing dot
Com.Example.Foo            authority case should normalize; name segment is fine as-is
```

## 4. Reserved prefixes (convention, not enforcement)

- `com.atproto.*` — core AT Protocol (operated by Bluesky PBC).
- `app.bsky.*` — Bluesky social application.
- `chat.bsky.*`, `tools.ozone.*` — Bluesky-operated subservices.
- Anything else — owned by whoever controls the reversed DNS authority.

The protocol does not enforce ownership. Collision avoidance is social: publish your lexicons under a domain you control.

## 5. Relationship to lexicon IDs

The `id` field of a lexicon document **must equal** its NSID. When a `ref` or `union.refs` entry carries just the NSID (no `#fragment`), it resolves to the `main` def of that lexicon.

```
"ref": "com.example.feed.post"        → com.example.feed.post#main
"ref": "com.example.feed.post#entry"  → def "entry" in com.example.feed.post
```

## 6. `$type` and NSIDs

Record `$type` values are NSIDs (implying `#main`) or NSIDs plus a fragment. See `record-model.md` for `$type` semantics.

## 7. Resolution (brief)

An NSID can be resolved to its lexicon document by:

1. DNS TXT lookup at `_lexicon.<authority-domain>` → DID of the operator.
2. DID resolution → PDS endpoint.
3. XRPC `com.atproto.lexicon.getSchema` (or equivalent) on the PDS → lexicon JSON.

Implementations often cache the entire lexicon directory locally rather than resolve on demand. See the `ResolvingCatalog` / `DefaultLexiconResolver` sections in per-language READMEs.

## 8. See also

- `at-uri.md` — NSIDs as the collection segment of AT-URIs.
- `lexicon-spec.md` — NSIDs as the `id` of lexicon documents.
- `record-model.md` — NSIDs in `$type` values.
- `../skills/atproto-identity-resolution/` — handle/DID resolution that underpins NSID resolution.

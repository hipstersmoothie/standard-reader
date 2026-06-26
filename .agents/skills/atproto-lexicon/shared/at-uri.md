# AT-URIs inside records and lexicon refs (Reference)

Source of truth: https://atproto.com/specs/at-uri-scheme

This file covers AT-URIs as they appear **inside record bodies and lexicon refs**. Identity-side input parsing (accepting user-typed URIs, handle normalization) is covered by `atproto-identity-resolution`.

## 1. Grammar

```abnf
at-uri     = "at://" authority [ "/" collection [ "/" rkey ] ] [ "#" fragment ]
authority  = did / handle
collection = nsid
rkey       = 1*VCHAR                          ; see record-key rules below
```

Examples:

```
at://did:plc:abc123                                    ; repo root
at://did:plc:abc123/app.bsky.feed.post                 ; collection
at://did:plc:abc123/app.bsky.feed.post/3jwdwj2ctlk26   ; record
at://did:plc:abc123/app.bsky.actor.profile/self        ; singleton record
```

## 2. Authority: DID vs. handle

Both are syntactically valid. In practice:

- **Inside records on the wire** — DIDs are strongly preferred and Bluesky enforces them. Handles are mutable; a persisted handle-based AT-URI goes stale when the operator changes it.
- **Accepting user input** — handles are accepted and normalized to DIDs before storage.
- **In lexicon `ref`/`union.refs`** — the ref uses an NSID + optional fragment, not an AT-URI. Authority doesn't appear there.

**Ambiguity flag:** the `at-uri` lexicon string format is looser than what records actually carry. Record-context uses a narrower subset (DID-only authority). Different lexicon strings (`at-uri`, `at-uri-of-repo`) enforce different subsets, and the exact rules live across multiple spec pages.

## 3. Path components

- `collection` — a valid NSID (§`nsid.md`).
- `rkey` — a valid record key (§5 below).
- Omitting `rkey` yields a collection-level URI: `at://<did>/<nsid>`. Used for listing.
- Omitting both yields a repo-level URI: `at://<did>`. Used by identity / repo description responses.

## 4. Fragment

- Syntactically allowed.
- **In record contents:** fragments are rare — records are whole objects, not sub-selectors.
- **In lexicon refs:** fragments are standard. `com.example.foo#bar` points at def `bar` in lexicon `com.example.foo`. A bare NSID (no fragment) implies `#main`.
- Fragment characters: ASCII letters, digits, `-`, `_`, `.`.

## 5. Record keys (rkey)

Source: https://atproto.com/specs/record-key

| Format              | Rule                                                                 |
| ------------------- | -------------------------------------------------------------------- |
| `tid`               | Exactly 13 chars, base32-sortable TID (see `atproto-repository` §tid). |
| `nsid`              | A valid NSID. Used when the key is itself a type token.              |
| `literal:<value>`   | Exactly that literal (e.g., `literal:self` for singletons).          |
| `any`               | 1–512 bytes from `[A-Za-z0-9._:~-]`; not `.`, not `..`.              |

All rkey formats:

- ASCII only.
- 1–512 bytes.
- Permitted punctuation: `. - _ : ~`. No `/`, no `?`, no `#`, no `@`.
- Case-sensitive.
- `.` and `..` are forbidden (collision with path semantics).

## 6. Query strings

**Not permitted.** The spec excludes query components from AT-URIs. If you see `?` in an AT-URI, treat it as invalid.

## 7. Use in records

Two common shapes carry AT-URIs inside records:

### strongRef

```json
{
  "uri": "at://did:plc:abc123/app.bsky.feed.post/3jwdwj2ctlk26",
  "cid": "bafyreigxv..."
}
```

`com.atproto.repo.strongRef` is the standard immutable pin. See `record-model.md §strongRef` for CID encoding rules (string vs. `$link` / tag 42 — strongRef uses **string form**).

### Bare at-uri string fields

A lexicon can declare `type: "string", format: "at-uri"`. The runtime value is just the URI string. No CID companion.

## 8. Encoding in JSON vs. CBOR

AT-URIs are plain strings in both. They carry no special tag. Compare:

| Thing          | JSON                                 | DAG-CBOR                                     |
| -------------- | ------------------------------------ | -------------------------------------------- |
| AT-URI         | `"at://did:plc:abc/..."`             | text string (major 3)                        |
| CID (cid-link) | `{"$link": "bafyrei..."}`            | tag 42 + multibase identity bytes            |
| CID (string)   | `"bafyrei..."` (as in strongRef.cid) | text string (major 3)                        |

## 9. See also

- `nsid.md` — the NSID that forms the collection segment.
- `record-model.md` — strongRef, blob refs, `$type` dispatch.
- `lexicon-spec.md` — `ref` and `union.refs` syntax.
- `../skills/atproto-identity-resolution/` — accepting user-typed AT-URIs with handles.

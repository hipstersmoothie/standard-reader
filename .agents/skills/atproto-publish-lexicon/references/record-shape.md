# `com.atproto.lexicon.schema` — record shape

The record that carries a lexicon on the network. Defined in `bluesky-social/atproto` at `lexicons/com/atproto/lexicon/schema.json`. Spec context: <https://atproto.com/specs/lexicon>.

## Top-level fields

| Field         | Type     | Required | Notes                                                                                       |
| ------------- | -------- | -------- | ------------------------------------------------------------------------------------------- |
| `$type`       | string   | yes      | Always `com.atproto.lexicon.schema`. Required on every record per the atproto data model.   |
| `lexicon`     | integer  | yes      | The *lexicon language* version, currently fixed at `1`. Not a semver of your document.      |
| `id`          | string   | yes      | The NSID this record defines. **Must equal the rkey** used when publishing.                 |
| `revision`    | integer  | no       | Monotonic version counter for *this* lexicon. Bump on every change. First publish may omit. |
| `description` | string   | no       | Top-level human-readable description.                                                       |
| `defs`        | object   | yes      | Map of definition names to def objects. `main` is special; others may be any name.          |

The record **is** the lexicon document. `defs`, `id`, `revision`, and `description` are top-level record fields, not nested under a `lexicon` or `schema` sub-object. If you hand-write one, don't wrap anything.

## `defs.main`

If the NSID names a `record`, `query`, `procedure`, or `subscription` — i.e. anything with an external surface — `defs.main` is required and must have `type` matching the surface kind:

- `record` → a record type definition.
- `query` → HTTP GET XRPC method.
- `procedure` → HTTP POST XRPC method.
- `subscription` → WebSocket XRPC method.

If the NSID is purely a container for secondary defs (e.g. `com.example.types.common` exporting a `Ref` def for other lexicons to reference), `defs.main` is optional.

Defs other than `main` may be any name and any `type` — `object`, `string`, `token`, `ref`, `union`, etc. They are referenced from elsewhere by NSID fragment: `com.example.types.common#Ref`.

## Canonical example

```json
{
  "$type": "com.atproto.lexicon.schema",
  "lexicon": 1,
  "id": "com.example.foo.getBar",
  "revision": 3,
  "description": "Retrieve a bar by id.",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": ["id"],
        "properties": {
          "id": { "type": "string", "format": "at-identifier" }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "object",
          "required": ["bar"],
          "properties": {
            "bar": { "type": "ref", "ref": "com.example.foo.defs#bar" }
          }
        }
      },
      "errors": [
        { "name": "NotFound" }
      ]
    }
  }
}
```

Published with:

```
putRecord(
  repo       = did:plc:abc123,
  collection = com.atproto.lexicon.schema,
  rkey       = com.example.foo.getBar,
  record     = <the above JSON>,
  validate   = true
)
```

Note `rkey` equals `$type`'s referent (the NSID), not `com.atproto.lexicon.schema`. The record's *collection* is `com.atproto.lexicon.schema`; its *rkey* is the NSID being published.

## Rules the PDS enforces on write

With `validate: true`, the PDS will reject:

- `$type != com.atproto.lexicon.schema` — obvious wrong collection.
- `lexicon != 1` — the only valid value today.
- `id != rkey` — strictly enforced by modern PDS implementations.
- `defs` shape violations against the lexicon of lexicons (malformed def objects).

It will **not** enforce at write time:

- Authority-to-DID binding (that the publishing DID owns the NSID's authority domain).
- Backward compatibility against a prior `revision`.
- Semantic validity of your `defs` beyond structural shape.

Consumers enforce authority at resolution time. Compat and semantics are on you.

## `revision` semantics

- Integer, starts at `1` (or may be omitted for the very first publish, though setting it explicitly is cleaner).
- Monotonically increasing. Lowering or reusing it confuses consumer caches.
- No semver. Non-breaking and breaking changes both bump the same counter.
- Breaking changes are discouraged; strongly prefer minting a new NSID (`com.example.foo.getBarV2`) over a breaking revision bump. See `backward-compat-revisions.md`.

## Record key format

`com.atproto.lexicon.schema` uses the `nsid` rkey format — the rkey is the full NSID, dots and all, no transformation. Examples of valid rkeys:

- `com.example.foo.getBar`
- `app.bsky.feed.post` (if Bluesky published this)
- `social.pdsls.tools.listBookmarks`

Invalid rkeys: `self`, a TID (`3lb...`), the NSID with dots replaced by anything else, a hash of the NSID. One lexicon per rkey per repo; publishing the same NSID at a different rkey will not be resolved by consumers.

## See also

- `resolution-flow.md` — how consumers fetch this record.
- `authority-and-ownership.md` — who is allowed to publish under which NSID.
- `backward-compat-revisions.md` — `revision` discipline.
- `skills/atproto-lexicon/shared/lexicon-spec.md` — the lexicon document format (what goes inside `defs`).
- `skills/atproto-lexicon/shared/record-model.md` — the atproto record model in general (`$type`, strongRef, blob refs).

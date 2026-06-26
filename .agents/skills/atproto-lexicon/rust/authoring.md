# Rust — authoring and loading lexicons

Procedure-oriented guide for creating a lexicon, loading it into a `BaseCatalog`, and preparing it for validation. The normative rules live in `../shared/lexicon-spec.md`; this file is idiom and API.

## 1. Write the lexicon as JSON

Lexicons are JSON documents. Keep one file per NSID under a `lexicons/` directory whose path mirrors the NSID (`lexicons/com/example/note.json`). This matches the layout Bluesky uses and the layout `BaseCatalog::load_directory` expects (if you're running a directory-loading variant).

```json
{
  "lexicon": 1,
  "id": "com.example.note",
  "description": "A user-authored text note.",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["text", "createdAt"],
        "properties": {
          "text":      { "type": "string", "maxLength": 3000 },
          "createdAt": { "type": "string", "format": "datetime" },
          "langs":     { "type": "array", "items": { "type": "string", "format": "language" } },
          "reply":     { "type": "ref", "ref": "com.atproto.repo.strongRef" }
        }
      }
    }
  }
}
```

See `../shared/lexicon-spec.md` for every def type and field option, and `../shared/backward-compat.md` before editing an existing lexicon.

## 2. Build a catalog

`BaseCatalog` owns the loaded schemas and implements the `Catalog` trait:

```rust
use atproto_lexicon::BaseCatalog;

let mut catalog = BaseCatalog::new();

// Option A — single schema from a JSON string
catalog.add_schema_json(include_str!("../lexicons/com/example/note.json"))?;

// Option B — pre-parsed SchemaFile
let schema_file: atproto_lexicon::SchemaFile = serde_json::from_str(raw)?;
catalog.add_schema(schema_file)?;

// Option C — load many at startup
for path in glob::glob("lexicons/**/*.json")? {
    let raw = std::fs::read_to_string(path?)?;
    catalog.add_schema_json(&raw)?;
}
```

Do this once at startup. The catalog is cheap to share across requests; wrap in `Arc<BaseCatalog>` if you fan out to worker tasks.

### The `Catalog` trait

```rust
pub trait Catalog {
    fn resolve(&self, ref_path: &str) -> Option<Schema>;
    fn get_schema_file(&self, nsid: &str) -> Option<&SchemaFile>;
}
```

`ref_path` is either a bare NSID (implies `#main`) or `NSID#def`. Plug in your own `Catalog` impl if you need custom resolution (e.g., a remote-schema cache); most callers never do.

## 3. Network resolution (optional)

For on-demand lexicon fetching use `DefaultLexiconResolver`:

```rust
use atproto_lexicon::{DefaultLexiconResolver, LexiconResolver};
use atproto_identity::DnsResolver;

let http = reqwest::Client::new();
let dns  = DnsResolver::system()?;
let resolver = DefaultLexiconResolver::new(http, dns);

let schema_file = resolver.resolve("com.example.note").await?;
catalog.add_schema(schema_file)?;
```

The default resolver performs: DNS TXT at `_lexicon.<authority>` → DID resolution → PDS endpoint → `com.atproto.lexicon.getSchema` XRPC call. See `../shared/nsid.md §resolution`.

Caveats:

- Don't resolve on the hot path — prefer bundled schemas or a periodic refresh.
- If resolution fails, your catalog will not have the schema; `validate_record` will return a `DataValidationError::SchemaNotFound`.

## 4. Inspect a schema

```rust
let file = catalog.get_schema_file("com.example.note").expect("loaded");
// file.id, file.revision, file.description, file.defs (HashMap<String, SchemaDef>)

let schema = catalog.resolve("com.example.note").expect("main def");
match schema.def {
    SchemaDef::Record(r) => { /* r.key, r.record_def */ }
    SchemaDef::Query(q)  => { /* q.parameters, q.output, q.errors */ }
    SchemaDef::Procedure(p) => { /* … */ }
    _ => {}
}
```

`SchemaDef` is an enum with a variant per def type. Match exhaustively when writing generic tooling.

## 5. Adding refs and unions

`ref` targets are strings:

```json
"reply": { "type": "ref", "ref": "com.atproto.repo.strongRef" }

"embed": {
  "type": "union",
  "refs": [
    "com.example.embed.image",
    "com.example.embed.external"
  ],
  "closed": false
}
```

Open unions (`closed: false` or omitted) are the safe default — see `../shared/backward-compat.md`. Closed unions need every consumer to carry every ref; reserve for enums-of-types.

## 6. Authoring checklist

Before considering a lexicon "done":

- [ ] `lexicon: 1`, `id` matches the file's NSID, `revision` set.
- [ ] Primary def (`record`/`query`/`procedure`/`subscription`) lives under `main`.
- [ ] All `required`/`nullable` lists reference properties that exist.
- [ ] Every `ref`/`union.refs` target can be resolved in your catalog (`catalog.resolve(target).is_some()`).
- [ ] `string.format` values come from the spec set (`at-uri`, `did`, `cid`, `datetime`, `tid`, `record-key`, …).
- [ ] `maxLength` / `maxSize` constraints match the product reality, not the smallest value you can imagine.
- [ ] Unions are `closed: false` unless there is a specific reason to close them.
- [ ] You've walked the `../shared/backward-compat.md` matrix for anything touching an already-published lexicon.

## 7. See also

- `validation.md` — validating records against the catalog you just built.
- `xrpc-client.md` — invoking query/procedure defs.
- `records.md` — typed record dispatch and AT-URI handling.
- `../shared/lexicon-spec.md` — the normative field list.
- `../shared/backward-compat.md` — change matrix.

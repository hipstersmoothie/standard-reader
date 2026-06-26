# Go — authoring and loading lexicons

Procedure-oriented guide for authoring a lexicon, loading it into a `BaseCatalog`, and running `cmd/lexgen` codegen. Normative rules are in `../shared/lexicon-spec.md`.

## 1. Write the lexicon as JSON

Mirror the NSID in the directory structure: `lexicons/com/example/note.json`. This matches what `BaseCatalog.LoadDirectory` and `lexgen` expect.

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

See `../shared/lexicon-spec.md` for def-type and field options; `../shared/backward-compat.md` before editing a published lexicon.

## 2. Build a `BaseCatalog`

```go
import "github.com/bluesky-social/indigo/atproto/lexicon"

cat := lexicon.NewBaseCatalog()
if err := cat.LoadDirectory("./lexicons"); err != nil {
    return err
}
```

`LoadDirectory` walks recursively and ingests every `.json` file. For distributable binaries:

```go
//go:embed lexicons/*
var lexFS embed.FS

cat := lexicon.NewBaseCatalog()
if err := cat.LoadEmbedFS(lexFS); err != nil {
    return err
}
```

Add schemas one by one:

```go
import "encoding/json"

var sf lexicon.SchemaFile
if err := json.Unmarshal(raw, &sf); err != nil { return err }
if err := cat.AddSchemaFile(sf); err != nil { return err }
```

`BaseCatalog` is not goroutine-safe during construction; load at startup before spawning workers.

### The `Catalog` interface

```go
type Catalog interface {
    Resolve(ref string) (*Schema, error)
}
```

`ref` is either a bare NSID (implies `#main`) or `NSID#def`. Implement yourself if you need custom resolution.

## 3. Network resolution

`ResolvingCatalog` fetches lexicons on demand using an `identity.Directory`:

```go
import (
    "github.com/bluesky-social/indigo/atproto/identity"
    "github.com/bluesky-social/indigo/atproto/lexicon"
)

cat := lexicon.NewResolvingCatalog()
cat.Directory = identity.DefaultDirectory()
// cat.Base holds a BaseCatalog for cached results.
```

The resolver follows the same DNS → DID → PDS → XRPC chain documented in `../shared/nsid.md §resolution`. Don't resolve on the hot path — cache via `cat.Base`.

## 4. Inspecting schemas

```go
schema, err := cat.Resolve("com.example.note")  // main def
schemaDef := schema.Def                          // SchemaDef union type
file, _ := cat.Base.GetSchemaFile("com.example.note")
_ = file.Defs                                    // map[string]SchemaDef
_ = file.Revision
```

Match on `schema.Def` for generic tooling.

## 5. Codegen — `cmd/lexgen`

`lexgen` generates Go types + XRPC wrappers + `cbor_gen.go` marshalers from your lexicons.

Basic invocation (from `indigo/HACKING.md`):

```bash
go run github.com/bluesky-social/indigo/cmd/lexgen \
    --package example \
    --prefix com.example \
    --outdir ./gen/example \
    ./lexicons/com/example
```

Key flags:

- `--package` — Go package name for output.
- `--prefix` — NSID prefix this invocation is scoped to.
- `--outdir` — where to place the generated `.go` files.
- `--build` / `--build-file` — one of these is required; selects which lexicons to generate.
- `--gen-server` — also emit server stubs.
- `--gen-handlers` — also emit handler signatures.
- `--external-lexicons` — additional lexicons to resolve refs against (e.g., `com.atproto.*` from indigo's repo).
- `--types-import` — rewrite import paths for referenced external types.

After `lexgen`, run `cbor-gen` to regenerate CBOR marshalers:

```bash
go run ./gen
```

(The project's `gen/main.go` calls `cbor-gen` on the hand-maintained and generated types.)

## 6. `lextool` — a debugging CLI (not a generator)

```bash
go install github.com/bluesky-social/indigo/atproto/lexicon/cmd/lextool@latest

lextool parse-schema ./lexicons/com/example/note.json
lextool load-directory ./lexicons
lextool validate-record ./lexicons com.example.note ./record.json
lextool resolve com.example.note
```

Use when debugging schema parse errors or validating hand-crafted test fixtures.

## 7. Refs and unions

`ref` / `union.refs` targets are strings:

```json
"reply": { "type": "ref", "ref": "com.atproto.repo.strongRef" },
"embed": {
  "type": "union",
  "refs": [
    "com.example.embed.image",
    "com.example.embed.external"
  ],
  "closed": false
}
```

Open unions (`closed: false` or omitted) are the safe default. On the typed-client side, open unions are represented via `*lexutil.LexiconTypeDecoder` holding a registered concrete type (see `records.md §typed-dispatch`).

## 8. Authoring checklist

- [ ] `lexicon: 1`, `id` equals the NSID, `revision` set.
- [ ] Primary def (`record`/`query`/`procedure`/`subscription`) is named `main`.
- [ ] Every `ref`/`union.refs` target resolves in your catalog.
- [ ] `string.format` values come from the spec set.
- [ ] Unions default `closed: false`.
- [ ] `../shared/backward-compat.md` matrix walked for edits to published lexicons.
- [ ] `lexgen` runs cleanly; `cbor-gen` regenerated; output committed.

## 9. See also

- `validation.md` — running the validator against your catalog.
- `xrpc-client.md` — calling query/procedure defs.
- `records.md` — `Blob`, `CIDLink`, typed dispatch.
- `../shared/lexicon-spec.md` — normative field list.
- `../shared/backward-compat.md` — change matrix.

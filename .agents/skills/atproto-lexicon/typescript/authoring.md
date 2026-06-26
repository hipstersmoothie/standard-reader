# TypeScript — authoring and loading lexicons

Procedure-oriented guide for authoring a lexicon, loading it into a `Lexicons` catalog, and running codegen. Normative rules are in `../shared/lexicon-spec.md`.

## 1. Write the lexicon as JSON

One file per NSID under `lexicons/` whose path mirrors the NSID (`lexicons/com/example/note.json`). This matches the convention `@atproto/lex-cli` expects.

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

See `../shared/lexicon-spec.md` for every def type and field option; `../shared/backward-compat.md` before editing an existing lexicon.

## 2. Load into a `Lexicons`

```ts
import { Lexicons, type LexiconDoc } from '@atproto/lexicon'
import noteSchema from './lexicons/com/example/note.json'
import likeSchema from './lexicons/com/example/like.json'

const lex = new Lexicons()
lex.add(noteSchema as LexiconDoc)
lex.addMany([likeSchema as LexiconDoc])
```

Bulk load from a directory at build time:

```ts
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

function loadAll(dir: string, lex: Lexicons) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name)
    if (entry.isDirectory()) loadAll(p, lex)
    else if (entry.name.endsWith('.json')) {
      lex.add(JSON.parse(readFileSync(p, 'utf8')) as LexiconDoc)
    }
  }
}

const lex = new Lexicons()
loadAll('./lexicons', lex)
```

`Lexicons` mutates in place. Construct once at startup and share across requests; no request-scoped cloning required.

### Inspecting the catalog

```ts
lex.get('com.example.note')                 // LexiconDoc | undefined
lex.getDef('com.example.note', 'main')       // LexUserType | undefined
lex.getDefOrThrow('com.example.note', 'main')
```

## 3. Codegen with `@atproto/lex-cli`

`@atproto/lex-cli` generates typed client and server bindings from your JSON schemas.

Generated client (NSID → method call with typed input/output):

```bash
npx @atproto/lex-cli gen-api ./src/lexicons ./lexicons/**/*.json
```

Output: per-NSID `.ts` files plus `index.ts` that re-exports a constructed `Lexicons` with every doc registered, plus typed namespace wrappers. Import them like any other module:

```ts
import { Lexicons } from './src/lexicons'
import { XrpcClient } from '@atproto/xrpc'

const client = new XrpcClient('https://bsky.social', Lexicons)
// client.call('com.example.note.get', params, undefined, opts) is now typed
```

Generated server handlers:

```bash
npx @atproto/lex-cli gen-server ./src/server ./lexicons/**/*.json
```

Produces handler signatures you can plug into `createServer(...)` (see `xrpc-client.md §server`).

Subcommands (verify current list with `npx @atproto/lex-cli --help`):

- `gen-api` — client bindings.
- `gen-server` — server bindings.
- `gen-md` — markdown docs.

## 4. Refs and unions

`ref` and `union.refs` accept `NSID` or `NSID#def-name`. A bare NSID implies `#main`:

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

`closed: false` (or omitted) is the safe default — see `../shared/backward-compat.md §1`. Closed unions lock the set of concrete `$type` values; open unions let consumers add new types without breaking existing clients.

## 5. Authoring checklist

- [ ] `lexicon: 1`, `id` equals the file's NSID, `revision` set.
- [ ] Primary def (`record`/`query`/`procedure`/`subscription`) is named `main`.
- [ ] Every `ref`/`union.refs` target exists in your `Lexicons` at validate time (`lex.get(target)`).
- [ ] `string.format` values come from the spec set.
- [ ] Unions are `closed: false` unless there is a specific reason.
- [ ] You've walked the `../shared/backward-compat.md` matrix for anything touching a published lexicon.
- [ ] Codegen re-runs cleanly; generated output is committed.

## 6. See also

- `validation.md` — validating records with the catalog you just built.
- `xrpc-client.md` — invoking query/procedure defs.
- `records.md` — AT-URIs, TIDs, blob refs.
- `../shared/lexicon-spec.md` — the normative field list.
- `../shared/backward-compat.md` — change matrix.

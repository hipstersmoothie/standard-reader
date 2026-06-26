# TypeScript — validating records and XRPC payloads

This file covers validation against a `Lexicons` catalog. Rules in `../shared/lexicon-spec.md §7–8` and `../shared/record-model.md`.

## 1. Public entry points

```ts
import { Lexicons, BlobRef, ValidationError, LexiconDefNotFoundError } from '@atproto/lexicon'

lex.assertValidRecord(nsid, value)        // throws ValidationError; returns validated value
lex.assertValidXrpcInput(nsid, value)
lex.assertValidXrpcOutput(nsid, value)
lex.assertValidXrpcParams(nsid, params)
lex.assertValidXrpcMessage(nsid, value)   // subscription frame body

lex.validate(nsid, value)
// returns { success: true, value } | { success: false, error: ValidationError }
```

All are **synchronous**. `assertValid*` throws; `validate` returns a result union.

## 2. `ValidationError`

```ts
class ValidationError extends Error {
  path: string      // JSON pointer to the failing field
  // plus additional properties depending on the failure kind
}
```

The `path` field identifies *where* validation failed — use it in error reporting.

## 3. Strict by default

`@atproto/lexicon` is strict by default on closed schemas:

- **Closed object** (explicit or implicit): unknown properties cause `ValidationError`.
- **Open object** (some schemas mark extras as allowed): unknown properties pass through.
- **Closed union** (`closed: true`): unknown `$type` rejected.
- **Open union** (`closed: false` or omitted): unknown `$type` passes through.

There is no top-level "lenient flag" analog to Rust's `ValidateFlags`. Lenient-style reading is accomplished by:

- Catching `ValidationError` and downgrading to a warning for known-benign cases.
- Pre-normalizing inputs (e.g., upgrading legacy blobs) before calling `assertValidRecord`.

## 4. `BlobRef` — the class pitfall

**Critical:** `BlobRef` is a **class instance**, not a plain object. Plain-object blobs fail validation.

```ts
import { BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'

// Wrong — plain object, validator rejects:
const bad = { $type: 'blob', ref: { $link: 'bafk...' }, mimeType: 'image/jpeg', size: 123 }

// Right — BlobRef instance:
const cid = CID.parse('bafk...')
const good = new BlobRef(cid, 'image/jpeg', 123)
```

When deserializing records from JSON, use the helper:

```ts
const record = lex.assertValidRecord('com.example.note', jsonPayload)
// lex.assertValidRecord converts {$type:'blob',...} shapes into BlobRef instances internally
// before validating — if you pass an already-parsed object without blob conversion, wrap it first.
```

The `@atproto/api` generated types emit `BlobRef` for blob fields automatically.

Legacy blob form (`{cid, mimeType}` without the wrapper) is also recognized by `BlobRef` in some stack versions — check `BlobRef.fromLex` and its `original` marker if you need to distinguish. Legacy blobs should be upgraded to modern before re-writing.

## 5. Worked example

```ts
import { Lexicons, ValidationError, type LexiconDoc } from '@atproto/lexicon'
import noteSchema from './lexicons/com/example/note.json'

const lex = new Lexicons()
lex.add(noteSchema as LexiconDoc)

const raw = {
  $type: 'com.example.note',
  text: 'hello',
  createdAt: '2026-04-21T12:00:00.000Z',
}

try {
  const value = lex.assertValidRecord('com.example.note', raw)
  // value is the canonicalized record
} catch (err) {
  if (err instanceof ValidationError) {
    console.error(`validation failed at ${err.path}: ${err.message}`)
  } else {
    throw err
  }
}
```

`validate`-variant usage when you'd rather not throw:

```ts
const r = lex.validate('com.example.note', raw)
if (!r.success) {
  return { status: 400, error: 'InvalidRecord', message: r.error.message }
}
const value = r.value
```

## 6. Validating XRPC payloads

Validation of request/response shapes happens automatically inside `XrpcClient` when you pass a `Lexicons` to the constructor. For manual validation (e.g., in a server):

```ts
lex.assertValidXrpcInput('com.atproto.repo.createRecord', body)
lex.assertValidXrpcOutput('com.atproto.repo.createRecord', responseBody)
lex.assertValidXrpcParams('com.atproto.repo.getRecord', url.searchParams)
lex.assertValidXrpcMessage('com.atproto.sync.subscribeRepos', frameBody)
```

`assertValidXrpcMessage` validates a subscription's body frame against the message schema; the header `{op, t}` is dispatched by the consumer before calling.

## 7. Custom error names

Lexicon `errors` entries surface via `XRPCError.error`:

```ts
try {
  await client.call('com.atproto.repo.getRecord', params)
} catch (err) {
  if (err instanceof XRPCError && err.error === 'RecordNotFound') {
    return null
  }
  throw err
}
```

Generated code (from `lex-cli`) types `err.error` as a literal union of declared names — prefer that over magic strings.

Clients **must** tolerate unknown error names (`../shared/xrpc-wire.md §5`). Don't assume `err.error` is one of a fixed set.

## 8. Common pitfalls

- **Plain-object blob.** Always use `BlobRef`. See §4.
- **Validating before parsing JSON.** `lex.validate` expects parsed values, not strings.
- **Calling on the wrong `Lexicons` instance.** TypeScript won't catch a cross-catalog call — make sure the `Lexicons` you validate with is the one containing the schema.
- **Relying on `validate.success === true` without reading `value`.** The returned `value` may differ from the input (e.g., blob-shape upgrade). Always use the returned value.
- **Missing `$type` on records.** `assertValidRecord` will reject. Strict-by-spec; see `../shared/record-model.md §1`.

## 9. See also

- `authoring.md` — loading the `Lexicons` the validator consumes.
- `xrpc-client.md` — validation inside `XrpcClient` and `createServer`.
- `records.md` — `BlobRef` construction, AT-URI parsing.
- `../shared/lexicon-spec.md §7–8` — strict vs. lenient rules.
- `../shared/record-model.md` — strongRef and blob shape.
- `../shared/divergence-matrix.md §5` — `BlobRef` class vs. plain object across stacks.

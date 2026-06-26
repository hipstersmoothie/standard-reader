# TypeScript — records, AT-URIs, TIDs, strongRef, blobs

Companion to `validation.md`. Covers `@atproto/syntax` types (`NSID`, `AtUri`, `TID`), `BlobRef`, and strongRef handling.

## 1. AT-URIs — `@atproto/syntax`

```ts
import { AtUri } from '@atproto/syntax'

const uri = new AtUri('at://did:plc:abc123/app.bsky.feed.post/3jwdwj2ctlk26')

uri.host        // 'did:plc:abc123' (authority)
uri.collection  // 'app.bsky.feed.post'
uri.rkey        // '3jwdwj2ctlk26'
uri.hash        // '' or a '#fragment' string

uri.toString()  // canonical form
```

Construction:

```ts
const uri = AtUri.make('did:plc:abc123', 'app.bsky.feed.post', '3jwdwj2ctlk26')
```

Parsing rejects non-`at://` URIs and malformed components. Query strings are not permitted (`../shared/at-uri.md §6`).

## 2. NSIDs — `@atproto/syntax`

```ts
import { NSID } from '@atproto/syntax'

const n = NSID.parse('com.example.feed.post')
n.authority  // 'example.com'   (reversed)
n.name       // 'post'
n.segments   // ['com','example','feed','post']
```

`NSID.isValid(s)` returns a boolean; `NSID.parse` throws on invalid input.

## 3. TIDs

```ts
import { TID } from '@atproto/common-web'     // or @atproto/common in Node

const tid = TID.nextStr()            // fresh TID string like '3jwdwj2ctlk26'
const parsed = TID.fromStr(tid)      // validates and parses
```

`TID.nextStr` is monotonic within a process. For distributed writers, coordinate clock ids to avoid collisions.

## 4. strongRef

`com.atproto.repo.strongRef` is `{uri, cid}` with both as plain strings:

```ts
interface StrongRef {
  uri: string     // AT-URI
  cid: string     // string-form CID
}

const pin: StrongRef = {
  uri: 'at://did:plc:abc123/app.bsky.feed.post/3jwdwj2ctlk26',
  cid: 'bafyreigxv...',
}
```

**Critical:** `cid` here is a plain string, not a `cid-link`. Do not emit `{$link: '...'}` for strongRef's `cid` field. See `../shared/record-model.md §strongRef`.

Computing the pin CID: `@atproto/lexicon` exposes the canonical hashing helpers, and `@atproto/repo` exports `cidForRecord(value)` (or similar — check the current export). The goal is a bytewise-canonical DAG-CBOR encode + multihash SHA-256.

## 5. `BlobRef`

Modern blob shape, as a class:

```ts
import { BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'

const cid = CID.parse('bafk...')
const blob = new BlobRef(cid, 'image/jpeg', 12345)

// Access:
blob.ref        // CID instance
blob.mimeType   // 'image/jpeg'
blob.size       // 12345
```

Serialization:

- `blob.toJSON()` produces `{$type: 'blob', ref: {$link: '...'}, mimeType, size}`.
- The `Lexicons` validator wraps incoming plain objects into `BlobRef` instances internally when handed to `assertValidRecord`.

Legacy blob detection and upgrade:

```ts
if (BlobRef.isLegacy?.(raw)) {
  const upgraded = new BlobRef(CID.parse(raw.cid), raw.mimeType, raw.size ?? -1)
  // proceed with upgraded
}
```

Exact method names vary between releases — inspect the current `@atproto/lexicon` types. Legacy blobs should be upgraded before re-writing. See `../shared/record-model.md §blob`.

## 6. Uploading a blob

Via `AtpAgent`:

```ts
const res = await agent.com.atproto.repo.uploadBlob(bytes, {
  encoding: 'image/jpeg',
})
// res.data.blob is a BlobRef-shaped object ready to embed in a record
```

Attach to a record:

```ts
const record = {
  $type: 'com.example.avatar',
  image: res.data.blob,
}

await agent.com.atproto.repo.createRecord({
  repo: agent.session!.did,
  collection: 'com.example.avatar',
  rkey: 'self',
  record,
})
```

## 7. Pattern — fetch, validate, operate

```ts
import { Lexicons, ValidationError } from '@atproto/lexicon'
import { AtpAgent } from '@atproto/api'

async function fetchNote(agent: AtpAgent, lex: Lexicons, did: string, rkey: string) {
  const res = await agent.com.atproto.repo.getRecord({
    repo: did,
    collection: 'com.example.note',
    rkey,
  })
  try {
    return lex.assertValidRecord('com.example.note', res.data.value)
  } catch (err) {
    if (err instanceof ValidationError) {
      console.warn(`skipping invalid note at ${res.data.uri}: ${err.message}`)
      return null
    }
    throw err
  }
}
```

## 8. Pitfalls

- **Forgetting `BlobRef`.** Plain objects fail validation. Always construct with `new BlobRef(...)` when building records by hand.
- **strongRef as `cid-link`.** Easy mistake — the lexicon declares `cid` as `string`, so emit a string, not `{$link: ...}`.
- **Handle-based AT-URIs in records.** Persist DIDs. Handles are mutable.
- **Shared `Lexicons` vs. generated.** Generated code re-exports its own `Lexicons` constant. If you mix catalogs across calls, align schemas.
- **CID construction.** Use the library-provided hashing helpers; don't hand-roll DAG-CBOR for CID calculation.

## 9. See also

- `authoring.md` / `validation.md` — catalog construction and validation.
- `xrpc-client.md` — fetching records from a PDS.
- `../shared/at-uri.md` — AT-URI grammar.
- `../shared/record-model.md` — `$type`, strongRef, blob rules.
- `../../atproto-cid/typescript/` — CID parsing/construction.
- `../../atproto-identity-resolution/typescript/syntax.md` — `@atproto/syntax` broader surface.

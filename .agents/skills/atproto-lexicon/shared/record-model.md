# Record model — `$type` dispatch, strongRef, blob refs

Source of truth: https://atproto.com/specs/data-model

Records are the units stored in an AT Protocol repository. Every record is a DAG-CBOR-encoded object whose shape is constrained by a lexicon. This file defines the record's **on-wire object shape** independent of any particular lexicon — the rules that apply to *all* records.

## 1. The `$type` field

Every **record** at the top level MUST carry a `$type` field.

- Value is either:
  - Bare NSID — `"com.example.feed.post"` — implies `#main`.
  - NSID plus fragment — `"com.example.feed.post#entry"` — names a specific def.
- `$type` is part of the record's DAG-CBOR bytes and therefore part of its CID.
- Missing `$type` on a record: **invalid**. Strict validators reject; lenient validators have nothing to dispatch on and should also reject.

### Integration with union dispatch

Inside an `object.properties` field whose schema is a `union`:

- The concrete value carries `$type` identifying which `refs` entry it matches.
- **Closed union** (`closed: true`): `$type` must match one of `refs`. Unknown → validation error.
- **Open union** (`closed: false` or omitted — the default): unknown `$type` is tolerated as an extension point. Consumers pass it through but cannot semantically interpret.

### `$type` on non-union objects

Spec is terse. Consensus: if a non-union object schema does not reference a union anywhere in scope, an unexpected `$type` on the value is **ignored** by lenient validators and **rejected** by strict ones. Don't rely on it either way.

## 2. Record identity (CID stability)

A record's identity is the CID of its canonical DAG-CBOR encoding. Two records with byte-identical DAG-CBOR have the same CID; any change — even a map key reordered non-canonically — yields a different CID.

- Validation and canonicalization are **distinct**: a record that validates but is encoded non-canonically still has a CID, just the wrong one.
- Servers re-encode on write. See `atproto-repository` §drisl for the canonical encoding rules.

## 3. strongRef

`com.atproto.repo.strongRef` is the standard immutable pin. Its shape:

```json
{
  "uri": "at://did:plc:abc123/app.bsky.feed.post/3jwdwj2ctlk26",
  "cid": "bafyreigxv..."
}
```

- `uri` — an AT-URI pointing at the target record. See `at-uri.md`.
- `cid` — the CID of the target record **at the time the reference was created**.

### String vs. `$link` / tag 42

**Critical:** strongRef's `cid` is a **string-form CID**, not a `cid-link`. In JSON it is a plain string; in DAG-CBOR it is a text string (major type 3), **not tag 42**.

Contrast with `cid-link` fields elsewhere:

| Shape                | JSON encoding              | DAG-CBOR encoding     |
| -------------------- | -------------------------- | --------------------- |
| `strongRef.cid`      | `"bafyrei..."`             | text string (major 3) |
| `cid-link` field     | `{"$link": "bafyrei..."}`  | tag 42                |
| `blob.ref` (below)   | `{"$link": "bafyrei..."}`  | tag 42                |

This is a frequent implementation bug. If a validator produces a different CID than expected for a strongRef-bearing record, check whether the `cid` field was emitted as tag 42.

### When strongRef is not enough

strongRef pins content. It does **not** detect target-record deletion. Consumers that need liveness check must re-fetch.

## 4. Blob refs

The lexicon `blob` type describes an uploaded binary. Its runtime value is a wrapped object:

```json
{
  "$type": "blob",
  "ref":   { "$link": "bafkrei..." },
  "mimeType": "image/jpeg",
  "size":   123456
}
```

Fields:

- `$type` — literally the string `"blob"`.
- `ref` — a `cid-link` pointing at the uploaded blob block. JSON `{"$link":"<cid>"}`, CBOR tag 42.
- `mimeType` — the declared content type. Servers may sniff and reject mismatches on upload.
- `size` — the declared byte length. Servers verify on upload.

### Legacy blob refs

Early records use a different shape:

```json
{
  "cid":      "bafkrei...",
  "mimeType": "image/jpeg"
}
```

- No `$type`, no `ref` wrapper, no `size`.
- CID is in `cid` as a string.
- Still seen in pre-v1.0 records. Implementations that accept legacy blobs use a "lenient blob" flag; new writes must use the modern `$type:"blob"` form.

### Comparison semantics

- **Compare by `ref` (the CID inside):** when checking content identity. Two blob-ref wrappers with the same `ref` point at the same bytes.
- **Compare the full wrapper:** when metadata matters. `mimeType` and `size` are uploader declarations; a server upload-verifier will have already checked them.
- Two records with byte-identical blob contents but different `mimeType` strings have different record CIDs.

## 5. Field ordering and canonical form

DAG-CBOR map keys are sorted bytewise at encode time. `$type` starts with `0x24` (`$`), which sorts **before** underscore and lowercase letters, so `$type` is always the first key in a canonical record.

If `$type` is not the first key in the DAG-CBOR encoding of a record, the encoder is non-canonical. See `atproto-repository` §drisl.

## 6. Worked example — a minimal record

Lexicon `com.example.note`:

```json
{
  "lexicon": 1,
  "id": "com.example.note",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["text", "createdAt"],
        "properties": {
          "text":      { "type": "string", "maxLength": 3000 },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

A valid record value (JSON form):

```json
{
  "$type":     "com.example.note",
  "text":      "hello",
  "createdAt": "2026-04-21T12:00:00.000Z"
}
```

DAG-CBOR key order (bytewise): `$type`, `createdAt`, `text`.

## 7. See also

- `lexicon-spec.md` — def types, including `blob` and `cid-link`.
- `at-uri.md` — AT-URI grammar and strongRef's `uri` field.
- `xrpc-wire.md` — how records travel over the wire.
- `../skills/atproto-repository/shared/drisl.md` — canonical DAG-CBOR and map-key ordering.
- `../skills/atproto-cid/` — CID parsing, tag 42 encoding.

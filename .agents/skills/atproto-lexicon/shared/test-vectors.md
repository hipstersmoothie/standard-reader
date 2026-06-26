# Test vectors

Small, canonical fixtures for cross-language interop checks. Every language's test suite should round-trip these byte-for-byte.

## 1. Minimal record lexicon

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

### Valid record (JSON)

```json
{
  "$type":     "com.example.note",
  "text":      "hello",
  "createdAt": "2026-04-21T12:00:00.000Z"
}
```

### DAG-CBOR key order (bytewise)

`$type` (`0x24...`), `createdAt` (`0x63 0x72...`), `text` (`0x74 0x65...`).

### Rejection cases

| Value change                                            | Why it fails                                   |
| ------------------------------------------------------- | ---------------------------------------------- |
| Remove `$type`                                          | records require `$type`                        |
| `$type: "com.example.other"`                            | `$type` does not match the validating NSID     |
| `text` length 3001                                      | exceeds `maxLength: 3000`                      |
| Omit `createdAt`                                        | missing `required` field                       |
| `createdAt: "not-a-date"`                               | fails `format: datetime`                       |

## 2. Record with a strongRef

Lexicon:

```json
{
  "lexicon": 1,
  "id": "com.example.like",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["subject", "createdAt"],
        "properties": {
          "subject": { "type": "ref", "ref": "com.atproto.repo.strongRef" },
          "createdAt": { "type": "string", "format": "datetime" }
        }
      }
    }
  }
}
```

Valid record:

```json
{
  "$type": "com.example.like",
  "subject": {
    "uri": "at://did:plc:abc123/app.bsky.feed.post/3jwdwj2ctlk26",
    "cid": "bafyreigxvgvsdjn2f5qvqmjnh3b4eqwqwyqa3dhz7fsnvzxktopfm3jpfu"
  },
  "createdAt": "2026-04-21T12:00:00.000Z"
}
```

**Critical check:** `subject.cid` is a plain string in JSON and a **text string (major type 3)** in DAG-CBOR — **NOT** tag 42. See `record-model.md §strongRef`.

## 3. Record with a blob

Lexicon:

```json
{
  "lexicon": 1,
  "id": "com.example.avatar",
  "defs": {
    "main": {
      "type": "record",
      "key": "literal:self",
      "record": {
        "type": "object",
        "required": ["image"],
        "properties": {
          "image": {
            "type": "blob",
            "accept": ["image/jpeg", "image/png"],
            "maxSize": 1000000
          }
        }
      }
    }
  }
}
```

Valid record (modern blob form):

```json
{
  "$type": "com.example.avatar",
  "image": {
    "$type":    "blob",
    "ref":      { "$link": "bafkreigxvgvsdjn2f5qvqmjnh3b4eqwqwyqa3dhz7fsnvzxktopfm3jpfu" },
    "mimeType": "image/jpeg",
    "size":     12345
  }
}
```

Legacy form (still seen, only accepted with a "lenient blob" flag):

```json
{
  "$type": "com.example.avatar",
  "image": {
    "cid":      "bafkreigxvgvsdjn2f5qvqmjnh3b4eqwqwyqa3dhz7fsnvzxktopfm3jpfu",
    "mimeType": "image/jpeg"
  }
}
```

Rejection cases: `size > 1000000`, `mimeType` not in `accept`, missing `ref` (modern form), missing `cid` (legacy form).

## 4. Open vs. closed union

Lexicon:

```json
{
  "lexicon": 1,
  "id": "com.example.feed",
  "defs": {
    "main": {
      "type": "record",
      "key": "tid",
      "record": {
        "type": "object",
        "required": ["entry"],
        "properties": {
          "entry": {
            "type": "union",
            "refs": ["com.example.feed#text", "com.example.feed#image"],
            "closed": false
          }
        }
      }
    },
    "text":  { "type": "object", "properties": { "body": { "type": "string" } } },
    "image": { "type": "object", "properties": { "alt":  { "type": "string" } } }
  }
}
```

Record with an unknown `$type` under the open union:

```json
{
  "$type": "com.example.feed",
  "entry": {
    "$type": "com.example.feed#video",
    "src":   "https://example.com/v.mp4"
  }
}
```

- Open union: **tolerated** — the unknown `$type` passes through.
- If the same record were validated against the same lexicon with `"closed": true`, validation would **fail**.

## 5. `$type` byte ordering

In any DAG-CBOR-encoded record, `$type` must appear **first** in the top-level map. `$` is `0x24`, which sorts before every other ASCII field-name starter the protocol uses. If a record's encoded bytes do not start with `$type` as the first key after the map header, the encoder is non-canonical.

## 6. XRPC query — round trip

Method lexicon:

```json
{
  "lexicon": 1,
  "id": "com.example.note.get",
  "defs": {
    "main": {
      "type": "query",
      "parameters": {
        "type": "params",
        "required": ["repo", "rkey"],
        "properties": {
          "repo": { "type": "string", "format": "at-identifier" },
          "rkey": { "type": "string", "format": "record-key" }
        }
      },
      "output": {
        "encoding": "application/json",
        "schema": {
          "type": "ref",
          "ref": "com.example.note"
        }
      },
      "errors": [
        { "name": "RecordNotFound" }
      ]
    }
  }
}
```

Request:

```
GET /xrpc/com.example.note.get?repo=did:plc:abc&rkey=3jwdwj2ctlk26
```

200 response:

```json
{
  "$type":     "com.example.note",
  "text":      "hello",
  "createdAt": "2026-04-21T12:00:00.000Z"
}
```

404 response:

```json
{
  "error":   "RecordNotFound",
  "message": "No record at 3jwdwj2ctlk26 in collection com.example.note"
}
```

## 7. Subscription frame pair

Lexicon `com.example.stream`:

```json
{
  "lexicon": 1,
  "id": "com.example.stream",
  "defs": {
    "main": {
      "type": "subscription",
      "parameters": {
        "type": "params",
        "properties": { "cursor": { "type": "integer" } }
      },
      "message": {
        "schema": {
          "type": "union",
          "refs": ["#tick"]
        }
      },
      "errors": [{ "name": "FutureCursor" }]
    },
    "tick": {
      "type": "object",
      "required": ["seq", "time"],
      "properties": {
        "seq":  { "type": "integer" },
        "time": { "type": "string", "format": "datetime" }
      }
    }
  }
}
```

Normal frame (two concatenated DAG-CBOR objects on one WebSocket binary message):

```cbor
; header
{ "op": 1, "t": "#tick" }

; body
{ "seq": 42, "time": "2026-04-21T12:00:00.000Z" }
```

Error frame:

```cbor
{ "op": -1 }
{ "error": "FutureCursor", "message": "cursor too far ahead" }
```

## 8. Interop check recipe

For any new implementation, run the following cross-language checks:

1. Encode the minimal-record from §1 and confirm the byte output matches the reference implementation.
2. Decode the §2 strongRef record and confirm `subject.cid` round-trips as a **string**, not tag 42.
3. Decode a legacy-blob record (§3) under a lenient flag; confirm it fails under strict.
4. Validate §4's unknown-`$type` entry under `closed: true` and under `closed: false` — confirm opposite outcomes.
5. Send the §6 request/response pair through each implementation's HTTP client; confirm both 200 and 404 paths match.
6. Encode a §7 frame pair and confirm header-then-body byte sequence.

## See also

- `lexicon-spec.md` — def types and validation rules.
- `record-model.md` — the strongRef and blob shape rules these fixtures exercise.
- `xrpc-wire.md` — HTTP and WebSocket framing rules §6 and §7 exercise.
- `divergence-matrix.md` — where implementations differ on these vectors.

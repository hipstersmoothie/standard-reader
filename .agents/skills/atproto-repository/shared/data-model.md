# Data Model — Records, TIDs, AT-URIs (Reference)

Sources of truth: https://atproto.com/specs/data-model, https://atproto.com/specs/at-uri-scheme, https://atproto.com/specs/tid.

The repository is a map from keys (`<collection>/<rkey>`) to records (DAG-CBOR maps). This file captures the on-disk shape of a record, the rules for collection NSIDs, the TID format used for most record keys, and the AT-URI scheme that names records externally.

## 1. Record

A record is a DAG-CBOR map encoded using DRISL rules. Every record must carry a `$type` field — the NSID of its lexicon — and may carry any other fields permitted by that lexicon.

### 1.1. Required field: `$type`

- `$type` = NSID (see §2).
- In DAG-CBOR, `$type` is a regular map key — it is not a tag. The leading `$` is lexicographically significant: `$` (0x24) sorts before any letter, so `$type` almost always appears as the first key of a record in canonical form.
- The value of `$type` must match the collection NSID the record lives in (the first segment of the MST key). A mismatch is a lexicon validation failure, not just a mis-categorization.

### 1.2. Supported value types

DAG-CBOR (and therefore the repo) supports:

| CBOR value    | DRISL treatment          | Typical use in records                                |
| ------------- | ------------------------ | ----------------------------------------------------- |
| unsigned int  | shortest form, major type 0 | counts, ages, timestamps in some lexicons          |
| negative int  | shortest form, major type 1 | e.g. `delta` fields, net-negative values            |
| float64       | 64-bit, finite only      | lat/long, sentiment score; NaN/Infinity forbidden     |
| text string   | UTF-8, DRISL-strict      | human text, URIs                                      |
| byte string   | raw bytes                | binary payloads — but usually blobs are referenced, not inlined |
| boolean       | `0xf4` / `0xf5`          | flags                                                 |
| null          | `0xf6`                   | optional absence sentinel                             |
| array         | ordered, heterogeneous   | lists of references, facets, tags                     |
| map           | keys sorted bytewise     | nested records and objects                            |
| tag 42 (CID)  | only allowed tag         | links to other records, blobs, or embedded CIDs       |

CBOR tags other than 42 are forbidden (`drisl.md` §5, §8). Undefined, simple values, and big-integer extensions are forbidden.

### 1.3. Blob references

Records refer to binary attachments via **blob references** — not by inlining bytes. The canonical shape (lexicon type `blob`) in JSON is:

```json
{
  "$type": "blob",
  "ref": {"$link": "bafkrei..."},
  "mimeType": "image/png",
  "size": 12345
}
```

In DAG-CBOR (how the record actually sits in the repo), `ref` is a CID encoded as tag 42 pointing to a `raw` codec block (`0x55`), not a dag-cbor block. The blob bytes themselves travel via `com.atproto.sync.getBlob`, not as part of the repo CAR export.

### 1.4. Links between records

To reference another record by its CID, use a `$link` (JSON) / tag 42 (DAG-CBOR) wrapping a dag-cbor CID. Common shapes:

```
{
  "$type": "app.bsky.feed.like",
  "subject": {"uri": "at://did:plc:…/app.bsky.feed.post/…", "cid": "bafyrei…"},
  "createdAt": "2024-01-01T00:00:00Z"
}
```

The `{uri, cid}` pair (called a `com.atproto.repo.strongRef`) is the idiomatic way to reference another record with tamper-evidence: the URI tells you where the record lives, the CID tells you exactly which version.

### 1.5. Size limits

The spec and reference implementations impose practical bounds:

- A single record's encoded size should stay under a few hundred KB. Bluesky's PDS caps at 100 KB per record.
- The whole repo has no hard upper bound, but tree traversal cost is O(log N) in the number of records, so walking a 1M-record repo is still feasible.
- Blobs have their own size caps (typically 1 MB per blob for images) enforced by the PDS.

## 2. NSID — the collection identifier

An NSID (Namespaced Identifier) is a reverse-DNS-style string: `com.example.feature.subfeature`. Used for:

- `$type` on records.
- The collection segment of an MST key (`app.bsky.feed.post` in `app.bsky.feed.post/3k2…`).
- The method name of an XRPC endpoint (`com.atproto.sync.getRepo`).
- Lexicon IDs.

### 2.1. Syntax

- Dot-separated segments, 2 or more segments total.
- Each segment: `[a-zA-Z][a-zA-Z0-9-]*`. Digits or hyphens in the first position of any segment are forbidden.
- Hyphens are allowed, but only within a segment — never at the start or end of a segment.
- Total length ≤ 317 characters; each segment ≤ 63 characters; the final segment ≤ 63 characters but further restricted to `[a-zA-Z]` (no digits, no hyphens). This last restriction keeps NSIDs unambiguous when concatenated with rkeys.
- Case is preserved and meaningful: `app.bsky.feed.Post` is a different NSID than `app.bsky.feed.post` and neither lexicon ecosystem will cross-reference them. In practice, all established NSIDs are lowercase except the final segment, which is `camelCase`.

### 2.2. Examples

- Valid: `com.atproto.repo.putRecord`, `app.bsky.feed.post`, `app.bsky.feed.like`, `com.example.some-app.record`
- Invalid: `.com.example` (leading dot), `com..example` (empty segment), `1com.example` (segment starts with digit), `com.example-` (segment ends with hyphen), `com.example.1record` (final segment not `[a-zA-Z]`-only), `com` (single segment).

### 2.3. Ownership

NSIDs are namespaced by DNS ownership. Registering `com.yourcompany.feature` is conceptually like registering a DNS name — the tree of lexicons under `com.yourcompany` is yours to define. The spec doesn't enforce this cryptographically; it's social convention backed by the AppView ecosystem.

## 3. TID — the default record key

TIDs are timestamp-based identifiers used as record keys when the lexicon doesn't specify a fixed key.

### 3.1. Format

- **Exactly 13 ASCII characters**.
- **Alphabet**: `234567abcdefghijklmnopqrstuvwxyz` (base32-sortable). No `0`, `1`, `8`, `9`, no uppercase.
- **Structure** (64-bit big-endian integer, encoded 5 bits per char, highest-bit-first):
  - Bit 63: always `0`. In the base32-sortable encoding this restricts the **first character** to `234567abcdefghij` (values 0–15 in the alphabet).
  - Bits 62–10: 53-bit microsecond timestamp (UNIX epoch).
  - Bits 9–0: 10-bit clock identifier (random or sequentially allocated per-PDS to avoid collisions within a single microsecond).

### 3.2. Sortability

Because characters in `234567abcdefghijklmnopqrstuvwxyz` sort bytewise in the same order as their 5-bit values, and the encoding is big-endian, TID strings sort *as strings* in the same order as their underlying 64-bit integers — which is the same order as their timestamps. That's the whole point: the PDS can emit a new TID for each new record and rely on the MST's bytewise key order to put newer records after older ones.

### 3.3. Generation rules

- Must be strictly greater than the previous TID the PDS has emitted for this account (monotonicity).
- When the system clock moves backwards, advance to `previous_timestamp + 1` rather than regress.
- When two TIDs would share a timestamp, bump the clock identifier (or use a random clock ID).
- Clock identifier width (10 bits = 1024 values) supports up to 1024 TIDs per microsecond per PDS — far above any realistic record-creation rate.

### 3.4. Parsing and validation

A consumer receiving a TID string should:

- Check length is exactly 13.
- Check every character is in the base32-sortable alphabet.
- Check the first character is in `234567abcdefghij` (the top bit must be 0).
- Optionally decode to `(timestamp_us, clock_id)` for diagnostic purposes.

The wall-clock time is not to be trusted — a PDS can emit a TID slightly in the future, and clock drift is real. Treat TID as an ordering key first, a timestamp second.

### 3.5. Examples

- Valid: `3jzfcijpj2z2a`, `7777777777777`, `2222222222222`
- Invalid: `3jzfcijpj2z2` (12 chars), `3jzfcijpj2z2aa` (14 chars), `AAAAAAAAAAAAA` (uppercase not in alphabet), `zzzzzzzzzzzzz` (decodes with top bit set; first char must be `2-7` or `a-j`).

## 4. Record key (`rkey`)

The rkey is the second half of an MST key. Rules:

- Most collections use TIDs as rkeys (posts, likes, reposts, follows).
- Some lexicons specify a fixed rkey (`app.bsky.actor.profile` always uses `rkey = "self"`; `app.bsky.feed.generator` uses a custom name).
- Lexicons may accept an open alphabet; the general-purpose rkey rule is: `[A-Za-z0-9._~:-]{1,512}` with no slashes, no `%`, no spaces.
- Two special sentinels: `self` (singleton records) and explicit rkeys chosen by the lexicon.
- **Uniqueness**: `(collection, rkey)` pairs must be unique within a repo. Inserting a record at an existing key overwrites (the MST records a new `v` CID).

## 5. AT-URI

AT-URIs name records externally. The syntax is `at://<authority>/<collection>/<rkey>[/<fragment-or-subpath>]`, though for record addressing only the three-segment form is meaningful.

### 5.1. Authority

- **In stored data and in repo exports, the authority is always a DID.** A record stored at `at://did:plc:xxx/app.bsky.feed.post/3k…` is unambiguous because the DID is the account's permanent identifier.
- In URIs that appear inside records (a post referencing another post's URI), either a DID or a handle is accepted by parsers at read time, but the canonical stored form is a DID. A handle-authority URI must be resolved to a DID-authority URI before indexing.
- **Handles in URIs are rejected by the reference `ATURI::from_str()` parser** — see `atproto-record/src/aturi.rs:90`. That's a deliberate choice: the parser's contract is that it returns a DID. Code that accepts handles does so at a higher layer, before handing the DID-form URI to the parser.

Supported DID methods in the authority position: `did:plc`, `did:web`, `did:webvh`. `did:key` and all other methods are rejected.

### 5.2. Collection

The collection segment is an NSID (see §2). Its rules apply unchanged inside an AT-URI.

### 5.3. Record key

The rkey segment is the record key as described in §4. No percent-encoding is applied — rkeys use only URL-safe characters anyway.

### 5.4. Fragments and extra path components

- Extra path segments after the rkey are permitted by the scheme but not meaningful for record addressing. The reference parser silently ignores them: `at://did:…/app.bsky.feed.post/3k…/extra/path` gives the same three-field result as without `/extra/path`.
- Trailing slashes are rejected by the reference parser.
- Fragments (`#…`) are used by some URIs to point at sub-fields (like `#atproto` for a DID document's signing key), but `ATURI::from_str` does not parse them; they're treated as part of the rkey if present, which almost certainly isn't what the producer intended.

### 5.5. Examples

- Valid: `at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3jui7kp54ic2i`
- Valid: `at://did:web:example.com/app.bsky.feed.post/3jui7kp54ic2i`
- Valid: `at://did:web:example.com:8080:tenant:path/app.bsky.feed.like/3k2akjh32kj` (non-strict did:web path form, reference-impl-accepted)
- Valid: `at://did:plc:abcdefghijklmnopqrstuvwx/b/c` (minimal three-segment form)
- Rejected: `at://alice.bsky.social/app.bsky.feed.post/3k…` — handle authority. Resolve first.
- Rejected: `at://did:key:z…/…` — unsupported DID method.
- Rejected: `did:plc:…/app.bsky.feed.post/3k…` — missing `at://` prefix.
- Rejected: `at://did:plc:xxx/app.bsky.feed.post/3k…/` — trailing slash.
- Rejected: `at://did:plc:xxx/` — missing collection.
- Rejected: `at://did:plc:xxx/app.bsky.feed.post` — missing rkey.
- Rejected: `at://did:plc:xxx//3k…` — empty collection.

## 6. Putting it together

An AT-URI like `at://did:plc:ewvi7nxzyoun6zhxrhs64oiz/app.bsky.feed.post/3jzfcijpj2z2a` corresponds to:

- **DID** `did:plc:ewvi7nxzyoun6zhxrhs64oiz` — resolve via `atproto-identity-resolution` to get the PDS endpoint and signing key.
- **MST key** `app.bsky.feed.post/3jzfcijpj2z2a` — the path within the repo's MST.
- **Record** at that key — a DAG-CBOR map with `$type = "app.bsky.feed.post"` and whatever `app.bsky.feed.post` lexicon fields the post carries.

To fetch the record: `com.atproto.repo.getRecord?repo=<did>&collection=<nsid>&rkey=<rkey>`. To fetch just its bytes by CID: `com.atproto.sync.getBlocks?did=<did>&cids=<cid>`. To fetch the whole repo: `com.atproto.sync.getRepo?did=<did>` — returns a CAR.

## 7. Common errors

| Symptom                                                 | Likely cause                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| `$type` value doesn't match the collection              | Record stored in the wrong collection, or `$type` hand-edited. Lexicon validation fails. |
| "missing `$type`" when decoding a record                | Upstream put a partial update into the repo or stripped `$type` for JSON display. The `$type` is non-negotiable in the stored form. |
| `ATURI::HandleNotSupported`                             | Caller passed a handle-authority URI to `ATURI::from_str`. Resolve the handle to a DID first (`atproto-identity-resolution`). |
| `TidError::InvalidLength`                               | TID has the wrong number of characters. Regenerate.                                    |
| `TidError::InvalidCharacter`                            | Typo or encoded in the wrong alphabet (base32 != base32-sortable).                    |
| `TidError::InvalidFormat "Top bit must be 0"`           | First char outside `234567abcdefghij` — the top bit of the 64-bit integer is set.      |
| NSID rejected with "digit in first position of segment" | `1record`, `0abc`; segments must start with a letter.                                  |
| Records appear in the wrong order when iterating        | Comparing keys as Unicode strings instead of bytewise. Bytewise over UTF-8 is spec.    |
| A record has `null` for `$type`                         | Producer bug — `$type` is required. Reject at lexicon validation step.                |

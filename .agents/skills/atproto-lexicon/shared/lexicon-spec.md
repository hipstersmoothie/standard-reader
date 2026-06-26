# Lexicon Document Structure (Reference)

Source of truth: https://atproto.com/specs/lexicon

A lexicon is a single JSON document that describes one NSID's surface: record shape, XRPC method, or shared type definitions. Every lexicon file declares one `id` (its NSID) and one `defs` map.

## 1. Top-level shape

```json
{
  "lexicon": 1,
  "id": "com.example.feed.post",
  "revision": 3,
  "description": "optional free-text description",
  "defs": { ... }
}
```

| Field         | Type             | Required | Notes                                                       |
| ------------- | ---------------- | -------- | ----------------------------------------------------------- |
| `lexicon`     | integer          | yes      | Always `1`. No other version is defined.                    |
| `id`          | string (NSID)    | yes      | Must equal the document's NSID. Case-sensitive match.       |
| `revision`    | integer          | no       | Monotonic hint for consumers. Not enforced at the protocol. |
| `description` | string           | no       | Free text. Propagates to generated docs.                    |
| `defs`        | object           | yes      | Map of def-name to def body.                                |

## 2. The `defs` map

- Keys match `[a-zA-Z][a-zA-Z0-9]*`. No hyphens, no dots.
- `main` is the primary export. References without a fragment (`com.example.foo`) resolve to `main`.
- For **primary types** (`query`, `procedure`, `subscription`, `record`), the def **must** be named `main`. Only one primary type per lexicon.
- **Secondary types** (`object`, `token`, `array`, `string`, `union`, etc.) may appear under any name and be cross-referenced by other lexicons.

## 3. Def types — complete list

### Primary types (named `main` only)

| Type           | Purpose                           | Key fields                                            |
| -------------- | --------------------------------- | ----------------------------------------------------- |
| `query`        | Read-only XRPC method (HTTP GET)  | `parameters`, `output`, `errors`                      |
| `procedure`    | Write XRPC method (HTTP POST)     | `parameters`, `input`, `output`, `errors`             |
| `subscription` | WebSocket event stream            | `parameters`, `message`, `errors`                     |
| `record`       | Persisted repository record       | `key`, `record` (inner object def)                    |

### Field and value types

| Type       | Body fields                                                                                                               |
| ---------- | ------------------------------------------------------------------------------------------------------------------------- |
| `null`     | —                                                                                                                         |
| `boolean`  | `default`, `const`                                                                                                        |
| `integer`  | `minimum`, `maximum`, `enum`, `default`, `const`                                                                          |
| `string`   | `format`, `minLength`, `maxLength`, `minGraphemes`, `maxGraphemes`, `knownValues`, `enum`, `default`, `const`             |
| `bytes`    | `minLength`, `maxLength` (length in bytes)                                                                                |
| `cid-link` | — (JSON `{"$link":"<cid>"}`; CBOR tag 42)                                                                                 |
| `blob`     | `accept` (array of MIME glob patterns), `maxSize`                                                                         |
| `array`    | `items` (inline type), `minLength`, `maxLength`                                                                           |
| `object`   | `properties`, `required`, `nullable`                                                                                      |
| `params`   | Restricted object — only valid on `parameters`. `properties` must be primitives or arrays of primitives. `required`.      |
| `token`    | Marker value; referenced by NSID. No runtime shape.                                                                       |
| `ref`      | `ref` — single target (`com.example.foo#bar` or bare NSID).                                                               |
| `union`    | `refs` — array of targets. `closed` (default `false`).                                                                    |
| `unknown`  | — accepts any DAG-CBOR/JSON value.                                                                                        |

## 4. String formats

The `format` field on a `string` type constrains the runtime value. Defined formats:

- `at-identifier` — DID or handle
- `at-uri` — see `at-uri.md`
- `cid` — string-form CID
- `datetime` — RFC 3339 / ISO 8601 timestamp
- `did` — DID string
- `handle` — handle string
- `nsid` — NSID string
- `tid` — 13-char sortable record-key
- `record-key` — see `at-uri.md §rkey`
- `uri` — any URI
- `language` — BCP-47 language tag

Spec: https://atproto.com/specs/lexicon#string-formats

## 5. Compound shapes (cheatsheet)

```text
object       : {type:"object", properties:{...}, required?:[...], nullable?:[...]}
array        : {type:"array", items:<type>, minLength?, maxLength?}
ref          : {type:"ref", ref:"<nsid>[#def]"}
union        : {type:"union", refs:["<nsid>[#def]", ...], closed?:bool}
params       : {type:"params", properties:{...}, required?:[...]}
record       : {type:"record", key:<rkey-format>, record:<object-def>}
query        : {type:"query", parameters?:<params>, output?:<body>, errors?:[{name, description?}]}
procedure    : {type:"procedure", parameters?:<params>, input?:<body>, output?:<body>, errors?:[...]}
subscription : {type:"subscription", parameters?:<params>, message?:<msg-schema>, errors?:[...]}
body         : {encoding:"<mime>", schema?:<object|ref|union>, description?}
```

`record.key` values:

- `"tid"` — 13-char base32-sortable TID (the default, used for collection-like records).
- `"nsid"` — a valid NSID as the key (used when the key is a type token).
- `"literal:<value>"` — exactly that string (e.g., `literal:self` for singleton records like `app.bsky.actor.profile`).
- `"any"` — 1–512 bytes from `[A-Za-z0-9._:~-]`, not `.` and not `..`.

## 6. Reserved names

- `main` is the only reserved def name (spec convention; implied by fragment-less refs).
- No other def name is syntactically reserved. `params` is a def **type** keyword, not a reserved def name.
- NSID reserved prefixes (`com.atproto.*`, `app.bsky.*`) are convention, not protocol rule; see `nsid.md §reserved prefixes`.

## 7. Validation strictness — what the spec mandates

The spec defines the validation rules but does **not** standardize strict-vs-lenient behavior for unknown fields. Consensus practice:

- **Strict validation** — used at record-write time (PDS acceptance): rejects unknown fields, enforces every `required`/`nullable` rule, rejects closed-union `$type` not in `refs`, rejects `enum` values outside the declared set.
- **Lenient validation** — used at read-time and across versions: accepts unknown fields (passes them through), tolerates unknown closed-union variants by keeping them opaque.

`type: "unknown"` is an escape hatch. It matches any DAG-CBOR/JSON value and is **not** recursively validated by default. Implementations that look inside `unknown` values for a `$type` and perform nested validation do so as an extension, not by spec mandate. See `divergence-matrix.md`.

## 8. Canonicalization vs. validation

Validation operates on decoded values. Canonicalization operates on encoded bytes.

- CID stability requires DRISL canonical DAG-CBOR (see `atproto-repository` §drisl).
- A record that validates but was encoded non-canonically will have the wrong CID. Servers re-encode canonically on write.
- Order of operations on write: decode input → validate against lexicon → re-encode as DRISL → compute CID.

## 9. Ambiguities (spec-level, not library-level)

Tracked here so Claude doesn't assume the spec resolves every edge case:

1. `nullable` + `required` interaction — the spec text is terse. Consensus: a field listed in both must be present and may be `null`.
2. `$type` on non-union objects — the spec doesn't say whether to reject or ignore unexpected `$type`. Implementations diverge.
3. HTTP status code → error-name mapping in XRPC is not formally defined. Clients treat status as a rough category.
4. Strict-vs-lenient unknown-field handling is not mandated; see `divergence-matrix.md`.
5. `type: "unknown"` containing a `$type`-tagged object — validators diverge on whether to recursively apply a known schema.
6. Spec pages alternate between "DAG-CBOR" and "DRISL". Treat DRISL (https://dasl.ing/drisl.html) as authoritative for canonicalization; DAG-CBOR is a near-superset.
7. Backward-compat rules (see `backward-compat.md`) are community convention — the lexicon spec calls out the topic but does not enumerate the full matrix.
8. `record.key: "any"` byte-set rules are described on the record-key page but cross-references to AT-URI rules are not fully consistent.

## See also

- `nsid.md` — NSID grammar and reserved prefixes.
- `at-uri.md` — AT-URI grammar in records and refs.
- `record-model.md` — `$type` dispatch, strongRef, blob refs.
- `xrpc-wire.md` — HTTP and WebSocket wire rules.
- `backward-compat.md` — breaking vs. non-breaking change matrix.
- `test-vectors.md` — canonical fixtures.
- `divergence-matrix.md` — cross-language implementation differences.

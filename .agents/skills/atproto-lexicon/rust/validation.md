# Rust — validating records and XRPC payloads

This file covers record and method-payload validation against a `BaseCatalog`. The rules enforced by these functions are defined in `../shared/lexicon-spec.md` §7–8 and `../shared/record-model.md`.

## 1. Public entry points

```rust
use atproto_lexicon::{
    BaseCatalog, Catalog, Schema, ValidateFlags,
    validate_record, validate_record_with_schema,
    validate_query_params, validate_procedure_input, validate_procedure_params,
    DataValidationError,
};
```

Function signatures:

```rust
pub fn validate_record(
    nsid: &str,
    value: &serde_json::Value,
    catalog: &dyn Catalog,
    flags: ValidateFlags,
) -> Result<(), DataValidationError>;

pub fn validate_record_with_schema(
    schema: &Schema,
    value: &serde_json::Value,
    catalog: &dyn Catalog,
    flags: ValidateFlags,
) -> Result<(), DataValidationError>;

pub fn validate_query_params(
    nsid: &str, params: &serde_json::Value, catalog: &dyn Catalog, flags: ValidateFlags,
) -> Result<(), DataValidationError>;

pub fn validate_procedure_input(
    nsid: &str, body: &serde_json::Value, catalog: &dyn Catalog, flags: ValidateFlags,
) -> Result<(), DataValidationError>;

pub fn validate_procedure_params(
    nsid: &str, params: &serde_json::Value, catalog: &dyn Catalog, flags: ValidateFlags,
) -> Result<(), DataValidationError>;
```

`validate_record` enforces the top-level `$type` match:

- The `$type` field on `value` MUST equal `nsid` (or `nsid#main`).
- A mismatch surfaces as `DataValidationError::TypeMismatch`.

## 2. `ValidateFlags`

```rust
bitflags::bitflags! {
    pub struct ValidateFlags: u32 {
        const ALLOW_LEGACY_BLOB         = 0b0001;
        const ALLOW_LENIENT_DATETIME    = 0b0010;
        const STRICT_RECURSIVE_VALIDATION = 0b0100;
    }
}
```

| Flag                              | Effect                                                                                       |
| --------------------------------- | -------------------------------------------------------------------------------------------- |
| (empty)                           | Strict. Rejects legacy blobs. Accepts only RFC 3339 datetimes.                               |
| `ALLOW_LEGACY_BLOB`               | Accepts pre-v1 blob shape (`{cid, mimeType}` without wrapper). Use only for reading old data. |
| `ALLOW_LENIENT_DATETIME`          | Accepts relaxed datetime syntax (e.g., missing seconds, non-Z offsets).                      |
| `STRICT_RECURSIVE_VALIDATION`     | Inside `type:"unknown"` values that carry a `$type`, attempt to validate recursively.        |

Common combination: `ValidateFlags::ALLOW_LEGACY_BLOB | ValidateFlags::ALLOW_LENIENT_DATETIME` when reading historical records.

## 3. The `DataValidationError` enum

Match exhaustively to provide good error messages. Key variants:

```rust
pub enum DataValidationError {
    SchemaNotFound { nsid: String },
    RefNotFound    { target: String },
    TypeMismatch   { expected: String, got: String, path: String },
    MissingField   { path: String, field: String },
    UnknownField   { path: String, field: String },
    InvalidFormat  { path: String, format: String, reason: String },
    ConstraintViolation { path: String, rule: String, reason: String },
    UnionClosed    { path: String, allowed: Vec<String>, got: String },
    BlobLegacyRejected { path: String },
    // … plus several more.
}
```

`path` is a JSON Pointer-like string identifying where validation failed (e.g., `/reply/cid`). Surface it to users.

## 4. Strict vs. lenient — which to use where

- **Write path (accepting records into your system):** strict. `ValidateFlags::empty()`. Reject legacy blobs, reject unknown fields. Your lexicon is the contract.
- **Read path (consuming records from the network):** lenient. `ValidateFlags::ALLOW_LEGACY_BLOB | ValidateFlags::ALLOW_LENIENT_DATETIME`. You may encounter records from older producers.
- **Strongly-typed internal code:** strict after first parse. Once you've normalized, every subsequent check should be cheap and strict.

## 5. Validating an XRPC request

```rust
use atproto_lexicon::{validate_query_params, validate_procedure_input};

// Validating an incoming com.atproto.repo.getRecord call:
validate_query_params(
    "com.atproto.repo.getRecord",
    &params_json,
    &catalog,
    ValidateFlags::empty(),
)?;

// Validating an incoming com.atproto.repo.putRecord body:
validate_procedure_input(
    "com.atproto.repo.putRecord",
    &input_json,
    &catalog,
    ValidateFlags::empty(),
)?;
```

Both accept `serde_json::Value`. Convert to `DataValue` first if you want a neutral representation that retains `Blob` / `CIDLink` types after parsing.

## 6. Worked example — validating a note record

```rust
use atproto_lexicon::{BaseCatalog, ValidateFlags, validate_record};

let mut catalog = BaseCatalog::new();
catalog.add_schema_json(include_str!("../lexicons/com/example/note.json"))?;

let raw = r#"{
    "$type":     "com.example.note",
    "text":      "hello",
    "createdAt": "2026-04-21T12:00:00.000Z"
}"#;

let value: serde_json::Value = serde_json::from_str(raw)?;
match validate_record("com.example.note", &value, &catalog, ValidateFlags::empty()) {
    Ok(()) => { /* accept */ }
    Err(DataValidationError::MissingField { path, field }) => {
        eprintln!("missing {field} at {path}");
    }
    Err(DataValidationError::ConstraintViolation { path, rule, reason }) => {
        eprintln!("{path}: {rule}: {reason}");
    }
    Err(e) => eprintln!("{e:?}"),
}
```

## 7. The `DataValue` representation

`DataValue` is the neutral record model used by the validator. Useful when you want to retain blob-ref and cid-link identity:

```rust
use atproto_lexicon::{DataValue, Blob, CIDLink, Bytes};

match &value {
    DataValue::Object(map) => {
        if let Some(DataValue::Blob(blob)) = map.get("image") {
            // blob.is_modern() / is_legacy()
            if let Some(cid) = blob.get_cid() {
                // CIDLink::link is the CID string.
            }
            // blob.mime_type, blob.size
        }
    }
    _ => {}
}
```

`DataValue` variants: `Null, Boolean, Integer, Float, String, Bytes, Link (CIDLink), Blob, Array, Object`. Use `.is_*()` predicates and `.as_*()` accessors.

Convert from `serde_json::Value` with `DataValue::try_from(value)` (or construct with `DataValue::Object(...)` directly); JSON → DataValue preserves `{"$link":...}` as `Link` and blob wrappers as `Blob`.

## 8. Common pitfalls

- **`$type` missing or wrong NSID.** `validate_record` checks this explicitly. Decoders that elide `$type` on the wire will always fail strict validation.
- **strongRef `cid` encoded as a CID-link.** The lexicon type for `strongRef.cid` is `string` (format `cid`), not `cid-link`. Values must be plain strings in JSON, not `{"$link": "..."}`. See `../shared/record-model.md §strongRef`.
- **Datetime format mismatches.** Default is strict RFC 3339. Missing milliseconds or non-`Z` offsets without `ALLOW_LENIENT_DATETIME` will fail.
- **Unknown fields.** `DataValidationError::UnknownField` surfaces on strict validation. If you genuinely need forward-compat at read time, flip to lenient flags — don't silence the error.
- **Catalog not populated.** `SchemaNotFound` at validate time means `catalog.resolve(nsid)` returned `None`. Debug by calling `catalog.get_schema_file(nsid)`.

## 9. See also

- `authoring.md` — building the catalog the validator consumes.
- `xrpc-client.md` — validating request/response payloads at the transport layer.
- `records.md` — typed record dispatch and Blob/CIDLink manipulation.
- `../shared/lexicon-spec.md §7–8` — strict vs. lenient rules.
- `../shared/record-model.md` — strongRef and blob shapes.
- `../shared/divergence-matrix.md §2` — how strictness compares to TS and Go.

# Rust — `atproto-lexicon` / `atproto-client` setup

Rust lexicon and XRPC work is split across a few crates in the `atproto-identity-rs` workspace. This skill centers on `atproto-lexicon` (schema model + validation) and `atproto-client` (XRPC invocation over HTTP), with `atproto-jetstream` for subscriptions.

Source: <https://tangled.org/ngerakines.me/atproto-crates>. Crates are published on crates.io / docs.rs.

> **Scope note.** This file covers protocol-level lexicon authoring, schema validation, XRPC invocation, and generic record parsing (`$type` dispatch, `strongRef`, blob refs). Bluesky-domain record idioms — `app.bsky.richtext.facet`, embeds, threadgates, label value definitions — are **out of scope for this plugin entirely** and live with `@atproto/api` equivalents in downstream Bluesky tooling. If the user asks about richtext facets or embeds, say so and point at the Bluesky AppView docs.

## Install

Lexicon validation only:

```toml
[dependencies]
atproto-lexicon = "0.14"
```

Lexicon + XRPC client:

```toml
[dependencies]
atproto-lexicon = "0.14"
atproto-client  = "0.14"        # HTTP client + com.atproto.repo.* helpers
serde           = { version = "1", features = ["derive"] }
serde_json      = "1"
tokio           = { version = "1", features = ["full"] }
reqwest         = "0.12"
```

For firehose / jetstream consumers:

```toml
[dependencies]
atproto-jetstream = "0.14"
```

For records helpers (TIDs, AT-URIs, typed records):

```toml
[dependencies]
atproto-record = "0.14"         # pulls atproto-dasl and atproto-identity
```

## Crate map

| Crate              | Handles                                                                               | See file |
| ------------------ | ------------------------------------------------------------------------------------- | -------- |
| `atproto-lexicon`  | Lexicon document model, NSID resolver, catalog, record validation.                    | `authoring.md`, `validation.md` |
| `atproto-client`   | HTTP client with `Auth::{None, DPoP, AppPassword}`, `com::atproto::repo::*` helpers.  | `xrpc-client.md` |
| `atproto-record`   | TIDs, AT-URIs, typed record dispatch.                                                 | `records.md` |
| `atproto-jetstream`| Firehose / Jetstream consumer with CBOR frame decoding.                               | `xrpc-client.md §subscriptions` |
| `atproto-xrpcs`    | Server-side XRPC framework (out of this skill's scope beyond awareness).              | —        |

Each crate is DRISL-strict by default.

## Public surface at a glance

From `atproto-lexicon`:

```rust
pub use errors::{LexiconError, ResolverError};
pub use resolve::{DefaultLexiconResolver, LexiconResolver};
pub use validation::{
    Blob, Bytes, CIDLink, DataValue, ValidateFlags,
    BaseCatalog, Catalog, Schema, SchemaDef, SchemaFile,
    DataValidationError, validate_record, validate_record_with_schema,
    validate_query_params, validate_procedure_input, validate_procedure_params,
};
```

From `atproto-client`:

```rust
pub enum Auth {
    None,
    DPoP(DPoPAuth),
    AppPassword(AppPasswordAuth),
}

// Transport helpers:
pub async fn get_json<T: DeserializeOwned>(
    http: &reqwest::Client, auth: &Auth, url: &str,
) -> Result<T, Error>;
pub async fn post_json<T: DeserializeOwned, B: Serialize>(
    http: &reqwest::Client, auth: &Auth, url: &str, body: &B,
) -> Result<T, Error>;
// Variants: get_dpop_json, get_apppassword_json, post_dpop_json,
//           post_apppassword_json, and *_with_headers companions.

pub mod com::atproto::repo {
    pub async fn get_record(
        http: &reqwest::Client, auth: &Auth, base_url: &str,
        repo: &str, collection: &str, rkey: &str, cid: Option<&str>,
    ) -> Result<GetRecordResponse, Error>;
    // list_records, create_record, put_record, delete_record, get_blob.
}
```

## Typical wiring — validate a record

```rust
use atproto_lexicon::{BaseCatalog, ValidateFlags, validate_record};

let mut catalog = BaseCatalog::new();
catalog.add_schema_json(include_str!("../lexicons/com/example/note.json"))?;

let value: serde_json::Value = serde_json::from_str(record_json)?;
validate_record(
    "com.example.note",
    &value,
    &catalog,
    ValidateFlags::empty(),   // strict by default
)?;
```

`BaseCatalog::new()` is empty. Load schemas with `.add_schema(SchemaFile)` or `.add_schema_json(&str)` — do it once at startup. The `Catalog` trait (`resolve`, `get_schema_file`) is public so callers can plug in their own resolver, but `BaseCatalog` covers the common case.

## Typical wiring — call an XRPC method

```rust
use atproto_client::{Auth, com::atproto::repo::get_record};
use reqwest::Client;

let http = Client::new();
let auth = Auth::AppPassword(AppPasswordAuth { jwt: token, did: my_did });

let response = get_record(
    &http,
    &auth,
    "https://bsky.social",
    "did:plc:abc123",
    "app.bsky.feed.post",
    "3jwdwj2ctlk26",
    None,                  // optional CID pin
).await?;

match response {
    GetRecordResponse::Record { uri, cid, value, extra } => {
        // value is serde_json::Value — validate with BaseCatalog or decode into a struct.
    }
    GetRecordResponse::Error(err) => {
        // err.error is the lexicon error name; err.message is free text.
    }
}
```

## Idioms

- **Async everywhere.** The client and resolver are `async`; wrap in `tokio::main` or a `tokio::runtime::Runtime`.
- **Validate at boundaries.** Decode → validate → operate on the typed representation. Don't validate repeatedly on the same value.
- **`DataValue` is the neutral representation.** It mirrors `serde_json::Value` but with first-class `Blob`, `CIDLink`, and `Bytes`. Use it when working with arbitrary records whose lexicons you don't have at compile time.
- **`Auth` is an explicit enum.** `Auth::None` is valid for anonymous calls (many `com.atproto.identity.*` methods, some `app.bsky.*` reads). `Auth::DPoP` wraps an OAuth session; `Auth::AppPassword` wraps a legacy session.
- **No panics on normal input.** Validation and decode surface `DataValidationError` and `LexiconError` with structured variants. Match exhaustively.
- **Catalog is mutable at build, borrowed at use.** Build in `main`, pass `&catalog` everywhere.

## When to use which crate

| Want to…                                                    | Use…                                                             |
| ----------------------------------------------------------- | ---------------------------------------------------------------- |
| Validate a record against a lexicon                         | `atproto_lexicon::validate_record`                               |
| Resolve a lexicon NSID over the network                     | `DefaultLexiconResolver::new(http, dns).resolve(nsid).await`     |
| Parse an AT-URI or TID                                      | `atproto_record::{ATURI, Tid}`                                   |
| Fetch / write a record on a PDS                             | `atproto_client::com::atproto::repo::{get_record, create_record, put_record, delete_record}` |
| Call an arbitrary XRPC method                               | `atproto_client::{get_json, post_json}` or `_dpop` / `_apppassword` variants |
| Consume the firehose                                        | `atproto-jetstream`                                              |
| Typed record dispatch (`$type` → struct)                    | `atproto_record` typed records                                   |

## See also

- `authoring.md` — writing a lexicon, loading it into a catalog.
- `validation.md` — strict vs. lenient flags, `DataValidationError` variants.
- `xrpc-client.md` — the `Auth` enum, method calls, subscription consumers.
- `records.md` — typed records, AT-URIs, strongRef and blob helpers.
- `../shared/lexicon-spec.md`, `../shared/xrpc-wire.md`, `../shared/record-model.md` — language-neutral rules these crates implement.
- `../shared/divergence-matrix.md` — how this stack compares to TypeScript and Go.

# Rust — invoking XRPC methods

Procedure-oriented guide for calling query, procedure, and subscription methods using `atproto-client` and `atproto-jetstream`.

## 1. The `Auth` enum

```rust
use atproto_client::Auth;

pub enum Auth {
    None,
    DPoP(DPoPAuth),
    AppPassword(AppPasswordAuth),
}
```

- `Auth::None` — no Authorization header. Valid for anonymous reads (many `app.bsky.*` reads, some `com.atproto.identity.*` calls).
- `Auth::DPoP` — OAuth session. The helper signs a DPoP proof per request and sets `Authorization: DPoP <access>` plus `DPoP: <proof>`. See `../../atproto-oauth`.
- `Auth::AppPassword` — legacy session. Sets `Authorization: Bearer <jwt>`.

The client infers which transport helper to call based on `auth`:

- `get_json` / `post_json` — when `Auth::None`.
- `get_dpop_json` / `post_dpop_json` — when `Auth::DPoP`.
- `get_apppassword_json` / `post_apppassword_json` — when `Auth::AppPassword`.

The public `*_with_headers` variants accept extra request headers (e.g., `Accept-Language`, custom labels).

## 2. Query — reading records

Use the high-level helpers in `atproto_client::com::atproto::repo` where they exist:

```rust
use atproto_client::{Auth, com::atproto::repo::{get_record, GetRecordResponse}};

let response = get_record(
    &http,
    &auth,
    "https://bsky.social",
    "did:plc:abc123",
    "app.bsky.feed.post",
    "3jwdwj2ctlk26",
    None,            // optional CID pin
).await?;

match response {
    GetRecordResponse::Record { uri, cid, value, extra } => {
        // value: serde_json::Value
    }
    GetRecordResponse::Error(err) => {
        eprintln!("XRPC error: {} ({})", err.error, err.message);
    }
}
```

Available helpers:

- `get_record(http, auth, base_url, repo, collection, rkey, cid)`
- `list_records(http, auth, base_url, params: ListRecordsParams) -> ListRecordsResponse`
- `create_record(http, auth, base_url, input) -> CreateRecordResponse`
- `put_record(http, auth, base_url, input) -> PutRecordResponse`
- `delete_record(http, auth, base_url, input) -> DeleteRecordResponse`
- `get_blob(http, auth, base_url, did, cid) -> Bytes`

### Schema-agnostic calls

When you need a method without a prebuilt helper, drop to the generic JSON transport:

```rust
use atproto_client::post_json;

#[derive(serde::Serialize)]
struct Input { foo: String }

#[derive(serde::Deserialize)]
struct Output { bar: i64 }

let output: Output = post_json(
    &http, &auth,
    "https://example.com/xrpc/com.example.doThing",
    &Input { foo: "hi".into() },
).await?;
```

## 3. Procedure — writing records

```rust
use atproto_client::com::atproto::repo::{create_record, CreateRecordInput};

let input = CreateRecordInput {
    repo:       "did:plc:abc123".into(),
    collection: "app.bsky.feed.post".into(),
    rkey:       None,                    // server mints a TID
    validate:   Some(true),              // server-side lexicon check
    record:     record_value,            // serde_json::Value
    swap_commit: None,
};

let out = create_record(&http, &auth, "https://bsky.social", &input).await?;
// out.uri, out.cid
```

Validate on the client before calling. A PDS will reject with `InvalidRecord` if the body fails its own lexicon validation — surface that to users verbatim.

## 4. Lexicon-level validation on the client

Validating the payload before sending catches bugs early:

```rust
use atproto_lexicon::{validate_procedure_input, ValidateFlags};

validate_procedure_input(
    "com.atproto.repo.createRecord",
    &input_json,
    &catalog,
    ValidateFlags::empty(),
)?;
```

Validate `com.atproto.repo.createRecord.record` (the inner record) separately with `validate_record` against the collection's lexicon.

## 5. Error handling

`atproto_client::Error` surfaces transport and protocol failures:

- `Error::Http(_)` — reqwest error (connection, DNS, TLS).
- `Error::Status { code, body }` — non-2xx where the body wasn't parseable as the expected error shape.
- `Error::Api(ApiError)` — structured XRPC error (`ApiError { error: String, message: String }`).

```rust
match get_record(&http, &auth, base, repo, coll, rkey, None).await {
    Ok(GetRecordResponse::Record { .. }) => { /* success */ }
    Ok(GetRecordResponse::Error(err)) if err.error == "RecordNotFound" => {
        // surface a 404 to the user
    }
    Ok(GetRecordResponse::Error(err)) => eprintln!("{err:?}"),
    Err(e) => eprintln!("transport: {e}"),
}
```

Error names come from the lexicon's `errors` list. Clients **must** tolerate unknown error names (`../shared/xrpc-wire.md §5`).

## 6. Subscriptions — `atproto-jetstream`

`atproto-jetstream` consumes the firehose (or a Jetstream relay) over WebSocket:

```rust
use atproto_jetstream::{JetstreamClient, Event};

let client = JetstreamClient::connect("wss://jetstream.atproto.tools/subscribe").await?;

while let Some(event) = client.next().await? {
    match event {
        Event::Commit(commit) => {
            // commit.repo (DID), commit.ops (iter of RepoOp), commit.blocks (CAR bytes)
        }
        Event::Identity(ident) => { /* handle change */ }
        Event::Account(acct) => { /* lifecycle */ }
        Event::Error(err) => eprintln!("jetstream error: {err}"),
    }
}
```

Key points:

- The client hides frame decoding — you receive a typed `Event`.
- For the raw `com.atproto.sync.subscribeRepos` frames, decode two DAG-CBOR objects per binary message: header `{op, t}` then the body. See `../shared/xrpc-wire.md §6`.
- Heavy work per event should go on a worker task; don't block the read loop.
- Reconnection / cursor persistence is the caller's responsibility.

## 7. `at-uri` inputs

Many XRPC parameters accept AT-URIs. Parse them first to catch malformed inputs:

```rust
use atproto_record::ATURI;

let uri: ATURI = "at://did:plc:abc123/app.bsky.feed.post/3jwdwj2ctlk26".parse()?;
// uri.authority() -> &str (DID or handle)
// uri.collection() -> Option<&str>
// uri.rkey()       -> Option<&str>
```

See `records.md` for more on AT-URI handling and TID generation.

## 8. Common pitfalls

- **Mixing `Auth` variants.** Passing `Auth::None` to a method that requires auth returns `AuthRequired` 401 from the server — handle it, don't retry blindly.
- **CID pin stale.** Passing `Some(cid)` to `get_record` returns `RecordNotFound` if the record has been updated. Retry without the pin.
- **Mutating the wrong `repo` authority.** `create_record` requires the repo to be one you can write to (matches your session's DID). Writing to another DID returns `AuthenticationRequired`.
- **Rate limits.** `Error::Api` with `error == "RateLimitExceeded"` means back off; the server has headers (`RateLimit-Reset`) — pull them via `*_with_headers` variants if you need to honor them.
- **Procedure `parameters` vs. `input`.** `parameters` goes in the query string, `input` in the body. Not all helpers clearly distinguish — when in doubt, read the lexicon.

## 9. See also

- `authoring.md` — loading lexicons.
- `validation.md` — strict vs. lenient validation flags.
- `records.md` — typed records, AT-URIs, strongRef and blob helpers.
- `../shared/xrpc-wire.md` — normative HTTP and WebSocket rules.
- `../../atproto-oauth/` — how to populate `Auth::DPoP`.

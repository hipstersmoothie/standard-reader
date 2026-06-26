# Rust — records, AT-URIs, TIDs, strongRef, blobs

Companion to `validation.md`. This file covers record-side helpers: parsing AT-URIs, generating TIDs, building strongRefs, handling blob refs, and typed `$type` dispatch. The normative rules are in `../shared/record-model.md` and `../shared/at-uri.md`.

## 1. AT-URIs

Use `atproto_record::ATURI`:

```rust
use atproto_record::ATURI;

let uri: ATURI = "at://did:plc:abc123/app.bsky.feed.post/3jwdwj2ctlk26".parse()?;

uri.authority();   // "did:plc:abc123"
uri.collection();  // Some("app.bsky.feed.post")
uri.rkey();        // Some("3jwdwj2ctlk26")
uri.fragment();    // None
uri.to_string();   // round-trips the canonical form
```

Construction:

```rust
let uri = ATURI::new("did:plc:abc123", "app.bsky.feed.post", "3jwdwj2ctlk26")?;
```

Parsing rejects:

- Non-`at://` schemes.
- Query strings (not permitted — see `../shared/at-uri.md §6`).
- Invalid NSIDs, invalid rkeys.

## 2. TIDs

Use `atproto_record::Tid`:

```rust
use atproto_record::Tid;

let tid = Tid::now();                        // fresh TID at current time
let s   = tid.to_string();                   // "3jwdwj2ctlk26" (13 chars)
let back: Tid = s.parse()?;                  // validate + roundtrip
```

TIDs are monotonic per process. For distributed generation, include a `clock_id` (see `atproto-record` documentation for multi-process TID generation).

## 3. strongRef

`com.atproto.repo.strongRef` is `{uri, cid}` with `cid` as a **string**, not a `cid-link`. Construct inline:

```rust
use atproto_record::ATURI;

#[derive(serde::Serialize, serde::Deserialize)]
struct StrongRef {
    uri: String,          // or ATURI, if you want parse-on-deser
    cid: String,
}

let pin = StrongRef {
    uri: uri.to_string(),
    cid: record_cid_string,   // produced by compute_cid in atproto-dasl
};
```

Common bug: emitting `cid` as `{"$link": "..."}` (a CID link). That does **not** match the strongRef shape. See `../shared/record-model.md §strongRef`.

Computing the target CID (to pin a record you've just fetched or written):

```rust
use atproto_dasl::{to_vec, compute_cid};

let record_bytes = to_vec(&record_value)?;   // DRISL-strict encode
let cid          = compute_cid(&record_bytes); // Cid struct
let pin_cid      = cid.to_string();            // base32 multibase
```

## 4. Blob refs

The modern blob value, as a DataValue:

```rust
use atproto_lexicon::{DataValue, Blob, CIDLink};

let blob = Blob {
    type_marker: "blob".into(),
    ref_link:    Some(CIDLink { link: cid_string.clone() }),
    mime_type:   "image/jpeg".into(),
    size:        12345,
    cid:         None,                // legacy-only field
};
let value = DataValue::Blob(blob);
```

Inspection:

```rust
if blob.is_modern() {
    let cid: Option<&str> = blob.get_cid();     // reads from ref_link
}
if blob.is_legacy() {
    let cid: Option<&str> = blob.get_cid();     // reads from cid
}
```

Serialization:

- Modern → JSON `{"$type":"blob","ref":{"$link":"..."},"mimeType":"...","size":...}`
- Legacy → JSON `{"cid":"...","mimeType":"..."}`

Don't emit legacy form in new writes. Accept legacy only with `ValidateFlags::ALLOW_LEGACY_BLOB` on read.

Uploading a blob and wiring its ref into a record:

```rust
use atproto_client::com::atproto::repo::upload_blob;

let up = upload_blob(&http, &auth, "https://bsky.social", &bytes, "image/jpeg").await?;
// up.blob: serde_json::Value with modern blob shape.
// Insert up.blob into the record's blob-typed field.
```

## 5. Typed `$type` dispatch

`atproto-record` exposes a typed-record registry for `$type` → struct dispatch. Use it when your code operates on a closed set of record types:

```rust
use atproto_record::typed::{register, TypedRecord, TypedRegistry};

#[derive(serde::Deserialize)]
struct NotePost {
    text: String,
    created_at: String,
    // …
}

impl TypedRecord for NotePost {
    const TYPE: &'static str = "com.example.note";
}

let mut registry = TypedRegistry::new();
registry.register::<NotePost>();

// Dispatch:
let record_value: serde_json::Value = /* … */;
let ty = record_value["$type"].as_str().ok_or(/* … */)?;
if let Some(decoded) = registry.decode(ty, &record_value)? {
    // decoded is Box<dyn Any>; downcast to NotePost.
}
```

For open-ended processing (all `app.bsky.*` facets + embeds + threadgates, etc.), use `DataValue` and walk the tree by hand — do not lean on typed dispatch. Bluesky-domain records are out of scope for this skill; consult the Bluesky app's crate ecosystem.

## 6. Pattern — fetch, validate, operate

A canonical read flow that ties validation, typed dispatch, and CID pinning together:

```rust
use atproto_client::com::atproto::repo::{get_record, GetRecordResponse};
use atproto_lexicon::{BaseCatalog, ValidateFlags, validate_record};

async fn fetch_note(
    http: &reqwest::Client,
    auth: &atproto_client::Auth,
    catalog: &BaseCatalog,
    pds: &str,
    repo: &str,
    rkey: &str,
) -> anyhow::Result<Note> {
    let resp = get_record(http, auth, pds, repo, "com.example.note", rkey, None).await?;
    let GetRecordResponse::Record { value, cid, uri, .. } = resp else {
        anyhow::bail!("not found");
    };

    validate_record(
        "com.example.note",
        &value,
        catalog,
        ValidateFlags::ALLOW_LENIENT_DATETIME,  // lenient on read
    )?;

    let note: Note = serde_json::from_value(value)?;
    Ok(note)
}
```

## 7. Pitfalls

- **TID uniqueness across processes.** Independent processes can collide if both use the same clock id. Use distinct clock ids if you run multiple writers.
- **AT-URI handle vs. DID authority.** Persist DIDs, not handles, inside records. See `../shared/at-uri.md §2`.
- **Legacy blobs re-emitted.** If your pipeline reads a legacy blob with lenient flags and re-writes it, upgrade to modern form before writing — legacy is read-only.
- **strongRef pointing at a moved record.** CIDs are stable; URIs are stable; but the target may have been re-written. Detect by re-fetching with the pinned CID — a non-404 implies the edit; a 404 implies deletion.
- **Typed-record registry forgets new `$type`.** Registry lookups return `None` for unregistered types. Surface that as "unknown record type", not an error — let the consumer decide.

## 8. See also

- `validation.md` — running the validator.
- `xrpc-client.md` — fetching records from a PDS.
- `../shared/at-uri.md` — AT-URI grammar.
- `../shared/record-model.md` — `$type`, strongRef, blob rules.
- `../../atproto-repository/rust/commit.md` — signing commits that pin records.
- `../../atproto-cid/rust/` — CID construction for computing pin CIDs.

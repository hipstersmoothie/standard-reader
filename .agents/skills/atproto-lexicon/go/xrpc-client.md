# Go — invoking XRPC methods

Procedure-oriented guide for `indigo/xrpc`, the generated `api/atproto` wrappers, the schema-agnostic `api/agnostic` wrappers, and firehose consumption via `indigo/events`.

## 1. `xrpc.Client`

```go
import (
    "net/http"
    "github.com/bluesky-social/indigo/xrpc"
)

c := &xrpc.Client{
    Client: http.DefaultClient,
    Host:   "https://bsky.social",
    Auth: &xrpc.AuthInfo{
        AccessJwt:  accessJwt,
        RefreshJwt: refreshJwt,
        Did:        "did:plc:abc123",
        Handle:     "alice.example",
    },
    UserAgent: ptr("my-app/1.0"),
    Headers: map[string]string{
        "x-custom": "v",
    },
    // AdminToken *string — set for server moderator endpoints.
}
```

### `.Do` — the low-level call

```go
var (
    Query     = http.MethodGet    // "GET"
    Procedure = http.MethodPost   // "POST"
)

func (c *Client) Do(
    ctx context.Context,
    kind string,                  // xrpc.Query or xrpc.Procedure
    inpenc string,                // body content-type, e.g. "application/json"
    method string,                // the NSID
    params map[string]any,
    bodyobj any,                  // request body (procedures only)
    out any,                      // pointer to the output to unmarshal into
) error
```

Unusual argument order: `kind` before `method`. Easy to invert on first use. See `../shared/divergence-matrix.md §8`.

Example — a query by NSID:

```go
type Out struct {
    Uri string          `json:"uri"`
    Cid string          `json:"cid"`
    Value json.RawMessage `json:"value"`
}

var out Out
err := c.Do(ctx, xrpc.Query, "", "com.atproto.repo.getRecord",
    map[string]any{
        "repo": "did:plc:abc123",
        "collection": "app.bsky.feed.post",
        "rkey": "3jwdwj2ctlk26",
    },
    nil,
    &out,
)
```

## 2. Generated clients — `api/atproto`

Prefer the generated wrappers for `com.atproto.*` methods:

```go
import "github.com/bluesky-social/indigo/api/atproto"

out, err := atproto.RepoGetRecord(ctx, c,
    "",                          // optional cid pin
    "app.bsky.feed.post",        // collection
    "did:plc:abc123",            // repo
    "3jwdwj2ctlk26",             // rkey
)
// out.Uri, out.Cid, out.Value (*lexutil.LexiconTypeDecoder — see records.md §typed-dispatch)
```

Other common calls: `RepoCreateRecord`, `RepoPutRecord`, `RepoDeleteRecord`, `RepoListRecords`, `RepoUploadBlob`, `IdentityResolveHandle`, `ServerCreateSession`.

## 3. Schema-agnostic — `api/agnostic`

When the record body is a lexicon you haven't generated for:

```go
import "github.com/bluesky-social/indigo/api/agnostic"

out, err := agnostic.RepoGetRecord(ctx, c, "", "com.example.note",
    "did:plc:abc123", "3jwdwj2ctlk26")
// out.Value is *json.RawMessage
```

Feed `*out.Value` into `data.UnmarshalJSON` → `lexicon.ValidateRecord`. Go does this a lot — the agnostic wrappers are the idiomatic way to consume third-party lexicons over XRPC.

## 4. Error handling

`*xrpc.Error` carries structured fields:

```go
import (
    "errors"
    "github.com/bluesky-social/indigo/xrpc"
)

_, err := atproto.RepoGetRecord(ctx, c, "", "app.bsky.feed.post", did, rkey)
if err != nil {
    var xe *xrpc.Error
    if errors.As(err, &xe) {
        if xe.Error == "RecordNotFound" {
            return nil
        }
        if xe.IsThrottled() {
            // xe.Ratelimit has RemainingCalls, Reset, etc.
        }
    }
    return err
}
```

Clients **must** tolerate unknown `xe.Error` values (`../shared/xrpc-wire.md §5`).

## 5. Server — rolling your own

`indigo` does not ship a full XRPC server framework; handlers are typically hand-rolled on top of `net/http` or a router (`chi`, `gin`). The canonical reference implementation is the PDS binary in `indigo/cmd/gosky` and related services.

Skeleton:

```go
http.HandleFunc("/xrpc/com.example.note.get", func(w http.ResponseWriter, r *http.Request) {
    // 1. Validate params against schema.
    // 2. Perform the work.
    // 3. Marshal the output.
    // 4. Validate output against schema (paranoid mode).
    // 5. w.Header().Set("Content-Type", "application/json"); json.NewEncoder(w).Encode(out)
})
```

For errors: status 400+, body `{"error":"<Name>","message":"..."}`. Match the shape in `../shared/xrpc-wire.md §5`.

## 6. Subscriptions — `indigo/events`

`HandleRepoStream` hides DAG-CBOR frame decoding:

```go
import (
    "context"
    "log/slog"
    "net/http"

    "github.com/gorilla/websocket"
    comatproto "github.com/bluesky-social/indigo/api/atproto"
    "github.com/bluesky-social/indigo/events"
    "github.com/bluesky-social/indigo/events/schedulers/parallel"
)

func runFirehose(ctx context.Context, log *slog.Logger) error {
    url := "wss://bsky.network/xrpc/com.atproto.sync.subscribeRepos"
    d := websocket.Dialer{HandshakeTimeout: 10 * time.Second}
    con, _, err := d.DialContext(ctx, url, http.Header{})
    if err != nil { return err }
    defer con.Close()

    cbs := &events.RepoStreamCallbacks{
        RepoCommit: func(evt *comatproto.SyncSubscribeRepos_Commit) error {
            // evt.Seq, evt.Repo, evt.Ops, evt.Blocks (CAR bytes)
            return nil
        },
        RepoIdentity: func(evt *comatproto.SyncSubscribeRepos_Identity) error { return nil },
        RepoAccount:  func(evt *comatproto.SyncSubscribeRepos_Account) error { return nil },
        Error:        func(evt *events.ErrorFrame) error { return nil },
    }

    sched := parallel.NewScheduler(8 /*workers*/, "firehose", cbs.EventHandler)
    defer sched.Shutdown()

    return events.HandleRepoStream(ctx, con, sched, log)
}
```

Schedulers:

- `sequential` — serial, simplest, respects ordering.
- `parallel` — fixed worker pool keyed by DID.
- `autoscaling` — grows and shrinks based on queue depth.

Don't do heavy work in the callback directly — the scheduler exists to keep the read loop non-blocking. See `../shared/divergence-matrix.md §7`.

## 7. Raw firehose frame decoding

If you need to decode `com.atproto.sync.subscribeRepos` frames by hand (unusual), remember: each WebSocket binary message is **two concatenated DAG-CBOR objects** (header `{op,t}` + body). See `../shared/xrpc-wire.md §6`.

## 8. Common pitfalls

- **`.Do` arg order.** `(ctx, kind, inpenc, method, params, body, out)` — `kind` before `method`. Very easy to invert.
- **Empty `inpenc` on queries.** Queries don't have a body; pass `""`. For procedures, pass `"application/json"` (or the declared encoding).
- **`Auth` nil for anonymous calls.** Valid — the client omits the `Authorization` header.
- **Scheduler not shutting down.** Always `defer sched.Shutdown()`; otherwise worker goroutines leak.
- **Generated `Value` vs. raw.** `api/atproto.*GetRecord`'s `Value` is `*lexutil.LexiconTypeDecoder` — not a plain `json.RawMessage`. Use `api/agnostic` when you want raw.

## 9. See also

- `authoring.md` — lexicon loading.
- `validation.md` — server-side payload validation.
- `records.md` — `Value` decoding, typed dispatch.
- `../shared/xrpc-wire.md` — normative HTTP and WebSocket rules.
- `../../atproto-oauth/go/` — populating `Auth` with OAuth tokens.
- `../../atproto-repository/go/` — consuming CAR blobs inside firehose commits.

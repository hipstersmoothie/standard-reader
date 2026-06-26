# XRPC wire format (Reference)

Source of truth: https://atproto.com/specs/xrpc and https://atproto.com/specs/event-stream

XRPC is AT Protocol's HTTP-and-WebSocket RPC layer. Every XRPC method is a lexicon def of type `query`, `procedure`, or `subscription`. This file defines the wire mapping — what bytes travel over the socket — independent of any particular lexicon.

## 1. HTTP / WebSocket mapping

| Def            | HTTP method           | Path              |
| -------------- | --------------------- | ----------------- |
| `query`        | `GET`                 | `/xrpc/<nsid>`    |
| `procedure`    | `POST`                | `/xrpc/<nsid>`    |
| `subscription` | WebSocket (GET upgrade) | `/xrpc/<nsid>`  |

The NSID is the path segment. No other path elements.

## 2. Parameter encoding

Parameters declared in `parameters` (a `params` def) travel in the **query string**. This applies to all three def types.

- Primitives: URL-encoded string values.
- Arrays: repeat the key (`?foo=a&foo=b`).
- Booleans: `true` / `false`.
- Integers: base-10 ASCII.
- No nested objects — `params` properties must be primitives or arrays of primitives.

For procedures, `parameters` still goes in the query string; the **request body** carries `input`.

## 3. Content types

### JSON body (default)

`application/json` — used for `input`/`output` whose `schema` is an `object`, `ref`, or `union`.

Record values in JSON use:

- `{"$link":"<cid>"}` for `cid-link`.
- `{"$bytes":"<base64-std>"}` for `bytes`.
- Plain strings for `cid` format, AT-URIs, DIDs, handles, datetimes.

### Arbitrary MIME

Declared on `input`/`output` with `encoding`. Used for blob uploads / downloads, e.g., `com.atproto.repo.uploadBlob` takes `image/*`. The body is opaque bytes.

### CAR

`application/vnd.ipld.car` — bulk repo sync (`com.atproto.sync.getRepo`, `getBlocks`, `getLatestCommit`). See `atproto-repository` §car.

### DAG-CBOR frames

Only used **inside subscription frames over WebSocket**. Not used for standard request/response.

## 4. Request/response body rules

| Lexicon declares                 | Body                                               |
| -------------------------------- | -------------------------------------------------- |
| `input` with `schema`            | JSON object validated against schema               |
| `input` with only `encoding`     | opaque bytes of the declared MIME                  |
| no `input`                       | no body                                            |
| `output` with `schema`           | JSON object validated against schema               |
| `output` with only `encoding`    | opaque bytes of the declared MIME                  |
| no `output`                      | empty 2xx                                          |

Same rules apply symmetrically — an endpoint can have both typed JSON `input` and binary `output`, etc.

## 5. Error response shape

- Status: non-2xx (typically 400 / 401 / 403 / 429 / 500).
- Content-Type: `application/json`.
- Body:

```json
{
  "error":   "InvalidRequest",
  "message": "human-readable description"
}
```

- `error` SHOULD be one of the names declared in the method's `errors` array.
- `message` is optional but standard.
- Clients **must tolerate** unknown `error` names — forward compatibility. Treat unknown as a generic error of that HTTP status category.
- HTTP status → error-name mapping is **not** formally defined. 400 is the usual lexicon-declared-error bucket; 401 implies auth; 403 implies permission; 429 implies rate limit; 500 implies server fault. Treat as rough categories.

## 6. Subscription frames

Subscriptions use WebSocket. Each WebSocket binary message is one frame. A frame is **two concatenated DAG-CBOR objects**:

```
frame = header + body
```

### Header

```cbor
{ "op": <int>, "t"?: "<type-name>" }
```

- `op`: `1` for a normal message, `-1` for an error frame.
- `t`: required on normal (`op=1`) frames. Names the message variant. Must match a ref in the subscription lexicon's `message.schema.refs`.

### Body

- Normal frame: payload fields per the message variant's schema.
- Error frame: `{ "error": "<ErrorName>", "message"?: "<free text>" }` — same shape as HTTP errors.

### Worked example (firehose)

Lexicon: `com.atproto.sync.subscribeRepos`, variant `#commit`.

```
WebSocket binary message:
  [DAG-CBOR] { "op": 1, "t": "#commit" }
  [DAG-CBOR] { "seq": 12345, "repo": "did:plc:abc", "commit": <cid-link>, "prev": null, ... }
```

Consumers decode two CBOR objects per message. The second object's schema is selected by `t`.

## 7. Authentication

Out of scope for this skill — see `atproto-oauth`. This skill assumes the transport is already authenticated. Common patterns:

- `Authorization: Bearer <jwt>` for app-password sessions and DPoP-wrapped OAuth access tokens.
- `DPoP: <proof-jwt>` sibling header for OAuth.
- Service auth JWTs for server-to-server.

## 8. See also

- `lexicon-spec.md` — `query`, `procedure`, `subscription`, `params`, `body` shapes.
- `record-model.md` — how records travel inside XRPC bodies.
- `../skills/atproto-oauth/` — authentication headers.
- `../skills/atproto-repository/shared/car-v1.md` — CAR body format for sync methods.

# claudeslop — a minimal AT Protocol labeler

`claudeslop` is a tiny, self-contained [AT Protocol](https://atproto.com) labeler that
flags prose a heuristic detector thinks reads like AI slop. It's a working labeler **and**
a reference you can copy: about 700 lines, no framework, no model, no database server.

It speaks the standard labeler API, so anything that understands AT Proto labels — Standard
Reader, Bluesky, an Ozone instance — can subscribe to it and verify its labels.

```
Jetstream ──▶ detector ──▶ sign ──▶ SQLite ──▶ queryLabels / subscribeLabels
 (firehose)   (heuristics)  (k256)   (the log)   (HTTP)        (WebSocket)
```

## How a labeler works (the whole thing)

1. **Identity.** A labeler is just a DID. claudeslop uses a `did:web`, so its DID document
   is a file this service serves at `/.well-known/did.json`. That document advertises two
   things: an `#atproto_labeler` service (where to reach it) and an `#atproto_label`
   verification method (the public half of its signing key).
2. **Input.** It subscribes to [Jetstream](https://github.com/bluesky-social/jetstream) — a
   JSON view of the firehose — filtered to `site.standard.document` records, so it sees every
   Standard Reader document as it's published. (`src/ingest.ts`)
3. **Detect.** Each document's text is scored by an explainable heuristic detector — sentence
   burstiness, cliché/hedging density, transition-word scaffolding, lexical uniformity. No
   model inference. (`src/detector.ts`)
4. **Sign.** Documents over the threshold get an `ai-writing` label, signed with the labeler's
   secp256k1 key over the dag-cbor encoding of the label. (`src/sign.ts`)
5. **Store.** Signed labels are appended to a SQLite log whose autoincrement `seq` is the
   cursor that `subscribeLabels` streams against. (`src/db.ts`)
6. **Serve.** A tiny HTTP/WS server exposes the standard endpoints. (`src/server.ts`)

## Endpoints

| Endpoint | What it does |
| --- | --- |
| `GET /.well-known/did.json` | The did:web document (labeler service + signing key). |
| `GET /xrpc/com.atproto.label.queryLabels` | Point-in-time label lookup (`uriPatterns`, `sources`, `cursor`, `limit`). |
| `GET /xrpc/com.atproto.label.subscribeLabels` | WebSocket firehose of labels (replays from `?cursor=`, then streams live). |
| `GET /xrpc/app.standard-reader.labeler.getServices` | The labeler descriptor + label-value definitions (a did:web has no repo to hold a service record, so it's served here). |
| `GET /health` | Liveness + current label count. |

`subscribeLabels` frames are the standard two-block dag-cbor format: a header
`{ op: 1, t: "#labels" }` followed by a body `{ seq, labels: [label] }`, where each `label`
matches `com.atproto.label.defs#label` (signature included as raw bytes).

## Running it

```bash
pnpm install
pnpm gen-key                 # prints LABELER_SIGNING_KEY=…  (save it)
cp .env.example .env         # fill in LABELER_SIGNING_KEY (+ DID/URL for prod)
pnpm dev                     # detector + server, http://localhost:4100
pnpm test                    # detector + signing unit tests
```

Config lives in `.env` (see `.env.example`): `LABELER_DID`, `LABELER_SIGNING_KEY`,
`PUBLIC_URL`, `JETSTREAM_URL`, `SQLITE_PATH`, `PORT`, plus `AI_THRESHOLD` / `DETECTOR_VERSION`
for tuning. Bump `DETECTOR_VERSION` to force a re-scan of everything seen so far.

### Local development against Standard Reader

The app discovers labelers by resolving their DID. For a labeler running on your machine, use
a loopback `did:web` so resolution points back at localhost:

```bash
LABELER_DID=did:web:localhost%3A4100
PUBLIC_URL=http://localhost:4100
```

Then, in the app, set `CLAUDESLOP_LABELER_DID` is **not** needed — just add
`did:web:localhost%3A4100` on the Settings → Labelers page. (Standard Reader resolves loopback
`did:web` hosts over http.)

## Deploying

It's one always-on process. The included `railway.json` runs `pnpm start`. Two things matter
in production:

- **Persist the SQLite file** — mount a volume at `SQLITE_PATH` so the label log and cursor
  survive restarts.
- **DID must resolve to the public host** — `LABELER_DID=did:web:<host>` and `PUBLIC_URL=https://<host>`,
  with `/.well-known/did.json` reachable at that host (this service serves it).

## Copying this as a starting point

Swap `src/detector.ts` for whatever you want to label on, change `config.documentCollection`
(and the Jetstream filter) to the collection you care about, and adjust the label values in
`src/descriptor.ts`. Everything else — signing, the SQLite log, the two endpoints, DID-doc
serving — is generic labeler plumbing you can keep as-is.

---
name: atproto-repository
description: This skill should be used when the user is constructing, parsing, exporting, importing, or signature-validating an AT Protocol user repository in Rust, TypeScript, or Go — the durable per-account record store represented as a Merkle Search Tree inside a signed commit, serialized on the wire as a CAR v1 file. Triggers on phrases like "CAR file", "CAR v1", "car export", "com.atproto.sync.getRepo", "com.atproto.sync.getBlocks", "listMissingBlocks", "subscribeRepos", "repo export", "MST", "Merkle Search Tree", "MST node", "tree entry", "left subtree", "fanout", "prefix compression", "key height", "repo commit", "commit signature", "sig field", "signing bytes", "UnsignedCommit", "commit version 3", "rev TID", "prev commit", "DAG-CBOR", "DRISL", "canonical CBOR", "map key ordering", "tag 42", "block store", "block CID mismatch", "verify repo", "inductive verification", "prevData", "record CID in MST", "at://<did>/<collection>/<rkey>". Also triggers on dependency/import names like `atproto-repo`, `atproto-dasl`, `atproto-record`, `@atproto/repo`, `@atproto/lex-cbor`, `@atproto/lex-data`, `@atproto/crypto`, `indigo/atproto/repo`, `indigo/atproto/repo/mst`, `indigo/atproto/atdata`, `github.com/ipld/go-car`, `go-block-format`, `cbor-gen`, or API names like `LoadRepoFromCAR`, `VerifyCommitSignatureFromCar`, `VerifyCommitMessage`, `readCar`, `readCarWithRoot`, `verifyRepoCar`, `verifyDiffCar`, `signCommit`, `verifyCommitSig`, `Mst::insert_recursive`, `Tree.RootCID`, `MST.create`, `MST.load`, `DataDiff.of`. Use this skill to implement a repo reader, a repo writer, a commit signer/verifier, an MST diff tool, a CAR streaming parser, a firehose consumer, or to debug failures like "CID mismatch", "unknown codec in CAR", "MST node not found", "prefix_len exceeds previous key", "signature invalid", "prev null vs absent", "partial tree", "missing block", or "inverted tree root didn't match prevData". Covers DRISL (canonical DAG-CBOR) encoding rules, CAR v1 byte framing, MST structure (SHA-256 fanout 4, sorted entries, prefix compression, left subtree pointer), commit record fields and signing bytes, signature verification (including the `prev: null` vs omitted cross-implementation divergence), record placement (NSID + rkey), and cross-language interop. Does NOT cover CID parsing/construction (see `atproto-cid`), DID resolution / locating the signing key (see `atproto-identity-resolution`), lexicon-level record validation or XRPC method invocation or typed `$type` record dispatch (see `atproto-lexicon`), or OAuth (see `atproto-oauth`). Bluesky-domain record idioms (richtext facets, embeds) are out of scope for this plugin entirely.
version: 0.2.0
---

# AT Protocol Repository

An AT Protocol **repository** is a single account's entire record store, addressed by its DID. Every record lives at a key in a Merkle Search Tree; the tree's root CID is sealed by a signed commit; the commit plus every block it transitively references are the repository. On the wire, it travels as a **CAR v1** file.

This skill routes to per-language guides for Rust, TypeScript, and Go, sitting on top of a language-neutral spec in `shared/`.

## Defaults

- **DRISL** — canonical DAG-CBOR: bytewise map keys, shortest-form integers, no indefinite-length framing, CIDs as tag 42 + identity multibase.
- **CAR v1** — `varint ‖ header-cbor ‖ (varint ‖ 36-byte-CID ‖ bytes)*`. Roots list declares the commit CID.
- **MST** — SHA-256 key height with fanout 4 (count pairs of leading zero bits). Node shape `{l?, e:[{p,k,v,t?}]}`. Keys are `<collection>/<rkey>`, max 1024 bytes.
- **Commit** — `{did, version:3, data, rev, prev, sig}`. `prev` is `null` for genesis (though see §divergence). Signing bytes = DAG-CBOR of the commit minus `sig`.
- **Signature** — raw `r ‖ s` ECDSA (k-256 or p-256), low-S normalized. Verified against the `#atproto` Multikey in the signer's DID document.

Full normative rules: `shared/drisl.md`, `shared/car-v1.md`, `shared/mst.md`, `shared/commit-and-signing.md`, `shared/data-model.md`. Fixtures: `shared/test-vectors.md`. Cross-language differences: `shared/divergence-matrix.md`.

## Language detection

Before generating or reviewing any repo code, determine the target language from project files or the file being edited:

- `Cargo.toml`, `*.rs`, any mention of `atproto-repo` / `atproto-dasl` / `atproto-record` → **Rust** — read from `rust/`.
- `package.json`, `tsconfig.json`, `*.ts`, `*.tsx`, imports of `@atproto/repo` / `@atproto/lex-cbor` / `@atproto/crypto` → **TypeScript** — read from `typescript/`. Also `*.js`/`*.jsx` when there is no `.ts` present.
- `go.mod`, `*.go`, imports of `github.com/bluesky-social/indigo/atproto/repo` → **Go** — read from `go/`.

Prefer the *file being edited* over the *repo root* when they disagree: a `.go` consumer inside a TypeScript-workspace monorepo still means Go for that task.

If multiple languages are present and the task does not point at one unambiguously, **ask which one applies**. Never mix repo libraries across languages in generated code.

If an unsupported language is detected (Python, Java, Swift, …), point the user at `shared/drisl.md`, `shared/car-v1.md`, `shared/mst.md`, and `shared/commit-and-signing.md` for the wire format, and offer the Go `indigo/atproto/repo` source as the most complete reference implementation to transliterate from.

## Reading guide

For every repo task:

1. Read the relevant `shared/*.md` first. They are short and define the rules your code must enforce.
2. Read the relevant task file in the detected language directory:
   - DRISL / canonical DAG-CBOR encoding of any block → `{lang}/drisl.md`
   - CAR v1 reading and writing → `{lang}/car.md`
   - MST construction, traversal, diff → `{lang}/mst.md`
   - Commit record shape, signing, verification → `{lang}/commit.md`
   - Library setup, public API at a glance, idioms → `{lang}/README.md`
3. Consult `shared/divergence-matrix.md` whenever porting between languages or reviewing cross-stack interop. The `prev: null` vs omitted divergence alone has caused many hours of "why does my signature not verify" debugging.

Always prefer the official library over hand-rolling: `atproto-repo` crate in Rust, `@atproto/repo` in TypeScript, `github.com/bluesky-social/indigo/atproto/repo` in Go.

## The conceptual stack

```
                       ┌──────────────────────────────┐
  CAR v1 file  ──────▶ │ header: { version:1, roots }  │
  (on the wire)        │ block: [cid, data] …          │
                       │ block: [cid, data] …          │
                       └──────────────────────────────┘
                                   │
                                   ▼
                       ┌──────────────────────────────┐
  Signed commit ─────▶ │ { did, version:3, data, rev, │
  (root block)         │   prev, sig }                │
                       └──────────────────────────────┘
                                   │ data: CID
                                   ▼
                       ┌──────────────────────────────┐
  MST node ──────────▶ │ { l?, e:[entry,entry,…] }    │
  (many blocks)        │ entry = { p, k, v, t? }      │
                       └──────────────────────────────┘
                                   │ v: CID (leaf = record block)
                                   ▼
                       ┌──────────────────────────────┐
  Record block ──────▶ │ DAG-CBOR encoding of record  │
  (many blocks)        │ { $type: "<nsid>", … }       │
                       └──────────────────────────────┘
```

CAR just frames a sequence of `(CID, bytes)` blocks. The same block bytes travel over `getRecord`, the firehose, and any cache.

## Cross-language hazards to flag up front

High-frequency failure modes; full detail in `shared/divergence-matrix.md`:

- **`prev: null` vs omitted** — When signatures fail on genesis commits only, suspect cross-encoder `prev` drift. Rust reference impl omits `prev` for genesis (4-entry map); Go and TS always serialize `prev: null` (5-entry map). Strip the signature from raw bytes rather than re-encoding before verifying.
- **TS MST is immutable** — When an add/update/delete appears to have no effect, reassign to the return value. `add`/`update`/`delete` return a new `MST`; the original is unchanged. Rust and Go mutate in place.
- **TS CAR reader verifies CIDs on ingest** — When a CAR that Go or Rust accepts fails TS intake, suspect block corruption. `verifyIncomingCarBlocks` defaults on in TS; Go and Rust do not verify.
- **Go cbor-gen sorts by struct declaration order, not bytewise** — When adding a new cbor-gen struct, audit field order against bytewise canonical order. The `Commit` struct happens to be canonical, but anything you add must be checked.
- **Partial trees are normal in Go/Rust, exceptional in TS** — When a firehose event traversal throws `MissingBlockError` in TS, treat the partial tree as expected and fall back to a partial walker. Go/Rust return a partial-tree sentinel instead.
- **Only Go has end-to-end wired verification** — When verifying in TS or Rust, resolve the signing DID key separately first. `VerifyCommitSignatureFromCar` is Go-only; TS needs a pre-resolved didKey and Rust needs the caller to do everything.
- **Rust `Mst::insert_recursive` can't cross heights** — When building an MST from scratch in Rust, build bottom-up from sorted `(key, cid)` pairs, not top-down.

## Tools you can call

Prefer these MCP tools when the goal is to *compute* or *validate* rather than teach an implementation how:

- **`lexicon-garden`** → `create_record_cid(record)`, `transmogrify_record`, `invoke_xrpc` (e.g. `com.atproto.sync.getRepo`, `getBlocks`).
- **`atpmcp`** → `create_record_cid`, `get_record`, `transmogrify_record`, `generate_tid` against a local PDS.

Concrete example — computing a spec-conformant record CID against an in-memory record before writing a test vector:

```
create_record_cid({
  "$type": "app.bsky.feed.post",
  "text":  "hello",
  "createdAt": "2024-01-01T00:00:00.000Z"
})
→ "bafyreihsh..."
```

Use this to verify your own encoder output matches the canonical CID without having to boot a PDS. `transmogrify_record` is the round-trip companion — feed it a record, get back the DAG-CBOR bytes and the CID together.

For record-side helpers (TID generation, AT-URI parsing), the `atproto-record` Rust crate ships the cleanest reference; the TS equivalent is `@atproto/syntax`, and Go uses `atproto/syntax` in indigo.

## Cross-skill plumbing: DID resolution for verification

`VerifyCommitSignatureFromCar` (Go) does identity lookup and signature check in one call. TypeScript and Rust need the signing key resolved separately before verification:

- **Rust** — resolve with `atproto-identity` first, extract the `#atproto` verification method, then pass the Multikey into `atproto-repo`'s verify loop. See `../atproto-identity-resolution/rust/resolution.md` for the resolver and `rust/commit.md` for the verify surface.
- **TypeScript** — resolve via `@atproto/identity` → `IdResolver.did.resolveAtprotoData(did)` → yields `{ signingKey }` as a `didKey`, then pass into `verifyCommitSig`. See `../atproto-identity-resolution/typescript/resolution.md` and `typescript/commit.md`.
- **Go** — `VerifyCommitSignatureFromCar` wraps both; no manual plumbing required.

## Directory layout

```
atproto-repository/
├── SKILL.md                          # this file — router
├── shared/
│   ├── drisl.md                      # canonical DAG-CBOR rules
│   ├── car-v1.md                     # CAR v1 byte layout
│   ├── mst.md                        # MST algorithm + invariants
│   ├── commit-and-signing.md         # commit shape, signing bytes, verification
│   ├── data-model.md                 # records, NSIDs, TIDs, AT-URIs
│   ├── test-vectors.md               # fixtures
│   └── divergence-matrix.md          # cross-language differences
├── rust/
│   ├── README.md                     # atproto-repo / atproto-dasl / atproto-record setup
│   ├── drisl.md                      # atproto-dasl encoding
│   ├── car.md                        # CarReader / CarWriter
│   ├── mst.md                        # Mst<S>, insert_recursive, diff_entries
│   └── commit.md                     # Commit / UnsignedCommit / signing loop
├── typescript/
│   ├── README.md                     # @atproto/repo setup
│   ├── drisl.md                      # @atproto/lex-cbor
│   ├── car.md                        # readCar / writeCarStream / verifyIncomingCarBlocks
│   ├── mst.md                        # immutable MST class
│   └── commit.md                     # signCommit / verifyCommitSig / verifyRepo
└── go/
    ├── README.md                     # indigo/atproto/repo setup
    ├── drisl.md                      # cbor-gen + atdata
    ├── car.md                        # LoadRepoFromCAR / go-car
    ├── mst.md                        # Tree / Node / partial-tree semantics
    └── commit.md                     # Commit / Sign / VerifyCommitSignatureFromCar
```

## References

All reachable from the tree above. Listed here for quick grep:

- `shared/drisl.md`, `shared/car-v1.md`, `shared/mst.md`, `shared/commit-and-signing.md`, `shared/data-model.md`, `shared/test-vectors.md`, `shared/divergence-matrix.md`
- `rust/README.md`, `rust/drisl.md`, `rust/car.md`, `rust/mst.md`, `rust/commit.md`
- `typescript/README.md`, `typescript/drisl.md`, `typescript/car.md`, `typescript/mst.md`, `typescript/commit.md`
- `go/README.md`, `go/drisl.md`, `go/car.md`, `go/mst.md`, `go/commit.md`

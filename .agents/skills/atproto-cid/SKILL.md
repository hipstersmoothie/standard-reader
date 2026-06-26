---
name: atproto-cid
description: This skill should be used when the user is working with AT Protocol or DASL CIDs (Content Identifiers) in Rust, TypeScript, or Go — parsing, constructing, validating, verifying, or debugging them. Triggers on phrases like "parse a CID", "compute a CID for this record", "verify a blob CID", "why is this CID invalid", "CID mismatch", "tag 42 in DAG-CBOR", "identity multibase prefix", "the $link format", "base32lower", "digest length error", "what does the b prefix mean", "CIDv1 vs CIDv0", "bafyrei / bafkrei prefix", "dag-cbor codec", "multihash", "BLAKE3 CID", "BDASL". Also triggers on dependency/import names like `atproto-dasl`, `cid`, `multihash-codetable`, `libipld`, `multiformats`, `@ipld/dag-cbor`, `CID.parse`, `CID.create`, `github.com/ipfs/go-cid`, `go-multihash`, or lockfile names `Cargo.toml`, `package.json`, `pnpm-lock.yaml`, `go.mod`, `go.sum`. Covers the strict DASL CID profile (CIDv1 only, codec raw 0x55 or dag-cbor 0x71, hash SHA-256 0x12, 32-byte digest, base32lower string form with 'b' prefix, 36-byte binary form), the BDASL extension permitting BLAKE3 (0x1e) for large-file content, the DAG-CBOR wire form (CBOR tag 42 plus identity multibase 0x00 prefix), and the AT Protocol JSON `{"$link": "..."}` form. Use this skill to implement CID support in SDKs, clients, servers, firehose consumers, repo tooling, or diagnostic scripts in any of the three supported languages; for an unsupported language point at `shared/spec.md` and a reference implementation. Does NOT cover general IPFS / multiformats CID questions (DASL is a strict subset — reject anything outside the allowed constants); for MST tree traversal, CAR inspection, or DAG-CBOR canonicalization beyond the CID tag see `atproto-repository`.
version: 0.2.0
---

# AT Protocol / DASL CIDs

Content Identifiers (CIDs) are the content-addressed hashes that bind every record, blob, and commit in AT Protocol to its exact bytes. This skill routes to per-language guides for Rust, TypeScript, and Go, sitting on top of a single language-neutral spec in `shared/`.

## Defaults

A DASL CID is always a **CIDv1** with codec `raw` (`0x55`) or `dag-cbor` (`0x71`), hash SHA-256 (`0x12`), 32-byte digest, base32lower string form with a leading `b`, 36-byte binary form. The BDASL extension permits BLAKE3 (`0x1e`) for large-file blobs. Anything outside that set is rejected — DASL is a strict subset of multiformats CIDs, not an alias.

Full normative rules: `shared/spec.md`. Byte-level diagrams: `shared/binary-layout.md`. Fixtures: `shared/test-vectors.md`. Cross-language differences: `shared/divergence-matrix.md`.

## Language detection

Before generating or reviewing any CID code, determine the target language from project files or the file being edited:

- `Cargo.toml`, `*.rs`, `rust-toolchain.toml`, any mention of `atproto-dasl` / `cid` / `libipld` → **Rust** — read from `rust/`.
- `package.json`, `tsconfig.json`, `*.ts`, `*.tsx`, imports of `multiformats` / `@ipld/dag-cbor` → **TypeScript** — read from `typescript/`. Also `*.js`/`*.jsx` when there is no `.ts` present in the repo.
- `go.mod`, `*.go`, imports of `github.com/ipfs/go-cid` → **Go** — read from `go/`.

Prefer the *file being edited* over the *repo root* when they disagree: a `.ts` client inside a Rust-workspace monorepo still means TypeScript for that task.

If multiple languages are present and the task does not point at one unambiguously, **ask which one applies**. Never mix CID libraries across languages in generated code.

If an unsupported language is detected (Python, Java, Elixir, Swift, …), point the user at `shared/spec.md` for the binary format and offer Rust as a reference implementation to transliterate from. Name this out explicitly — it converts a dead end into a partial success.

## Reading guide

For every CID task:

1. Read `shared/spec.md` first. It is short and defines the rules your code must enforce.
2. Read the relevant task file in the detected language directory:
   - Parsing a CID (string or bytes) → `{lang}/parsing.md`
   - Constructing a CID from content or from `(codec, digest)` → `{lang}/construction.md`
   - Choosing or handling codecs / hash codes → `{lang}/codecs.md`
   - Dependency setup, library choice, idioms → `{lang}/README.md`
3. Consult `shared/divergence-matrix.md` when porting between languages or reviewing cross-stack interop.

Always prefer the official library (`atproto-dasl` in Rust, `multiformats` in TypeScript, `go-cid` in Go) over hand-rolling. Never guess function names — read the relevant `{lang}/*.md` file, and if a detail is missing, fetch the live docs (docs.rs, npm, pkg.go.dev) rather than inventing.

## Architecture (shared concepts)

### String form

```
b<base32lower(36_byte_cid)>
```

Leading `b` signals multibase base32lower (RFC 4648, lowercase, no padding). The encoded 36-byte CID comes out to 58 characters, for a total string length of 59. The first seven string characters are fully determined by the CID header, which gives you a fast sniff test:

| Header bytes          | Codec meaning                      | String prefix |
| --------------------- | ---------------------------------- | ------------- |
| `01 71 12 20 …`       | dag-cbor + SHA-256                 | `bafyrei…`    |
| `01 55 12 20 …`       | raw + SHA-256                      | `bafkrei…`    |
| `01 71 1e 20 …`       | dag-cbor + BLAKE3 (BDASL only)     | see `shared/binary-layout.md` |
| `01 55 1e 20 …`       | raw + BLAKE3 (BDASL only)          | see `shared/binary-layout.md` |

In practice: `bafyrei…` means record/MST node; `bafkrei…` means blob. Anything else is not a DASL SHA-256 CID.

### Binary form

36 bytes flat: `version(1) || codec(1) || hash_code(1) || digest_length(1) || digest(32)`. No tag, no length prefix. This is what goes into CAR block frames and what you hash-compare.

### DAG-CBOR wire form

Inside DAG-CBOR, a CID is emitted as CBOR **tag 42** wrapping a byte string whose first byte is the identity multibase prefix (`0x00`) followed by the 36 binary CID bytes — **37 bytes total** inside the byte string. Encoders in all three languages do this automatically; hand-rolling it is a footgun.

### JSON `$link` form

In AT Protocol JSON (lexicon records, XRPC responses), CIDs appear as:

```json
{"$link": "bafyreihunttf7a3uvtzrgbnyu2rzv24w4zx7xjwqgk4x5w7n5yvq7u7aua"}
```

A bare string in a CID-typed field is invalid — reject records that inline it.

### Validation vs verification

- **Validation**: parse succeeded into the DASL subset. Version is 1, codec ∈ {0x55, 0x71}, hash code ∈ {0x12, 0x1e-if-BDASL}, digest length 32.
- **Verification**: re-hash the content, rebuild the CID, compare byte-for-byte. This is always a separate step; no library does it for you.

Keep these two concepts separate in your code — conflating them is the most common bug in a new CID implementation.

## Common pitfalls

Draw from `shared/spec.md` §7 (validation order — each step is the rejection condition for the byte it inspects), `shared/binary-layout.md`, and `shared/divergence-matrix.md`. The high-impact ones:

- **Missing `0x00` identity multibase prefix** inside DAG-CBOR tag-42 wrapping — produces a CID that other implementations silently reject.
- **CIDv0 `Qm…`** accepted by permissive libraries (TypeScript and Go in particular). Always re-validate against the DASL subset after parsing.
- **Confusing dag-pb (`0x70`) with dag-cbor (`0x71`)** — one codec byte apart. dag-pb is IPFS-only and is not a DASL codec.
- **Base58btc (`z…`) or base64 (`m…`) prefixes** — valid multibase CIDs but not DASL. Reject.
- **JS-specific: async hashing propagates through your call chain.** You cannot collapse `await sha256.digest(bytes)` into a sync helper. Every caller that wants to build a CID from bytes becomes async. See `typescript/construction.md`.
- **Codec constants are shipped only in Go.** Rust and TypeScript require importing or hand-rolling. See `shared/divergence-matrix.md` §codec-constants.
- **TypeScript uses `cid.bytes` (property), not `cid.toBytes()`.** Rust and Go use methods. Port-and-paste hazard.
- **JSON form is `{"$link": "..."}`, not a bare string.** The DASL spec itself does not define a JSON encoding; this is an AT Protocol convention.
- **Unpadded base32 decode.** Many stdlib base32 decoders default to padded RFC 4648; multibase base32lower is unpadded. Configure the decoder, or the parse rejects valid DASL strings.

## Decision rules

- **DASL vs BDASL?** DASL (SHA-256) everywhere in the AT Protocol repo graph — records, commits, MST nodes, most blobs. Use BDASL (BLAKE3) only when the surrounding platform explicitly opts in for large-file content.
- **`raw` vs `dag-cbor`?** `dag-cbor` for structured records (the vast majority). `raw` for opaque binary blobs referenced from records.
- **Accept a CIDv0?** No. Reject with a clear error — there is no lossy upgrade.
- **Store string form or binary form?** Binary in DAG-CBOR and CAR; string in JSON and logs. Convert at boundaries.
- **Compare two CIDs for equality?** Compare the 36-byte binary forms. String forms can (in theory) drift in case or padding even when conformant; binary is authoritative.

## Tools you can call

Prefer these MCP tools to writing new code when the goal is to *compute* or *validate* a CID rather than teach an implementation how:

- **`lexicon-garden`** → `create_record_cid(record_json)`, `transmogrify_record`, `invoke_xrpc` (for `com.atproto.sync.getBlob` and friends).
- **`atpmcp`** → `create_record_cid`, `get_record`, `transmogrify_record` against a local PDS.

These are authoritative within the AT Protocol ecosystem. Use them to generate expected values for cross-language test vectors.

For a lightweight local sanity check against the DASL subset (no deps, no network, no hashing), run:

```
python3 scripts/validate_cid.py <cid-string> [--bdasl]
```

Exit 0 = valid DASL string, 1 = rejected with reason on stdout, 2 = usage error. Useful for quick CI checks or piping many candidate CIDs through `xargs`. Does not verify content — it only parses the 4-byte header and digest length against the allowed constants.

## Directory layout

```
atproto-cid/
├── SKILL.md                          # this file — router
├── shared/
│   ├── spec.md                       # normative DASL rules
│   ├── binary-layout.md              # byte-level diagrams
│   ├── test-vectors.md               # fixtures
│   └── divergence-matrix.md          # cross-language differences
├── rust/
│   ├── README.md                     # crate setup, idioms
│   ├── parsing.md                    # Cid / DaslCid parse paths
│   ├── construction.md               # compute_cid, new_v1 paths
│   └── codecs.md                     # codec constants, BLAKE3
├── typescript/
│   ├── README.md                     # multiformats + @ipld/dag-cbor setup
│   ├── parsing.md                    # CID.parse / decode + DASL gate
│   ├── construction.md               # async sha256 + CID.createV1
│   └── codecs.md                     # per-codec packages
├── go/
│   ├── README.md                     # go-cid + go-multihash setup
│   ├── parsing.md                    # cid.Decode / Cast + DASL gate
│   ├── construction.md               # Prefix.Sum / NewCidV1
│   └── codecs.md                     # shipped constants (cid.DagCBOR, cid.Raw)
└── scripts/
    └── validate_cid.py               # stdlib-only DASL subset check
```

## References

Everything below is reachable from the directory tree above. Listed here for quick grep:

- `shared/spec.md`
- `shared/binary-layout.md`
- `shared/test-vectors.md`
- `shared/divergence-matrix.md`
- `rust/README.md`, `rust/parsing.md`, `rust/construction.md`, `rust/codecs.md`
- `typescript/README.md`, `typescript/parsing.md`, `typescript/construction.md`, `typescript/codecs.md`
- `go/README.md`, `go/parsing.md`, `go/construction.md`, `go/codecs.md`

# Cross-Language Divergence Matrix (DASL CID)

This file is language-neutral. It captures the real behavioural differences between the Rust, TypeScript, and Go CID ecosystems that any skill user porting code or operating cross-stack needs to know about.

Every per-language file (`rust/*.md`, `typescript/*.md`, `go/*.md`) links back here instead of restating the matrix.

## Library choice

| Ecosystem | Base library | DAG-CBOR | Hashing | DASL-strict wrapper |
| --- | --- | --- | --- | --- |
| Rust | [`cid`](https://docs.rs/cid) 0.11 + [`multihash-codetable`](https://docs.rs/multihash-codetable) | [`atproto-dasl`](https://docs.rs/atproto-dasl) (DRISL-strict) or [`serde_ipld_dagcbor`](https://docs.rs/serde_ipld_dagcbor) | `sha2` crate (`Sha256::digest`) | [`atproto-dasl::DaslCid`](https://docs.rs/atproto-dasl) — rejects non-DASL at construction |
| TypeScript | [`multiformats`](https://www.npmjs.com/package/multiformats) 13 | [`@ipld/dag-cbor`](https://www.npmjs.com/package/@ipld/dag-cbor) | `multiformats/hashes/sha2` (SubtleCrypto-backed) | None shipped — DASL validation is caller-owned |
| Go | [`github.com/ipfs/go-cid`](https://pkg.go.dev/github.com/ipfs/go-cid) + [`github.com/multiformats/go-multihash`](https://pkg.go.dev/github.com/multiformats/go-multihash) | [`github.com/ipld/go-ipld-prime/codec/dagcbor`](https://pkg.go.dev/github.com/ipld/go-ipld-prime/codec/dagcbor) | `crypto/sha256` or via `go-multihash` | None shipped — DASL validation is caller-owned |

Only Rust has a shipped DASL-strict wrapper. In TypeScript and Go, the libraries are permissive — they will happily parse a CIDv0 `Qm…` or a `dag-pb` (0x70) CID without complaining. **DASL validation is always the caller's job in TypeScript and Go.** See each language's `parsing.md` for the gate code.

## Operation-level divergence

| Operation | Rust | TypeScript | Go |
| --- | --- | --- | --- |
| Parse string | `Cid::try_from(s)` / `atproto_dasl::DaslCid::from_str(s)` | `CID.parse(str)` (base32lower default; explicit base decoder needed for others) | `cid.Decode(str)` |
| Parse 36 bytes | `Cid::try_from(&[u8])` / `DaslCid::try_from(&[u8])` | `CID.decode(bytes)` (strict) or `CID.decodeFirst(bytes)` (returns remainder) | `cid.Cast(bytes)` |
| Streaming read | `atproto_dasl::cid::read_cid(reader)` | `CID.decodeFirst(bytes)` (sync, works on any `Uint8Array`) | `cid.CidFromReader(reader)` |
| Construct from (codec, digest) | `Cid::new_v1(codec_u64, mh)` | `CID.createV1(code, multihashDigest)` | `cid.NewCidV1(codec, mhBytes)` |
| Construct from content | `atproto_dasl::compute_cid(bytes)` (dag-cbor default) or manual via `Sha256::digest` + `Cid::new_v1` | `const digest = await sha256.digest(bytes); CID.createV1(codec, digest)` | `p := cid.Prefix{Version:1, Codec:cid.DagCBOR, MhType:multihash.SHA2_256, MhLength:32}; p.Sum(bytes)` |
| Hash call | `Sha256::digest(bytes)` — **sync** | `await sha256.digest(bytes)` — **async** (SubtleCrypto) | `multihash.Sum(bytes, multihash.SHA2_256, 32)` — **sync** |
| Codec constants | Re-exported: `atproto_dasl::DAG_CBOR_CODEC = 0x71`; bare `cid` crate has no enum (use `u64` constants) | Import from per-codec: `import * as dagCbor from '@ipld/dag-cbor'` → `dagCbor.code`; `import * as raw from 'multiformats/codecs/raw'` → `raw.code` | **Shipped**: `cid.DagCBOR`, `cid.Raw`, `cid.DagPB`, etc. — free off the `cid` package |
| Byte output (36 bytes) | `cid.to_bytes() -> Vec<u8>` (method) | `cid.bytes` (**property**, `Uint8Array`) | `c.Bytes() []byte` (method) |
| String output | `cid.to_string()` (Display impl → base32lower for v1) | `cid.toString()` (base32lower for v1) | `c.String()` |
| DAG-CBOR encode a CID | Automatic via `atproto_dasl::to_vec(value)` — serde emits tag 42 + `0x00` identity multibase prefix | Automatic via `dagCbor.encode(value)` — emits tag 42 + `0x00` | Automatic via `go-ipld-prime/codec/dagcbor` — emits tag 42 + `0x00` |
| JSON `$link` form | `atproto_dasl::Cid` round-trips `{"$link": "…"}` via serde | Hand-roll: `{ $link: cid.toString() }`, or use [`@ipld/dag-json`](https://www.npmjs.com/package/@ipld/dag-json) | Hand-roll: `map[string]string{"$link": c.String()}`, or use `go-ipld-prime/codec/dagjson` |
| Errors | Typed enum: `cid::Error`, `atproto_dasl::DaslCidError` with variants per failure class | Plain `Error` (sometimes `TypeError`) — inspect `.message` strings | Sentinel values: `cid.ErrCidTooShort`, `cid.ErrInvalidCid`, `cid.ErrVarintBuffSmall`, `multihash.ErrUnknownCode`, etc. |
| BLAKE3 (BDASL) support | `multihash-codetable` with the `blake3` feature; `atproto-dasl` recognizes `0x1e` | No first-party; use `@noble/hashes/blake3` or a third-party multihash adapter | `multihash.Register(multihash.BLAKE3, …)` is available; codec constant is `multihash.BLAKE3 = 0x1e` |

## Divergences worth highlighting in prose

### 1. JavaScript hashing is async — everything "compute a CID" becomes async

Every `await sha256.digest(bytes)` in a TypeScript codebase propagates `async` through the call chain: the function that builds a record CID is async, which makes its callers async, and so on. Rust and Go stay synchronous because `Sha256::digest` and `crypto/sha256` are synchronous.

Don't try to hide this with `.then()` chains or `Promise.resolve()` wrappers. The `await` is there because `crypto.subtle.digest` is the underlying primitive in the browser, and the Node implementation mirrors it for isomorphism. `typescript/construction.md` shows the canonical pattern.

### 2. Codec constants are inconsistently shipped

- **Go** ships `cid.Raw = 0x55`, `cid.DagCBOR = 0x71`, `cid.DagPB = 0x70` as top-level constants. This is the easiest ecosystem to write strict validation in.
- **Rust**'s bare `cid` 0.11 crate removed its `Codec` enum; you use `u64` literals (or re-export from `multicodec` / `libipld`). `atproto-dasl` gives you `DAG_CBOR_CODEC` as a const, but no enum.
- **TypeScript**'s `multiformats` does not ship codec constants centrally. Each codec package (`@ipld/dag-cbor`, `@ipld/dag-json`, `multiformats/codecs/raw`) exports its own `.code`. When you want to validate "is this codec 0x55 or 0x71?", you either hand-write the constants or import two packages for the side effect of their `.code` exports.

When a skill user asks for "the DAG-CBOR codec constant," check their language — the answer is different.

### 3. Byte output: method vs property

TypeScript's `cid.bytes` is a property (returns `Uint8Array`); Rust's `cid.to_bytes()` and Go's `c.Bytes()` are methods. This is the single most common port-and-paste bug — an `await` or `()` in the wrong place.

All three return the **36-byte binary form** (no identity multibase prefix). That prefix is only present inside DAG-CBOR tag-42 wrapping, where it is added automatically by the canonical encoder.

### 4. DASL strictness is a caller-owned gate in two of three languages

The DASL CID spec is a strict *subset* of multiformats CIDs. None of the bare libraries enforces this:

- `CID.parse("QmHash…")` in TypeScript silently returns a CIDv0.
- `cid.Decode("QmHash…")` in Go silently returns a CIDv0.
- `Cid::try_from("QmHash…")` in Rust silently returns a CIDv0.

Only `atproto_dasl::DaslCid` rejects non-DASL at parse time. Every TypeScript and Go call site that expects DASL must re-validate the output (`cid.version === 1`, `cid.code === 0x55 || cid.code === 0x71`, `cid.multihash.code === 0x12` or `0x1e`, `cid.multihash.size === 32`). See `{lang}/parsing.md` for the exact gate.

### 5. Error handling shapes differ enough to change code structure

- Rust: `match err` on a typed enum, exhaustive.
- Go: `errors.Is(err, cid.ErrCidTooShort)` against sentinel values; no enum-like exhaustiveness.
- TypeScript: `err instanceof TypeError` or string-match on `err.message`. Brittle.

A skill user porting error-path logic should not assume `.message` strings carry across — Rust error variants have names (`DaslCidError::InvalidCodec { codec }`) that are genuinely more informative than the TS string `"Unsupported codec: 0x70"`.

### 6. Validation has no standalone `validate()` — it's "parse with strict expectations"

None of the three libraries expose a `validate(cid)` function. Validation means "parse successfully into the expected subset." Verification (re-hashing content to confirm the digest matches) is always a separate, caller-owned step. Every `{lang}/parsing.md` shows both:

- "Parse succeeded with DASL-compatible shape" → input is a well-formed DASL CID.
- "Re-hash content, rebuild CID, compare byte-for-byte" → content matches this CID.

Collapsing those two steps into one call is a common misunderstanding; keep them separate.

## When in doubt, lean on the reference implementations

- Rust: [`atproto-dasl`](https://docs.rs/atproto-dasl) is the ATProtocol-maintained reference. `DaslCid` enforces every rule in `shared/spec.md` at construction.
- Go / TypeScript: no single maintained strict wrapper; the gate code in `parsing.md` is the skill's reference. Port it verbatim.

## Related

- `shared/spec.md` — normative rules.
- `shared/binary-layout.md` — byte-level diagrams that the per-language code must produce.
- `shared/test-vectors.md` — fixtures for cross-language agreement testing.

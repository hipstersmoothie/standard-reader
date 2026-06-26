# TypeScript — DAG-CBOR encoding via `@atproto/lex-cbor`

TypeScript does canonical DAG-CBOR through `@atproto/lex-cbor`. The term "DRISL" does not appear in the package — Bluesky calls it "lex-cbor" or just "canonical DAG-CBOR" — but the rules of `../shared/drisl.md` apply and the encoder is conformant.

`@atproto/repo` never touches CBOR directly. Every encode/decode goes through `lex-cbor`:

```typescript
import * as cbor from '@atproto/lex-cbor'
// packages/repo/src/util.ts, /repo.ts, /car.ts, /mst/mst.ts all import this.

const bytes = cbor.encode(value)       // canonical DAG-CBOR
const value = cbor.decode(bytes)       // parses into LexValue
const cid = await cbor.cidForLex(value) // encode → sha-256 → 0x71 (dag-cbor) CID
```

## Public encoding API

From `@atproto/lex-cbor`:

- `encode(value: LexValue): Uint8Array` — canonical DAG-CBOR bytes.
- `decode(bytes: Uint8Array): LexValue` — parses the bytes into the lex data model.
- `cidForLex(value: LexValue): Promise<Cid>` — encode then CID (dag-cbor, sha-256, CIDv1).
- `encodeBlock(value)` — returns `{ cid, bytes }` in one shot (used internally to build MST blocks and commit blocks).

From `@atproto/lex-data`:

- `Cid` — the CID class used everywhere. Not `CID` (pascal in @ipld/dag-cbor); the TS atproto stack uses `Cid`.
- `decodeCid(bytes: Uint8Array): Cid` — parse a binary CID prefix (36 bytes for standard sha-256 dag-cbor).
- `isCidForBytes(cid: Cid, bytes: Uint8Array): Promise<boolean>` — re-hash `bytes` and compare to `cid`. Used by the CAR verifier.
- `LexMap`, `LexValue`, `LexArray` — the typed-value tree shapes (objects, primitives, CID links, typed bytes, blob refs).
- `ifCid(unknown): Cid | null` — narrow an unknown value to a `Cid`.

## How records round-trip

Raw block bytes → `LexMap` (record):

```typescript
import { cborToLexRecord } from '@atproto/repo'

const record = cborToLexRecord(blockBytes)    // returns LexMap, i.e. plain object
// record is a typed JS object with any nested { $link, $bytes, blob } values parsed.
```

`LexMap` values:

| In the DAG-CBOR                   | In `LexMap`                                       |
| --------------------------------- | ------------------------------------------------- |
| CBOR tag 42 (CID link)            | A `Cid` instance                                  |
| CBOR byte string (major type 2)   | `Uint8Array`                                      |
| `{ $type: "blob", ref, mimeType, size }` | A typed blob reference object              |
| Strings / numbers / booleans      | Native JS values                                  |
| Maps with bytewise-sorted string keys | Plain JS objects                              |

The TS side represents CIDs as **`Cid` instances** in memory, not as `{$link: "..."}` wrappers. JSON serialization of a `Cid` produces `{"$link": "..."}`; DAG-CBOR serialization produces tag 42. You generally don't construct the `$link` wrapper by hand — pass a `Cid` object and the encoder handles the shape.

## Canonical-encoding guarantees

`encode` emits canonical DAG-CBOR:

- Map keys sorted **bytewise** (not by struct declaration order — TS doesn't have struct-declaration-order the way Go's cbor-gen does).
- Integers in shortest form.
- No indefinite-length framing.
- CIDs as tag 42 wrapping the 37-byte identity-multibase-prefixed binary CID form.

Because the encoder canonicalizes on every call, round-tripping an arbitrary object produces stable bytes. This is what signature verification depends on: `verifyCommitSig` does `cbor.encode(commitWithoutSig)` and feeds that to the crypto library — and because the commit was signed via the same encoder, the bytes match.

On the decoder side, `decode` does NOT strict-check canonicalness. Non-canonical input will decode successfully but re-encoding may produce different bytes. For signature verification this is usually fine because you're verifying against the same encoder that produced the input. For untrusted input where re-encoded-CID comparison matters, there's no in-box strict canonical decoder; you'd re-hash the decoded bytes and compare to the claimed CID.

## Size and validation limits

Unlike Go (`atdata` enforces 1 MiB record size, 128k container length, 1 MiB string length) and Rust, **`@atproto/lex-cbor` does not enforce record size or container count limits at the encode/decode layer**. Those are enforced at higher layers:

- **PDS ingest** — the PDS rejects records > 1 MiB at the XRPC layer, not at the CBOR layer.
- **Lexicon validation** — when a record is round-tripped through a lex schema (`cborToLexRecord` followed by schema validation), individual field length/type constraints are enforced by the schema.

If you're reading potentially-adversarial CAR input, wrap `readCar` with a size cap on the input `Uint8Array` before passing it in; the CAR reader itself has no size guardrails.

## CID shape — 36 vs 37 bytes

- **Inside a CAR frame** (per block): the binary CID is 36 bytes (no multibase prefix): `0x01 0x71 0x12 0x20 <32-byte sha-256>`. TS handles this correctly via `decodeCid(blockBytes.subarray(0, 36))` in `car.ts`.
- **Inside a DAG-CBOR tag 42**: 37 bytes with identity-multibase prefix `0x00`. TS handles this inside the encoder.

See `../../atproto-cid/shared/binary-layout.md`.

## Typed bytes (`$bytes`) and blob refs

For record fields that are raw bytes, the DAG-CBOR wire form is a CBOR byte string (major type 2). JSON representation: `{"$bytes": "<unpadded base64>"}`. The TS `LexMap` represents this as a `Uint8Array` in memory — no wrapper class is needed. `encode` converts `Uint8Array` to major-type-2 bytes automatically.

Blob references:

```typescript
// In a LexMap, a blob field looks like:
{
  $type: 'blob',
  ref: Cid { ... },         // a Cid instance
  mimeType: 'image/png',
  size: 123456,
}
```

There's no first-class `Blob` class in `@atproto/repo` analogous to Go's `atdata.Blob` — callers work with plain objects that happen to have these keys.

## Divergences from Rust/Go worth remembering

| Aspect                            | TS (`@atproto/lex-cbor`)                          | Rust (`atproto-dasl`)                          | Go (cbor-gen + `atdata`)                        |
| --------------------------------- | ------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| Map key ordering on encode        | Bytewise                                          | Bytewise                                       | **Struct declaration order** (cbor-gen quirk)   |
| CID in memory                     | `Cid` class                                       | `atproto_dasl::Cid`                            | `cid.Cid` (or `CIDLink` wrapper)                |
| Size limits at CBOR layer         | None — enforced at PDS/XRPC                       | Configurable in `atproto-dasl`                 | Hard-coded in `atdata/const.go`                 |
| Strict canonical decode           | No                                                | No                                             | No (delegates to go-ipld-cbor)                  |
| Typed bytes wrapper               | Plain `Uint8Array`                                | `atproto_dasl::Bytes`                          | `atdata.Bytes`                                  |

See `../shared/divergence-matrix.md` §drisl for the full table.

## Common errors

| Error                                      | Cause                                                                         |
| ------------------------------------------ | ----------------------------------------------------------------------------- |
| `Not a valid CID`                          | `ifCid` / zod `cidSchema` rejected a field that was supposed to be a CID.     |
| `Not a valid CID for bytes (<cid>)`        | CAR ingest: block bytes don't hash to the claimed CID. Corruption or forgery. |
| `Could not parse CAR header`               | Header CBOR doesn't match the `{ version: 1, roots: Cid[] }` zod schema.      |
| `lexicon records be a json object`         | `cborToLexRecord` received bytes that decoded to a non-object (primitive / array). |

## File pointers

| Concern                      | File                                                   |
| ---------------------------- | ------------------------------------------------------ |
| Commit encode/decode         | `packages/repo/src/util.ts` (`signCommit`, `verifyCommitSig`) |
| MST encode/decode            | `packages/repo/src/mst/mst.ts` (`serialize`, `getEntries`) |
| CAR encode/decode            | `packages/repo/src/car.ts`                             |
| `cborToLex`, `cborToLexRecord` | `packages/repo/src/util.ts`                          |
| Canonical encoder            | `packages/lex-cbor/src/` (external)                    |
| `Cid` / `LexValue` / `decodeCid` | `packages/lex-data/src/` (external)                |

## See also

- `../shared/drisl.md` — language-neutral canonical DAG-CBOR rules.
- `car.md` — how encoded blocks flow through CAR frames.
- `mst.md` — `NodeData` / tree entry serialization.
- `commit.md` — `cbor.encode(unsigned)` is what `signCommit` signs.
- `../shared/divergence-matrix.md` §drisl — interop matrix across TS/Rust/Go.
- `../../atproto-cid/typescript/` — CID construction idioms in TS.

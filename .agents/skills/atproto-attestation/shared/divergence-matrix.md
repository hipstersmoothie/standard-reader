# Divergence matrix

A head-to-head comparison of Rust, TypeScript, and Go implementations of badge.blue attestations. This file exists so that porting work and interop reviews have one authoritative place to check "does X differ across languages?"

The Rust reference crate (`atproto-attestation` in the `ngerakines.me/atproto-crates` workspace) is treated as canonical.

## Library coverage

| Concern              | Rust                                    | TypeScript                          | Go                                              |
| -------------------- | --------------------------------------- | ----------------------------------- | ----------------------------------------------- |
| Canonical library    | `atproto-attestation` crate             | **none** — assemble from primitives | **none** — assemble from primitives             |
| DAG-CBOR             | `atproto-dasl` (internal)               | `@ipld/dag-cbor`                    | `github.com/ipld/go-ipld-prime/codec/dagcbor`   |
| CID                  | `cid` crate                             | `multiformats/cid`                  | `github.com/ipfs/go-cid`                        |
| ECDSA P-256          | `p256`                                  | `@noble/curves/p256`                | stdlib `crypto/ecdsa`                           |
| ECDSA K-256          | `k256`                                  | `@noble/curves/secp256k1`           | `github.com/decred/dcrd/dcrec/secp256k1/v4`     |
| ECDSA P-384          | `atproto-identity` (sign/validate only) | `@noble/curves/p384`                | stdlib `crypto/ecdsa`                           |
| Low-S normalization  | `normalize_signature`                   | noble `{ lowS: true }` / `normalizeS()` | hand-rolled with `big.Int`                  |
| TID generation       | `atproto_record::tid::Tid`              | hand-rolled or `@atproto/common`    | `indigo/atproto/syntax` or hand-rolled          |
| Remote record fetch  | `atproto_client::RecordResolver`        | caller-provided `RecordResolver`    | caller-provided `RecordResolver`                |
| DID key parsing      | `atproto_identity::identify_key`        | `multiformats/bases/base58` + varint | `multiformats/go-multibase` + `go-varint`      |

## Curve support

| Curve | Rust crate                                   | TypeScript (`@noble/curves`)                    | Go stdlib / dcrec                                       |
| ----- | -------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------- |
| P-256 | ✅ sign, verify, normalize                   | ✅ sign, verify, normalize (`{lowS: true}`)     | ✅ sign, verify — manual low-S                          |
| K-256 | ✅ sign, verify, normalize                   | ✅ sign (low-S default), verify, normalize      | ✅ sign (dcrec low-S by default), verify                |
| P-384 | ⚠️ sign/verify via `atproto-identity`; **normalize returns `UnsupportedKeyType`** | ✅ sign, verify, normalize — but interop broken (no Rust partner) | ✅ sign, verify — manual low-S; same interop break       |

**Interop rule**: use P-256 or K-256 only. P-384 does not round-trip through the reference crate's signing/append flow today.

## Signature wire format

All three languages settle on:

- IEEE P1363 `r‖s`, **not** DER.
- 64 bytes (P-256/K-256); 96 bytes (P-384).
- Big-endian, zero-padded.

| Language   | Getting P1363                                         | Getting DER                          |
| ---------- | ----------------------------------------------------- | ------------------------------------ |
| Rust       | `p256::ecdsa::Signature::to_vec()` / `k256::…`        | `.to_der()` (deliberately unused)    |
| TypeScript | `sig.toCompactRawBytes()`                             | `sig.toDERRawBytes()` (don't use)    |
| Go         | hand-assemble from `r.Bytes()` + `s.Bytes()`          | `ecdsa.SignASN1` / `asn1.Marshal`    |

### Base64

All three use **standard** base64 with `=` padding. None use URL-safe.

| Language   | Encoder                                                    |
| ---------- | ---------------------------------------------------------- |
| Rust       | `base64::engine::general_purpose::STANDARD`                |
| TypeScript | `Buffer.toString("base64")` / `btoa(String.fromCharCode…)` |
| Go         | `base64.StdEncoding`                                       |

## CID computation

All three must produce identical CIDv1 bytes given the same inputs. The pipeline is:

1. Strip `signatures` from record.
2. Strip `cid`/`signature` from metadata, insert `repository`.
3. Merge metadata under `$sig` key.
4. DAG-CBOR encode (canonical: sorted keys, minimal ints, 64-bit floats, definite lengths).
5. SHA-256.
6. CIDv1, codec `0x71`, multihash `0x12`.

### Canonical DAG-CBOR — per-language caveats

- **Rust**: `atproto-dasl` is strict DAG-CBOR; no configuration needed.
- **TypeScript**: `@ipld/dag-cbor` is strict DAG-CBOR.
- **Go**: `go-ipld-prime` is strict DAG-CBOR. `fxamacker/cbor` with `CoreDetEncOptions` is close but does not handle CBOR tag 42 (CID links) without custom registration. For attestation *metadata* (strings and basic types), both work; for records that embed CIDs, use go-ipld-prime.

### Float handling

DAG-CBOR encodes all floats as 64-bit IEEE 754. JS's `number` type is always a 64-bit float — but `1` and `1.0` round-trip as the same value, so encoding is deterministic. Rust / Go distinguish `i64` and `f64` at the type level; be careful when shaping records that include numbers — an `i64` intent encoded as `f64` produces a different CID.

Practical rule: avoid floats in attestation records and metadata. If you must use them, fix types and test vectors.

### Integer minimization

All three libraries emit CBOR major type 0/1 with the shortest possible encoding (1-byte for 0–23, 2-byte for 24–255, etc.). No divergence.

## Hashing algorithms

| Step                       | Rust                         | TypeScript                             | Go                                  |
| -------------------------- | ---------------------------- | -------------------------------------- | ----------------------------------- |
| DAG-CBOR body → SHA-256    | `sha2::Sha256`               | `multiformats/hashes/sha2` (`SubtleCrypto.digest` or `@noble/hashes`) | `crypto/sha256`                     |
| ECDSA digest (internal)    | RustCrypto library internal  | `@noble/curves` internal SHA-256       | `crypto/sha256` explicit            |

Go is the odd one here: callers pass the **digest** to `ecdsa.Sign`, while Rust and TS pass the **message** (hashing happens inside the library). The outputs are equivalent because the internal hash is also SHA-256.

## Verify permissiveness

| Behavior                                     | Rust reference | TS (suggested)       | Go (suggested)       |
| -------------------------------------------- | -------------- | -------------------- | -------------------- |
| Accepts high-S inline signatures             | ✅ yes          | ✅ yes by default     | ✅ yes by default     |
| Optional strict low-S                        | ❌ not exposed  | ✅ `strictLowS: true` | ✅ `StrictLowS: true` |
| Verifies proof record's DAG-CBOR CID match   | ❌ no           | ✅ default on         | ✅ default on         |
| Verifies content CID inside proof record      | ✅ yes          | ✅ yes                | ✅ yes                |

The TS and Go implementations *default* to a stricter posture (verify proof record CID) than the Rust reference. This is a defensible improvement — callers who want byte-for-byte Rust behavior pass `verifyProofCid: false` / `VerifyProofCid: false`.

## Async surface

| Flow                                  | Rust                          | TypeScript     | Go                                   |
| ------------------------------------- | ----------------------------- | -------------- | ------------------------------------ |
| `create_inline_attestation`           | sync                          | async (SHA256) | sync                                 |
| `create_remote_attestation`           | sync                          | async (SHA256) | sync                                 |
| `append_inline_attestation`           | **async** (key resolution)    | async          | async (context.Context threaded)     |
| `verify_record`                       | **async** (fetches + resolve) | async          | async                                |

TypeScript is async everywhere because `SubtleCrypto.digest` is async. The Rust and Go paths are sync for create (pure CPU) and async only where I/O happens (remote resolution).

## TID generation

| Concern                    | Rust                          | TypeScript                        | Go                                  |
| -------------------------- | ----------------------------- | --------------------------------- | ----------------------------------- |
| Library                    | `atproto_record::tid::Tid::new()` | hand-roll or `@atproto/common` | `indigo/atproto/syntax.NewTID()` or hand-roll |
| Format                     | 13-char base32-sortable       | same                              | same                                |
| Clock skew protection      | ✅ monotonic with last seen    | must be implemented in hand-roll  | must be implemented in hand-roll    |

All three must produce `syntax`-valid TIDs (base32, 13 chars, high bit clear). Use the library if possible.

## `RecordResolver` / `KeyResolver` trait shapes

| Trait          | Rust                                                            | TypeScript                                              | Go                                                          |
| -------------- | --------------------------------------------------------------- | ------------------------------------------------------- | ----------------------------------------------------------- |
| KeyResolver    | `async fn resolve(&self, key: &str) -> Result<KeyData, Error>`   | `resolveKey(key: string) => Promise<{curve, publicKey}>` | `ResolveKey(ctx, keyRef) (Curve, any, error)`               |
| RecordResolver | `async fn resolve<T: DeserializeOwned>(&self, uri: &str)`        | `resolveRecord(uri: string) => Promise<Record<string, unknown>>` | `ResolveRecord(ctx, uri) (map[string]any, error)`         |

Shapes are equivalent in intent. The Rust variant is generic over `T` (you get typed records out); TS/Go return dynamic maps. For proof records (usually string-typed metadata) this isn't consequential.

## CLI tooling

| Language   | CLI available?                                               |
| ---------- | ------------------------------------------------------------ |
| Rust       | ✅ `atproto-attestation-sign` / `…-verify` in the crate       |
| TypeScript | ❌ none published; easy to wrap `createInlineAttestation` with `yargs` |
| Go         | ❌ none published; easy to wrap with `cobra` / flag          |

The Rust CLIs are the quickest path to producing a signed record for cross-language verification. See `test-vectors.md`.

## Error taxonomies

Rust has a single numbered enum (`AttestationError`) with codes `error-atproto-attestation-1` through `…-30`. TS and Go have no standard scheme — suggest mapping to similarly-structured error types in your port:

| Rust variant                         | Meaning                                                   |
| ------------------------------------ | --------------------------------------------------------- |
| `RecordMustBeObject`                 | input was null/array/scalar                               |
| `MetadataMissingType`                | `$type` missing from metadata                             |
| `RemoteAttestationCidMismatch`       | proof record's claimed content CID ≠ computed            |
| `SignatureValidationFailed`          | ECDSA verify returned false                               |
| `UnsupportedKeyType`                 | non-P-256/K-256 passed to `normalize_signature`           |
| `KeyResolutionFailed`                | `KeyResolver` returned an error                           |
| `RemoteAttestationFetchFailed`       | `RecordResolver` returned an error                        |
| `SignatureLengthInvalid`             | signature bytes not exactly 64 (or expected length)       |

Port these as distinct error types in TS/Go so consumer code can pattern-match rather than parsing strings.

## Known porting hazards

1. **P-384 normalization** — the Rust crate doesn't implement it. TS and Go *can* but produce signatures the Rust crate can't renormalize on append. Block P-384 for interop.
2. **Go non-deterministic signing** — `crypto/ecdsa.Sign` uses `rand.Reader`. Test vectors generated in Go won't match Rust / TS bit-for-bit without a deterministic signer. Use `dcrec` for K-256 (RFC 6979 default) and `cloudflare/circl` for P-256/P-384 with deterministic mode.
3. **TypeScript `1` vs `1.0`** — if a metadata value is a JS `number` that happens to be integer-valued, it encodes as a CBOR integer, not float. A Rust caller may have typed it as `f64` and encoded as a float. If metadata contains numbers, align types carefully.
4. **Float-valued metadata in general** — avoid. Use strings, bools, ints, and nested objects.
5. **Proof record transmogrification** — the Rust crate sends proof records through `atproto-dasl`'s canonical encoder. TS/Go using `@ipld/dag-cbor` or `go-ipld-prime` get canonical output too. But if your proof record contains a CID (`$link`), that needs tag-42 encoding — none of the naive paths handle this without special handling.
6. **Base64 alphabet drift** — easy to slip on `URL_SAFE` or `NO_PAD`. Double-check: standard alphabet with padding.
7. **Key bytes format for `did:key:`** — all three curves use **compressed** SEC1 (33 bytes for P-256/K-256, 49 bytes for P-384). Uncompressed form (65/97 bytes) won't round-trip.

## See also

- Each per-language `README.md` for stack choices.
- `../rust/signatures.md`, `../typescript/signatures.md`, `../go/signatures.md` — per-language crypto details.
- `cid-computation.md`, `signature-normalization.md` — the spec that everyone has to match.
- `test-vectors.md` — current interop fixtures.

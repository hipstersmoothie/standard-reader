# TypeScript — setup & idioms

There is no canonical TypeScript crate for badge.blue attestations at the time of writing. This file documents the recommended library stack and the shape an implementation takes; see `creating.md` and `verifying.md` for concrete flows.

## Library stack

Every primitive badge.blue needs has a well-maintained TS library:

| Concern            | Recommended library              | Why                                                                                 |
| ------------------ | -------------------------------- | ----------------------------------------------------------------------------------- |
| DAG-CBOR encoding  | `@ipld/dag-cbor`                 | IPLD-official canonical DAG-CBOR. Works in Node and browsers.                       |
| CID construction   | `multiformats` (+ `multiformats/cid`, `multiformats/hashes/sha2`) | Official IPLD multiformats implementation.                                         |
| SHA-256            | `multiformats/hashes/sha2` (re-exports browser/Node crypto) or `@noble/hashes` | Pure JS fallback via `@noble/hashes` if you need full browser support without deps. |
| ECDSA P-256, K-256 | `@noble/curves` (`p256`, `secp256k1`) | Audited, zero-dep, works everywhere. Supports both curves; has explicit low-S helpers. |
| Base64             | built-in (`btoa`/`Buffer`) or `uint8arrays`/from-`multiformats/bases/base64` | Either works — the spec uses standard base64 with padding.                          |

Install:

```bash
pnpm add @ipld/dag-cbor multiformats @noble/curves @noble/hashes
```

Or npm / yarn equivalents. None of these require native extensions.

### Why not the `@atproto` / `@bsky` packages

The official `@atproto/*` suite does not yet expose a badge.blue attestation API. `@atproto/common` has some DAG-CBOR and CID helpers, but they're not public API. Using it would couple you to implementation details that can break across minor versions. Stick with the IPLD primitives.

## AT Protocol record shape in TS

Records are plain JS objects. There is **no** special `$bytes` type you need to model for signing — you serialize the record as-is, and `$bytes` wrappers appear only in the final output (see below). For DAG-CBOR encoding, byte strings become `Uint8Array` / `CID` in IPLD; JSON's `$bytes` / `$link` wrappers are AT Protocol's JSON encoding of those.

```ts
interface AttestedRecord {
  $type: string;
  // … your record fields
  signatures?: Array<InlineAttestation | RemoteAttestation>;
}

interface InlineAttestation {
  $type: string;          // attestor-chosen NSID, NOT com.atproto.repo.strongRef
  key: string;            // did:key:z…
  cid: string;            // content CID, base32 string
  signature: { $bytes: string }; // base64 of 64-byte normalized signature
  [k: string]: unknown;   // other metadata fields participate in the CID
}

interface RemoteAttestation {
  $type: "com.atproto.repo.strongRef";
  uri: string;            // at://did/collection/rkey
  cid: string;            // the proof record's DAG-CBOR CID
}
```

## DAG-CBOR encoding

`@ipld/dag-cbor` handles canonical encoding out of the box:

```ts
import * as dagCbor from "@ipld/dag-cbor";

const bytes = dagCbor.encode(obj); // Uint8Array, canonical form
```

Under the hood:

- Map keys sorted by UTF-8 byte sequence.
- Definite-length strings/arrays/maps.
- Integers minimal-width.
- Floats always 64-bit.
- `CID` instances → CBOR tag 42.

You pass JS values; the encoder canonicalizes. Do **not** pre-sort keys yourself or JSON-stringify first — that's double-encoding (`../shared/cid-computation.md` §common-mistakes).

### What about `$link` / `$bytes`?

AT Protocol's JSON → DAG-CBOR convention:

- `{ "$link": "bafy…" }` → CBOR tag 42 (CID).
- `{ "$bytes": "…base64…" }` → CBOR byte string.

If you encode attestation *metadata* before the signature is added (which is what CID computation does), there are no `$link`/`$bytes` entries yet. But if you later encode a *signed* record (say, for the PDS to store), you must convert `{ "$bytes": base64 }` to a raw `Uint8Array` before `dagCbor.encode`. Implementations typically walk the tree and transmogrify; see the `atpmcp.transmogrify_record` MCP for a server-side solution.

## CID construction

```ts
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import * as raw from "multiformats/codecs/raw"; // not used here; for reference

import * as dagCbor from "@ipld/dag-cbor";

const bytes = dagCbor.encode(obj);
const digest = await sha256.digest(bytes);   // Multihash-wrapped
const cid = CID.createV1(dagCbor.code, digest); // code 0x71
// cid.toString()  → "bafyrei…"
// cid.bytes       → Uint8Array, 36 bytes (binary CID)
```

`dagCbor.code` is `0x71`. `sha256.code` is `0x12`. This gives you a CIDv1 with the exact parameters badge.blue requires.

### What to sign

For **inline** attestations, sign `cid.bytes` — the 36-byte binary form. **Not** `cid.toString()`, **not** `digest.digest` (the bare 32-byte hash). See `signatures.md`.

## ECDSA with `@noble/curves`

```ts
import { p256 } from "@noble/curves/p256";
import { secp256k1 } from "@noble/curves/secp256k1";

// P-256 (NIST prime256v1)
const privP = p256.utils.randomPrivateKey();         // Uint8Array(32)
const pubP  = p256.getPublicKey(privP, /*compressed*/ true);
const sigP  = p256.sign(cidBytes, privP, { lowS: true }); // Signature object
const rsP   = sigP.toCompactRawBytes();              // Uint8Array(64) - r‖s

// K-256 (secp256k1)
const privK = secp256k1.utils.randomPrivateKey();
const pubK  = secp256k1.getPublicKey(privK, true);
const sigK  = secp256k1.sign(cidBytes, privK, { lowS: true });
const rsK   = sigK.toCompactRawBytes();
```

Key details:

- `sign(msg, priv, { lowS: true })` — `lowS: true` performs normalization for you. If omitted, noble defaults to `lowS: true` on secp256k1 but you should pass it explicitly for clarity.
- `toCompactRawBytes()` gives 64-byte IEEE P1363 (`r‖s`). **Use this**, not `toDERRawBytes()`.
- `@noble/curves` expects the raw message bytes — no double-hashing. Because `sign` hashes with SHA-256 internally by default, you'd double-hash if you pass the CID bytes without `{ prehash: false }`. **Actually**, for attestations we sign the CID bytes themselves (which is a hash, but we treat it as the message). See below.

### Pre-hash vs not

`@noble/curves` defaults to hashing the input with SHA-256 before signing: this is what you usually want. But for badge.blue attestations, the **message being signed is the 36-byte CID bytes** — not a hash-preimage. The Rust reference does `ecdsa_sign(cid.to_bytes())` which internally hashes those 36 bytes with SHA-256 and signs the resulting digest.

So you have two choices, both yielding identical results:

```ts
// A. Let noble hash — same as Rust reference behavior.
const sig = p256.sign(cidBytes, priv); // hashes SHA-256 → signs digest

// B. Pre-hash and pass { prehash: true } (noble 1.x) or
//    pass the already-hashed 32-byte digest with the low-level API.
//    NOT recommended — it's the same bytes, just fiddlier.
```

**Use option A.** The Rust crate does: `ecdsa.sign(cid.to_bytes())` → the underlying ECDSA sign routine hashes with SHA-256 internally. Noble matches.

### Verification

```ts
const ok = p256.verify(rsP, cidBytes, pubP); // boolean
```

Noble's `verify` is permissive by default — accepts both high-S and low-S. To reject high-S explicitly:

```ts
const ok = p256.verify(rsP, cidBytes, pubP, { lowS: true });
```

## Key serialization to `did:key:`

`did:key:` encoding = multibase(base58btc) of multicodec-prefixed compressed public key:

| Curve  | Multicodec prefix (varint) | Key bytes                     |
| ------ | -------------------------- | ----------------------------- |
| P-256  | `0x1200` (`0x80 0x24` varint) | 33-byte compressed SEC1       |
| K-256  | `0xe7` (varint `0xe7 0x01`)   | 33-byte compressed SEC1       |

There's no single canonical TS lib that does this for both curves. Options:

- `@atproto/identity` — has `Did.Key.formatDidKey` / `parseDidKey`. Works but couples you to atproto.
- `did-resolver` + `key-did-resolver` — general DID library.
- Hand-roll with `multiformats/bases/base58` + `varint` — ~30 LOC per curve.

For just signing and verifying in a self-contained app, you often don't need `did:key:` — you can pass pubkey bytes around directly and render `did:key:` only at record-serialization time.

## Async / sync

All noble operations are sync (they're pure-JS crypto over bignum). `dagCbor.encode` is sync. `sha256.digest` is async (returns a Promise because Web Crypto's SubtleCrypto is async on browsers).

So attestation creation is a single `await` for the SHA-256 step; everything else is sync.

## Module / environment support

- **Node 18+**: everything works. `Buffer.from(…, "base64")` / `.toString("base64")` for base64. Web Crypto available.
- **Deno**: same as Node, import from esm.sh or npm specifiers.
- **Bun**: fine; Bun ships Web Crypto and all the JS libs work.
- **Browsers**: all these libs are pure JS / tree-shakeable. `multiformats/hashes/sha2` uses `SubtleCrypto.digest` where available; `@noble/hashes` is a pure-JS fallback.

No native modules; no compile step beyond your normal bundler.

## See also

- `creating.md` — inline + remote worked examples.
- `verifying.md` — verification loop + resolvers.
- `signatures.md` — ECDSA details and noble gotchas.
- `../shared/spec.md` — normative spec.
- `../shared/divergence-matrix.md` — how TS compares to Rust/Go, especially around missing canonical library.

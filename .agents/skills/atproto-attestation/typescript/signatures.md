# TypeScript — ECDSA signing & normalization

Recommended library: `@noble/curves`. It's audited, zero-dependency, and covers all three curves the spec mentions. The spec requires IEEE P1363 `r‖s` output and low-S normalization — both are one option away in noble.

## Curve imports

```ts
import { p256 } from "@noble/curves/p256";            // NIST P-256 / secp256r1
import { secp256k1 } from "@noble/curves/secp256k1";  // K-256 / Bitcoin curve
import { p384 } from "@noble/curves/p384";            // spec mentions it; avoid for interop
```

All three expose the same interface: `sign`, `verify`, `getPublicKey`, `utils.randomPrivateKey`, and a `Signature` class with `toCompactRawBytes()` / `toDERRawBytes()`.

## Signing

```ts
import { p256 } from "@noble/curves/p256";

const privateKey = p256.utils.randomPrivateKey();       // Uint8Array(32)
const cidBytes   = contentCid.bytes;                    // Uint8Array(36)

const sig = p256.sign(cidBytes, privateKey, { lowS: true });
// sig is a `SignatureType` (r/s big ints)

const rs = sig.toCompactRawBytes();
// rs: Uint8Array(64) — 32-byte r ‖ 32-byte s, already low-S
```

### What `sign` does internally

1. Hashes `cidBytes` with SHA-256 → 32-byte digest.
2. Generates a deterministic `k` per RFC 6979 (default for noble; no external RNG).
3. Computes `(r, s)`.
4. If `{ lowS: true }` (or default-on for secp256k1), replaces `s` with `n - s` when `s > n/2`.
5. Returns a `Signature` object.

Step 1 matters: the **message you pass is the 36-byte CID**, not a 32-byte digest. Noble hashes it internally. The Rust reference does the same thing via its underlying ECDSA library. Cross-language compat: ✓.

### `{ lowS: true }` — when to set it

| Curve       | Default `lowS` | What to pass |
| ----------- | -------------- | ------------ |
| secp256k1   | `true`         | `{ lowS: true }` (explicit is good)  |
| p256        | `false`        | **Must** pass `{ lowS: true }`       |
| p384        | `false`        | **Must** pass `{ lowS: true }` — but see gap |

For attestations, always pass `{ lowS: true }` explicitly. Cost is nil; silent high-S sigs are hard to debug later.

### Normalizing an already-produced signature

If you get a raw 64-byte signature from somewhere else and want to low-S-normalize it:

```ts
const parsed = p256.Signature.fromCompact(rs);
const normalized = parsed.normalizeS(); // returns a (possibly-new) Signature
const rsLowS = normalized.toCompactRawBytes();
```

`normalizeS()` is idempotent. If it was already low-S it returns the same signature.

## Verifying

```ts
const ok = p256.verify(rs, cidBytes, publicKey);
```

`verify`:

1. Parses `rs` as two big ints (from 64-byte compact form).
2. Hashes `cidBytes` with SHA-256.
3. Runs ECDSA verify.
4. Returns `boolean`.

Optional `{ lowS: true }` makes verify *reject* high-S:

```ts
const okStrict = p256.verify(rs, cidBytes, publicKey, { lowS: true });
```

Match to your threat model. The badge.blue spec doesn't require strict low-S on verify.

### Public key formats

`verify` accepts:
- 33-byte compressed SEC1 (`0x02`/`0x03` prefix + 32 bytes X).
- 65-byte uncompressed SEC1 (`0x04` prefix + 32 bytes X + 32 bytes Y).

`did:key:z…` decodes to the 33-byte compressed form. Pass through directly.

## DER ↔ P1363 conversion (when you need it)

Most TS paths don't need this — you get P1363 directly from noble. But if you're consuming signatures from, say, a Java or Go ECDSA stdlib signer:

```ts
// DER → P1363
const sig = p256.Signature.fromDER(derBytes);
const rs = sig.toCompactRawBytes();

// P1363 → DER
const sig2 = p256.Signature.fromCompact(rs);
const der = sig2.toDERRawBytes();
```

DER is variable length (~70–72 bytes); P1363 is always `r‖s` at curve width (64 for P-256/K-256, 96 for P-384).

## Key generation and `did:key:`

```ts
const priv = p256.utils.randomPrivateKey();    // 32 bytes, secure
const pub  = p256.getPublicKey(priv, true);    // 33-byte compressed

// Compose a did:key: string
import { base58btc } from "multiformats/bases/base58";
import * as varint from "uint8-varint";

// Multicodec prefix for p256-pub is 0x1200 (2 bytes varint: 0x80 0x24)
const prefix = varint.encodingLength(0x1200);
const prefixed = new Uint8Array(prefix + pub.length);
varint.encodeTo(0x1200, prefixed, 0);
prefixed.set(pub, prefix);
const didKey = "did:key:" + base58btc.encode(prefixed); // includes leading 'z'
```

For K-256 replace `0x1200` with `0xe7`. For P-384 use `0x1201` — though normalization is still broken upstream, see below.

## The P-384 situation

- `@noble/curves/p384` works fine for signing and verifying.
- The reference Rust crate does **not** implement low-S for P-384 — `normalize_signature` returns `UnsupportedKeyType`.
- So if you produce a P-384 attestation in TypeScript and try to verify it with the Rust crate, *verification itself* works (permissive), but *re-signing* or *append*-style flows that renormalize will fail.
- For interop: avoid P-384 for attestations until the Rust crate gains support.

TS-local workflows (TS signer + TS verifier) work fine, but you're off the spec's interop guarantees.

## Deterministic (test-vector) signing

Both noble and the Rust crate use RFC 6979 deterministic nonces, so a given `(priv, msg)` pair produces the same signature bytes every time. This is useful for test vectors:

```ts
const sig1 = p256.sign(cid.bytes, priv, { lowS: true }).toCompactRawBytes();
const sig2 = p256.sign(cid.bytes, priv, { lowS: true }).toCompactRawBytes();
// sig1 byte-equal sig2
```

If you generate vectors with a fixed `priv` from a deterministic source (e.g., `sha256("atproto-attestation-test-vector-1")`), TS and Rust produce identical bytes.

## Verifying the Rust reference crate's output in TS

You can drive the Rust crate's `atproto-attestation-sign` binary, then verify in TS:

```bash
echo '{"$type":"test","x":1}' \
  | cargo run -p atproto-attestation --features clap,tokio --bin atproto-attestation-sign \
    -- inline - did:plc:test did:key:zQ3sh... '{"$type":"com.example.sig","key":"did:key:zQ3sh..."}' \
  > signed.json
```

In TS:

```ts
import { verifyRecord } from "./verify";
const signed = JSON.parse(fs.readFileSync("signed.json", "utf8"));
await verifyRecord({
  record: signed,
  repository: "did:plc:test",
  keyResolver: localKeyResolver,
  recordResolver: { resolveRecord: () => { throw new Error("no remotes"); } },
});
```

Full trip works if the TS implementation tracks `../shared/cid-computation.md` exactly.

## Common mistakes

- **Forgetting `{ lowS: true }` on P-256.** Produces high-S sigs half the time, verifies against permissive verifiers, fails against strict ones.
- **Using `toDERRawBytes`.** The spec mandates 64-byte `r‖s`. DER is 70–72.
- **Using browser `SubtleCrypto.sign` for attestations.** SubtleCrypto's ECDSA output is P1363 (good!) but you can't control low-S without a post-process step. Noble is simpler.
- **Using WebCrypto for K-256.** WebCrypto doesn't support secp256k1 in most browsers. Noble does.
- **Hand-rolling the multicodec prefix.** Easy to get the varint wrong. Use `uint8-varint` or an existing DID library.
- **Mixing up `p256.sign(msg, priv)` and `p256.sign(priv, msg)`.** Noble is `(msg, priv)`. Be careful.
- **Assuming P-384 round-trips.** See above.

## See also

- `creating.md`, `verifying.md` — the flows these primitives power.
- `../shared/signature-normalization.md` — curve orders, cross-language coverage.
- `../rust/signatures.md`, `../go/signatures.md` — peer comparisons.
- `@noble/curves` docs: <https://github.com/paulmillr/noble-curves>.

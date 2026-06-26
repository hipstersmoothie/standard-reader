# TypeScript — creating attestations

No off-the-shelf library; you assemble from primitives. These snippets show the full flow end-to-end and are meant to be copied into an application (or the seed of an NPM package).

## Helper: compute the content CID

```ts
import * as dagCbor from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";

/**
 * Compute the content CID per badge.blue spec:
 *   record' = record without `signatures`
 *   meta'   = metadata without `cid`/`signature`, with `repository` added
 *   record'[$sig] = meta'
 *   CID = CIDv1(dag-cbor, SHA-256(dagCbor.encode(record')))
 */
export async function computeContentCid(
  record: Record<string, unknown>,
  metadata: Record<string, unknown>,
  repository: string
): Promise<CID> {
  if (typeof record !== "object" || record === null || Array.isArray(record)) {
    throw new Error("record must be a JSON object");
  }
  if (typeof metadata !== "object" || metadata === null || Array.isArray(metadata)) {
    throw new Error("metadata must be a JSON object");
  }

  // Strip `signatures` from record
  const { signatures: _s, ...strippedRecord } = record as Record<string, unknown> & {
    signatures?: unknown;
  };

  // Prepare metadata: drop cid/signature, add repository
  const { cid: _c, signature: _sig, ...strippedMeta } = metadata as Record<string, unknown> & {
    cid?: unknown;
    signature?: unknown;
  };
  const sigMetadata = { ...strippedMeta, repository };

  // Merge: record[$sig] = meta
  const merged = { ...strippedRecord, $sig: sigMetadata };

  // DAG-CBOR encode → SHA-256 → CIDv1(0x71)
  const bytes = dagCbor.encode(merged);
  const digest = await sha256.digest(bytes);
  return CID.createV1(dagCbor.code, digest);
}
```

This is the heart of every flow below. Test it with `shared/test-vectors.md` once canonical vectors land.

## Helper: standard base64

```ts
// Node
function toBase64(bytes: Uint8Array): string {
  return Buffer.from(bytes).toString("base64");
}
function fromBase64(str: string): Uint8Array {
  return new Uint8Array(Buffer.from(str, "base64"));
}

// Browser / Deno
function toBase64Browser(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s); // standard alphabet with padding
}
function fromBase64Browser(str: string): Uint8Array {
  const raw = atob(str);
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}
```

## Inline attestation — create

```ts
import { p256 } from "@noble/curves/p256";
import { secp256k1 } from "@noble/curves/secp256k1";

type Curve = "p256" | "k256";

export interface InlineCreateArgs {
  record: Record<string, unknown>;
  metadata: Record<string, unknown>;   // must include $type and key (did:key:)
  repository: string;                   // did:plc:… of subject repo
  privateKey: Uint8Array;               // 32-byte scalar
  curve: Curve;
}

export async function createInlineAttestation(args: InlineCreateArgs): Promise<Record<string, unknown>> {
  const cid = await computeContentCid(args.record, args.metadata, args.repository);

  const cidBytes = cid.bytes; // 36 bytes — THIS is what we sign

  const curve = args.curve === "p256" ? p256 : secp256k1;
  const sig = curve.sign(cidBytes, args.privateKey, { lowS: true });
  const rs = sig.toCompactRawBytes();
  // rs is 64 bytes (r‖s), low-S normalized

  const attestation = {
    ...args.metadata,
    cid: cid.toString(),
    signature: { $bytes: toBase64(rs) },
  };

  // Strip transient `repository` if present in metadata (paranoid — it shouldn't be):
  delete (attestation as { repository?: unknown }).repository;

  const existing = Array.isArray(args.record.signatures) ? args.record.signatures : [];
  return {
    ...args.record,
    signatures: [...existing, attestation],
  };
}
```

Usage:

```ts
const signed = await createInlineAttestation({
  record: { $type: "app.bsky.feed.post", text: "hi", createdAt: new Date().toISOString() },
  metadata: {
    $type: "com.example.inlineSignature",
    key: "did:key:zDnaeR...",
    issuer: "did:plc:issuer123",
    issuedAt: new Date().toISOString(),
    purpose: "authorship",
  },
  repository: "did:plc:publisher456",
  privateKey,
  curve: "p256",
});
```

`signed` is a plain JS object; send it to your PDS via `com.atproto.repo.putRecord`.

### Gotcha: `signatures` field in metadata

If your `metadata` accidentally contains a `signatures` field, it stays there — the stripping rule applies to **record**, not metadata. Don't put `signatures` in metadata; it's a record-level field.

### Gotcha: ordering

You do **not** need to sort keys on `metadata` or `record` before passing them — `dagCbor.encode` canonicalizes. But be aware that if you round-trip through `JSON.stringify`/`JSON.parse` somewhere, numeric precision can drift (`1.0` vs `1`). DAG-CBOR treats these differently (`1` is an integer, `1.0` is a float). Keep your data types stable.

## Remote attestation — create

```ts
import { tidGenerate } from "./tid";    // see below

export interface RemoteCreateArgs {
  record: Record<string, unknown>;
  metadata: Record<string, unknown>;           // must include $type
  subjectRepository: string;
  attestorRepository: string;
}

export interface RemoteCreateResult {
  attestedRecord: Record<string, unknown>;     // record with strongRef appended — publish to subjectRepository
  proofRecord: Record<string, unknown>;        // proof record — publish to attestorRepository
  proofUri: string;                            // at:// URI the caller must publish the proof to
}

export async function createRemoteAttestation(args: RemoteCreateArgs): Promise<RemoteCreateResult> {
  const metaType = args.metadata.$type;
  if (typeof metaType !== "string") throw new Error("metadata must have $type");

  // 1. Content CID (binds record + metadata + subject repo)
  const contentCid = await computeContentCid(args.record, args.metadata, args.subjectRepository);

  // 2. Build proof record (metadata + cid field)
  const proofRecord: Record<string, unknown> = {
    ...args.metadata,
    cid: contentCid.toString(),
  };

  // 3. Compute proof record's DAG-CBOR CID (NO $sig merge — plain DAG-CBOR CID)
  const proofBytes = dagCbor.encode(proofRecord);
  const proofDigest = await sha256.digest(proofBytes);
  const proofCid = CID.createV1(dagCbor.code, proofDigest);

  // 4. Pick a TID for the proof record's rkey
  const rkey = tidGenerate(); // e.g., "3kxh2f4jabc2s"

  // 5. Build strongRef
  const proofUri = `at://${args.attestorRepository}/${metaType}/${rkey}`;
  const strongRef = {
    $type: "com.atproto.repo.strongRef",
    uri: proofUri,
    cid: proofCid.toString(),
  };

  // 6. Append to record.signatures
  const existing = Array.isArray(args.record.signatures) ? args.record.signatures : [];
  const attestedRecord = {
    ...args.record,
    signatures: [...existing, strongRef],
  };

  return { attestedRecord, proofRecord, proofUri };
}
```

### TID generation

TIDs are atproto's 13-character base32-sortable time identifiers. Minimal implementation:

```ts
const TID_ALPHABET = "234567abcdefghijklmnopqrstuvwxyz";

let lastTime = 0n;
let lastClock = 0n;

export function tidGenerate(): string {
  let time = BigInt(Date.now()) * 1000n;
  if (time <= lastTime) time = lastTime + 1n;
  lastTime = time;
  // Random 10-bit clock id
  const clock = BigInt(Math.floor(Math.random() * 1024));
  // top bit 0, 53 bits time microseconds, 10 bits clock
  const combined = (time << 10n) | clock;

  let s = "";
  let v = combined;
  for (let i = 0; i < 13; i++) {
    s = TID_ALPHABET[Number(v & 31n)] + s;
    v >>= 5n;
  }
  return s;
}
```

Or use `@atproto/common` / `@atproto/syntax`'s `TID` class if you're already pulling in atproto packages.

### Publishing sequence

After `createRemoteAttestation` returns:

```ts
const { attestedRecord, proofRecord, proofUri } = await createRemoteAttestation(...);

const [, , , , collection, rkey] = proofUri.split("/"); // or a real parser
// 1. Publish the proof record first.
await xrpc.call("com.atproto.repo.putRecord", {
  repo: attestorRepository,
  collection,
  rkey,
  record: proofRecord,
});

// 2. Then publish the attested record.
await xrpc.call("com.atproto.repo.putRecord", {
  repo: subjectRepository,
  collection: subjectRecordCollection,
  rkey: subjectRecordRkey,
  record: attestedRecord,
});
```

Publishing in the other order leaves a dangling strongRef if step 2 succeeds before step 1. Prefer proof-first.

## Append flows

### Append an existing inline attestation

```ts
export interface AppendInlineArgs {
  record: Record<string, unknown>;
  attestation: Record<string, unknown>; // untrusted — will be validated
  repository: string;
  resolveKey: (keyRef: string) => Promise<{ curve: Curve; publicKey: Uint8Array }>;
}

export async function appendInlineAttestation(args: AppendInlineArgs): Promise<Record<string, unknown>> {
  // Strip cid / signature from attestation to rebuild metadata
  const { cid: claimedCid, signature, ...meta } = args.attestation as Record<string, unknown> & {
    cid?: unknown;
    signature?: { $bytes?: string } | unknown;
  };

  if (typeof claimedCid !== "string") throw new Error("attestation missing cid");

  const computedCid = await computeContentCid(args.record, meta as Record<string, unknown>, args.repository);
  if (computedCid.toString() !== claimedCid) {
    throw new Error(`attestation cid mismatch: expected ${claimedCid} computed ${computedCid}`);
  }

  const sigBytesB64 = (signature as { $bytes?: string })?.$bytes;
  if (typeof sigBytesB64 !== "string") throw new Error("signature.$bytes missing");
  const sigBytes = fromBase64(sigBytesB64);

  const keyRef = args.attestation.key;
  if (typeof keyRef !== "string") throw new Error("attestation.key missing");
  const { curve, publicKey } = await args.resolveKey(keyRef);

  const ok = (curve === "p256" ? p256 : secp256k1).verify(sigBytes, computedCid.bytes, publicKey);
  if (!ok) throw new Error("signature verification failed");

  const existing = Array.isArray(args.record.signatures) ? args.record.signatures : [];
  return { ...args.record, signatures: [...existing, args.attestation] };
}
```

### Append a remote strongRef to an already-stored proof

```ts
export interface AppendRemoteArgs {
  record: Record<string, unknown>;
  proofMetadata: Record<string, unknown>; // has $type, cid, and any attestation fields
  repository: string;
  attestationUri: string;
}

export async function appendRemoteAttestation(args: AppendRemoteArgs): Promise<Record<string, unknown>> {
  const claimedCid = args.proofMetadata.cid;
  if (typeof claimedCid !== "string") throw new Error("proofMetadata.cid missing");

  // Strip cid for CID computation
  const { cid: _, ...stripped } = args.proofMetadata;
  const computed = await computeContentCid(args.record, stripped, args.repository);
  if (computed.toString() !== claimedCid) {
    throw new Error("proof metadata cid does not match computed content cid");
  }

  // Proof record's DAG-CBOR CID (NB: proofMetadata here should match what's published,
  // including the `cid` field — we compute the stored record's CID.)
  const proofBytes = dagCbor.encode(args.proofMetadata);
  const proofDigest = await sha256.digest(proofBytes);
  const proofCid = CID.createV1(dagCbor.code, proofDigest);

  const strongRef = {
    $type: "com.atproto.repo.strongRef",
    uri: args.attestationUri,
    cid: proofCid.toString(),
  };

  const existing = Array.isArray(args.record.signatures) ? args.record.signatures : [];
  return { ...args.record, signatures: [...existing, strongRef] };
}
```

## Common mistakes

- **Double-hashing the CID.** `sign(cidBytes, priv)` hashes the 36 bytes with SHA-256 internally; don't pre-hash. (The *message* in ECDSA parlance is `cidBytes`; the digest is an internal implementation detail.)
- **`toDERRawBytes()` instead of `toCompactRawBytes()`.** 70–72 bytes vs 64 bytes — the first is DER, spec requires P1363.
- **Forgetting `{ lowS: true }`.** P-256 defaults may not low-S normalize; pass it explicitly. K-256 low-S is default-on in noble but be explicit.
- **Encoding a record that still has `$bytes` JSON wrappers to DAG-CBOR.** For CID computation this won't happen (we strip metadata `signature` first), but if you're computing CIDs on signed records post-hoc, transmogrify `{$bytes}` → `Uint8Array` first.
- **URL-safe base64.** Use `btoa` / `Buffer.toString("base64")` — both are standard alphabet.
- **Publishing attested record before proof record.** Leaves a dangling strongRef on network hiccup.
- **Using `canonicalize` or `JSON.stringify` as a CID pre-step.** You feed the JS *object* to `dagCbor.encode`, not a string. Stringify never appears.

## See also

- `verifying.md` — verification loop.
- `signatures.md` — ECDSA details.
- `../shared/inline-attestation.md`, `../shared/remote-attestation.md` — language-neutral specs.
- `../rust/creating.md`, `../go/creating.md` — sibling flows for interop.

# TypeScript — verifying attestations

Verification is a loop over `record.signatures`. Each entry is either an inline attestation (signature check) or a remote strongRef (fetch + CID check). This file gives a reference implementation and discusses the resolver plumbing.

## The full verifier

```ts
import * as dagCbor from "@ipld/dag-cbor";
import { CID } from "multiformats/cid";
import { sha256 } from "multiformats/hashes/sha2";
import { p256 } from "@noble/curves/p256";
import { secp256k1 } from "@noble/curves/secp256k1";

const STRONG_REF = "com.atproto.repo.strongRef";

export type Curve = "p256" | "k256";

export interface KeyResolver {
  resolveKey(keyRef: string): Promise<{ curve: Curve; publicKey: Uint8Array }>;
}

export interface RecordResolver {
  resolveRecord(atUri: string): Promise<Record<string, unknown>>;
}

export interface VerifyArgs {
  record: Record<string, unknown>;
  repository: string;
  keyResolver: KeyResolver;
  recordResolver: RecordResolver;
  strictLowS?: boolean;   // default false — match reference behavior
  verifyProofCid?: boolean; // default true — check proof record CID on remote
}

export async function verifyRecord(args: VerifyArgs): Promise<void> {
  const signatures = Array.isArray(args.record.signatures) ? args.record.signatures : [];
  if (signatures.length === 0) return; // no signatures to verify

  for (const entry of signatures) {
    if (!entry || typeof entry !== "object") throw new Error("signature entry must be an object");
    const $type = (entry as { $type?: unknown }).$type;
    if (typeof $type !== "string") throw new Error("signature entry missing $type");

    if ($type === STRONG_REF) {
      await verifyRemoteEntry(entry as RemoteEntry, args);
    } else {
      await verifyInlineEntry(entry as InlineEntry, args);
    }
  }
}

interface InlineEntry {
  $type: string;
  key: string;
  cid: string;
  signature: { $bytes: string };
  [k: string]: unknown;
}

interface RemoteEntry {
  $type: "com.atproto.repo.strongRef";
  uri: string;
  cid: string;
}

async function verifyInlineEntry(entry: InlineEntry, args: VerifyArgs): Promise<void> {
  // Rebuild signing-time metadata: drop cid + signature
  const { cid: claimedCid, signature, ...meta } = entry;
  if (typeof claimedCid !== "string") throw new Error("inline: cid missing");

  const computed = await computeContentCid(args.record, meta as Record<string, unknown>, args.repository);
  if (computed.toString() !== claimedCid) {
    throw new Error(`inline: cid mismatch (claimed=${claimedCid} computed=${computed})`);
  }

  const sigBytesB64 = signature?.$bytes;
  if (typeof sigBytesB64 !== "string") throw new Error("inline: signature.$bytes missing");
  const sigBytes = fromBase64(sigBytesB64);
  if (sigBytes.length !== 64) throw new Error(`inline: signature must be 64 bytes (got ${sigBytes.length})`);

  const { curve, publicKey } = await args.keyResolver.resolveKey(entry.key);
  const lib = curve === "p256" ? p256 : secp256k1;
  const ok = lib.verify(sigBytes, computed.bytes, publicKey, {
    lowS: args.strictLowS ?? false,
  });
  if (!ok) throw new Error("inline: signature verification failed");
}

async function verifyRemoteEntry(entry: RemoteEntry, args: VerifyArgs): Promise<void> {
  // Fetch the proof record
  const proof = await args.recordResolver.resolveRecord(entry.uri);

  // Option: verify the proof record's DAG-CBOR CID matches entry.cid
  if (args.verifyProofCid !== false) {
    const proofBytes = dagCbor.encode(proof);
    const proofDigest = await sha256.digest(proofBytes);
    const proofCid = CID.createV1(dagCbor.code, proofDigest);
    if (proofCid.toString() !== entry.cid) {
      throw new Error(
        `remote: proof record CID mismatch (strongRef=${entry.cid} fetched=${proofCid})`
      );
    }
  }

  // Extract claimed content CID from proof record
  const claimedContentCid = (proof as { cid?: unknown }).cid;
  if (typeof claimedContentCid !== "string") throw new Error("remote: proof record missing cid");

  // Rebuild signing-time metadata: proof record minus its `cid` field
  const { cid: _, ...metaForCid } = proof as Record<string, unknown> & { cid?: unknown };

  const computed = await computeContentCid(
    args.record,
    metaForCid as Record<string, unknown>,
    args.repository
  );
  if (computed.toString() !== claimedContentCid) {
    throw new Error(
      `remote: content CID mismatch (claimed=${claimedContentCid} computed=${computed})`
    );
  }
}
```

## What the reference Rust crate does vs what this adds

The Rust `verify_record` does *not* verify the proof record's CID against the strongRef — it only checks the **content CID** inside the proof record against what it computes. An attacker who controls the resolver could swap the proof record bytes for something with the same content CID inside but different outer bytes, and verification would still pass.

This TS implementation defaults `verifyProofCid` to `true` — it's a one-extra-hash check that closes that hole. Set to `false` only if you want strict byte-compat with the Rust crate's current verify semantics.

## `KeyResolver` implementations

### Plain `did:key:` parser

```ts
import { base58btc } from "multiformats/bases/base58";
import * as varint from "uint8-varint";

export const localKeyResolver: KeyResolver = {
  async resolveKey(keyRef: string) {
    if (!keyRef.startsWith("did:key:")) throw new Error(`not a did:key: ${keyRef}`);
    const multibase = keyRef.slice("did:key:".length);
    const bytes = base58btc.decode(multibase); // first char 'z' is the multibase prefix

    const [code, codeLen] = varint.decode(bytes);
    const keyBytes = bytes.subarray(codeLen);

    if (code === 0x1200) return { curve: "p256" as const, publicKey: keyBytes };
    if (code === 0xe7) return { curve: "k256" as const, publicKey: keyBytes };
    throw new Error(`unsupported did:key multicodec: 0x${code.toString(16)}`);
  },
};
```

`keyBytes` is 33 bytes compressed SEC1 for both curves. `@noble/curves`' `verify` accepts compressed or uncompressed keys transparently.

### DID document lookup

If your attestations reference `did:plc:…#signingKey` or `did:web:example.com#atproto`:

```ts
export class DidResolver implements KeyResolver {
  constructor(private httpClient: typeof fetch) {}

  async resolveKey(keyRef: string): Promise<{ curve: Curve; publicKey: Uint8Array }> {
    const hashIdx = keyRef.indexOf("#");
    if (hashIdx < 0) return localKeyResolver.resolveKey(keyRef); // pure did:key

    const did = keyRef.slice(0, hashIdx);
    const fragment = keyRef.slice(hashIdx + 1);
    const doc = await this.fetchDidDocument(did);

    const vm = doc.verificationMethod?.find((v: { id: string }) =>
      v.id === keyRef || v.id === `#${fragment}`
    );
    if (!vm) throw new Error(`no verification method ${fragment} on ${did}`);

    if (vm.publicKeyMultibase) {
      return localKeyResolver.resolveKey(`did:key:${vm.publicKeyMultibase}`);
    }
    throw new Error("only publicKeyMultibase supported in this resolver");
  }

  private async fetchDidDocument(did: string): Promise<{ verificationMethod?: Array<{ id: string; publicKeyMultibase?: string }> }> {
    // did:plc: -> https://plc.directory/<did>
    // did:web:<host>: -> https://<host>/.well-known/did.json
    // Full resolution belongs in the atproto-identity-resolution skill.
    throw new Error("implement me — see atproto-identity-resolution");
  }
}
```

Cross-reference the `atproto-identity-resolution` skill for the full DID resolution algorithm — this skill stops at "given a DID doc fragment, extract the key".

## `RecordResolver` implementations

### Naive XRPC client

```ts
export class XrpcRecordResolver implements RecordResolver {
  constructor(private pdsFor: (did: string) => Promise<string>) {}

  async resolveRecord(atUri: string): Promise<Record<string, unknown>> {
    const m = atUri.match(/^at:\/\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!m) throw new Error(`invalid AT-URI: ${atUri}`);
    const [, did, collection, rkey] = m;

    const pds = await this.pdsFor(did);
    const url = new URL(`${pds}/xrpc/com.atproto.repo.getRecord`);
    url.searchParams.set("repo", did);
    url.searchParams.set("collection", collection);
    url.searchParams.set("rkey", rkey);

    const res = await fetch(url);
    if (!res.ok) throw new Error(`getRecord ${atUri}: ${res.status}`);
    const body = await res.json();
    return body.value as Record<string, unknown>;
  }
}
```

Note: the PDS-returned record has already been DAG-CBOR-decoded and re-serialized as JSON with `$bytes` / `$link` wrappers for any binary fields. For proof records this doesn't matter (they typically contain only strings); if you ever attach blobs to proof records, you need to transmogrify before encoding.

### Caching

`RecordResolver.resolveRecord` is called once per strongRef per `verifyRecord` call. If you verify many records that share attestors, cache by `atUri`:

```ts
export class CachingResolver implements RecordResolver {
  private cache = new Map<string, Record<string, unknown>>();
  constructor(private inner: RecordResolver) {}
  async resolveRecord(uri: string) {
    let v = this.cache.get(uri);
    if (!v) {
      v = await this.inner.resolveRecord(uri);
      this.cache.set(uri, v);
    }
    return v;
  }
}
```

## Strict vs permissive verification

Reference behavior (matches Rust):

- Accept both low-S and high-S signatures.
- Do not check `issuedAt` freshness.
- Do not check `issuer` authorization.
- Trust `recordResolver` to return the canonical proof record (does not verify its outer CID matches the strongRef's `cid`).

Stricter optional modes this impl supports:

```ts
await verifyRecord({
  record, repository, keyResolver, recordResolver,
  strictLowS: true,    // reject high-S inline signatures
  verifyProofCid: true // verify proof record outer CID (default)
});
```

## Partial verification

`verifyRecord` is all-or-nothing. If you need to verify just one entry, slice the array:

```ts
const only = (record.signatures as Array<Record<string, unknown>>)
  .filter((s) => s.key === targetKey);
await verifyRecord({ ...args, record: { ...record, signatures: only } });
```

The CID is computed with `signatures` stripped, so removing other entries doesn't affect verification.

## Common mistakes

- **Wrong `repository`.** All signatures are bound to the repo the record lives in. If you verify a record fetched from `did:plc:A` with `repository: "did:plc:B"`, every inline signature fails — as designed (replay protection).
- **Assuming `recordResolver` returns the exact byte-for-byte proof record.** It returns the PDS's JSON shape. If your `verifyProofCid: true` check fails, the most common cause is that the PDS re-ordered fields or your JSON-parse → DAG-CBOR-encode path canonicalizes differently. Feed the result through DAG-CBOR and it should re-sort.
- **Forgetting to handle the `no signatures` case.** A record with an empty / missing `signatures` array passes `verifyRecord` trivially (the Rust crate does the same). If your policy needs "at least one attestation", check length explicitly before calling.
- **Handling `RecordResolver` errors as fatal app errors.** A deleted proof record is expected; treat it as "attestation not provable" rather than crashing.
- **Using `p256.verify` without checking signature length first.** Noble throws on malformed signatures; treat 64-byte exact as a precondition.

## See also

- `creating.md` — the inverse flow.
- `signatures.md` — `verify` details.
- `../shared/inline-attestation.md` §Verify, `../shared/remote-attestation.md` §Verify.
- `../rust/verifying.md`, `../go/verifying.md` — sibling flows.

/**
 * Label signature verification, checked against labels signed by a real
 * secp256k1 keypair the same way our labelers sign them (see
 * each labeler's `src/sign.ts`) — so a drift between producer and consumer
 * encoding shows up here rather than as silently-dropped labels in prod.
 */

import { Secp256k1Keypair, formatMultikey } from "@atproto/crypto";
import * as dagCbor from "@ipld/dag-cbor";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DisplayLabel } from "./labels.server.ts";
import {
  labelSignatureBytes,
  resetSigningKeyCache,
  verifyLabel,
  verifyLabels,
} from "./verify.server.ts";

const LABELER_DID = "did:web:claudeslop.example.com";

/** The producer-side encoding, copied from each labeler's `src/sign.ts`. */
function producerSigningBytes(label: {
  ver: number;
  src: string;
  uri: string;
  cid?: string;
  val: string;
  neg?: boolean;
  cts: string;
  exp?: string;
}): Uint8Array {
  const out: Record<string, unknown> = {
    ver: label.ver,
    src: label.src,
    uri: label.uri,
    val: label.val,
    cts: label.cts,
  };
  if (label.cid) out.cid = label.cid;
  if (label.exp) out.exp = label.exp;
  if (label.neg) out.neg = true;
  return dagCbor.encode(out);
}

/** A label as a conforming labeler would hand it to us: every signed field set. */
type UnsignedLabel = Omit<DisplayLabel, "sig" | "cts"> & { cts: string };

async function signAsLabeler(
  keypair: Secp256k1Keypair,
  label: UnsignedLabel,
): Promise<DisplayLabel> {
  const sig = await keypair.sign(
    producerSigningBytes({
      ver: label.ver ?? 1,
      src: label.src,
      uri: label.uri,
      cid: label.cid,
      val: label.val,
      neg: label.neg,
      cts: label.cts,
      exp: label.exp,
    }),
  );
  // Labels arrive over XRPC JSON, where bytes are `{ $bytes: <base64> }`.
  return { ...label, sig: { $bytes: Buffer.from(sig).toString("base64") } };
}

/**
 * Serve a DID document publishing `keypair` as the `#atproto_label` key.
 * Returns the fetch spy so a test can assert how often we re-resolved.
 */
function mockDidDoc(keypair: Secp256k1Keypair, did = LABELER_DID) {
  const multikey = formatMultikey(keypair.jwtAlg, keypair.publicKeyBytes());
  const spy = vi.fn(
    async () =>
      new Response(
        JSON.stringify({
          id: did,
          verificationMethod: [
            {
              id: `${did}#atproto_label`,
              type: "Multikey",
              controller: did,
              publicKeyMultibase: multikey,
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
  );
  vi.stubGlobal("fetch", spy);
  return spy;
}

/** Jump past the forced-re-resolution cooldown in `verify.server.ts`. */
function advancePastRefreshCooldown(): void {
  const now = Date.now();
  vi.spyOn(Date, "now").mockReturnValue(now + 61_000);
}

const baseLabel: UnsignedLabel = {
  ver: 1,
  src: LABELER_DID,
  uri: "at://did:plc:example/site.standard.document/abc123",
  val: "ai-writing",
  cts: "2026-06-24T00:00:00.000Z",
};

describe("verifyLabel", () => {
  let keypair: Secp256k1Keypair;

  beforeEach(async () => {
    resetSigningKeyCache();
    keypair = await Secp256k1Keypair.create({ exportable: true });
    mockDidDoc(keypair);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("accepts a label signed by the labeler's published key", async () => {
    const label = await signAsLabeler(keypair, baseLabel);
    await expect(verifyLabel(label, LABELER_DID)).resolves.toBe(true);
  });

  it("accepts a signed negation", async () => {
    const label = await signAsLabeler(keypair, { ...baseLabel, neg: true });
    await expect(verifyLabel(label, LABELER_DID)).resolves.toBe(true);
  });

  it("accepts a label pinned to a record CID", async () => {
    const label = await signAsLabeler(keypair, {
      ...baseLabel,
      cid: "bafyreigexample",
    });
    await expect(verifyLabel(label, LABELER_DID)).resolves.toBe(true);
  });

  it("rejects a label whose value was tampered with in transit", async () => {
    const label = await signAsLabeler(keypair, baseLabel);
    await expect(
      verifyLabel({ ...label, val: "not-ai" }, LABELER_DID),
    ).resolves.toBe(false);
  });

  it("rejects a label whose subject was swapped for another document", async () => {
    const label = await signAsLabeler(keypair, baseLabel);
    await expect(
      verifyLabel(
        { ...label, uri: "at://did:plc:victim/site.standard.document/xyz" },
        LABELER_DID,
      ),
    ).resolves.toBe(false);
  });

  it("rejects a negation forged onto a positively-signed label", async () => {
    const label = await signAsLabeler(keypair, baseLabel);
    await expect(
      verifyLabel({ ...label, neg: true }, LABELER_DID),
    ).resolves.toBe(false);
  });

  it("rejects a label signed by a different key", async () => {
    const other = await Secp256k1Keypair.create({ exportable: true });
    const label = await signAsLabeler(other, baseLabel);
    await expect(verifyLabel(label, LABELER_DID)).resolves.toBe(false);
  });

  it("rejects a label carrying no signature at all", async () => {
    await expect(
      verifyLabel(baseLabel as DisplayLabel, LABELER_DID),
    ).resolves.toBe(false);
  });

  it("rejects a label attributed to a different labeler than the one queried", async () => {
    const label = await signAsLabeler(keypair, {
      ...baseLabel,
      src: "did:web:someone-else.example.com",
    });
    await expect(verifyLabel(label, LABELER_DID)).resolves.toBe(false);
  });

  it("rejects when the DID document publishes no #atproto_label key", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ id: LABELER_DID, verificationMethod: [] }),
            {
              status: 200,
            },
          ),
      ),
    );
    resetSigningKeyCache();
    const label = await signAsLabeler(keypair, baseLabel);
    await expect(verifyLabel(label, LABELER_DID)).resolves.toBe(false);
  });

  it("rejects when the DID document cannot be resolved", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 404 })),
    );
    resetSigningKeyCache();
    const label = await signAsLabeler(keypair, baseLabel);
    await expect(verifyLabel(label, LABELER_DID)).resolves.toBe(false);
  });

  it("picks up a rotated key without needing a restart", async () => {
    // Cache the old key by verifying against it first.
    const oldLabel = await signAsLabeler(keypair, baseLabel);
    await expect(verifyLabel(oldLabel, LABELER_DID)).resolves.toBe(true);

    // The labeler rotates its signing key and republishes its DID document.
    const rotated = await Secp256k1Keypair.create({ exportable: true });
    mockDidDoc(rotated);
    const newLabel = await signAsLabeler(rotated, baseLabel);

    // The stale cached key fails, so we re-resolve and accept — but only once
    // the cooldown has passed, so a rotation is picked up in bounded time
    // rather than instantly.
    advancePastRefreshCooldown();
    await expect(verifyLabel(newLabel, LABELER_DID)).resolves.toBe(true);
  });

  it("does not re-resolve the DID document once per bad label", async () => {
    const spy = mockDidDoc(keypair);
    const forger = await Secp256k1Keypair.create({ exportable: true });
    const junk = await Promise.all(
      Array.from({ length: 25 }, (_, i) =>
        signAsLabeler(forger, {
          ...baseLabel,
          uri: `at://did:plc:example/site.standard.document/${i}`,
        }),
      ),
    );

    const { rejected } = await verifyLabels(junk, LABELER_DID);

    expect(rejected).toBe(25);
    // One initial resolution plus at most one forced re-resolution inside the
    // cooldown — not one fetch per label.
    expect(spy.mock.calls.length).toBeLessThanOrEqual(2);
  });
});

describe("verifyLabels", () => {
  let keypair: Secp256k1Keypair;

  beforeEach(async () => {
    resetSigningKeyCache();
    keypair = await Secp256k1Keypair.create({ exportable: true });
    mockDidDoc(keypair);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("keeps the good labels and counts the bad ones", async () => {
    const good = await signAsLabeler(keypair, baseLabel);
    const alsoGood = await signAsLabeler(keypair, {
      ...baseLabel,
      uri: "at://did:plc:example/site.standard.document/second",
    });
    const forged = await signAsLabeler(
      await Secp256k1Keypair.create({ exportable: true }),
      {
        ...baseLabel,
        uri: "at://did:plc:example/site.standard.document/third",
      },
    );

    const { verified, rejected } = await verifyLabels(
      [good, forged, alsoGood],
      LABELER_DID,
    );

    expect(verified.map((l) => l.uri)).toEqual([good.uri, alsoGood.uri]);
    expect(rejected).toBe(1);
  });

  it("rejects everything when the labeler serves unsigned labels", async () => {
    const { verified, rejected } = await verifyLabels(
      [baseLabel as DisplayLabel, baseLabel as DisplayLabel],
      LABELER_DID,
    );
    expect(verified).toEqual([]);
    expect(rejected).toBe(2);
  });
});

describe("labelSignatureBytes", () => {
  it("decodes the XRPC JSON `$bytes` form", () => {
    const raw = new Uint8Array([1, 2, 3, 4]);
    const label = {
      ...baseLabel,
      sig: { $bytes: Buffer.from(raw).toString("base64") },
    } as DisplayLabel;
    expect(labelSignatureBytes(label)).toEqual(raw);
  });

  it("passes raw bytes through (the firehose form)", () => {
    const raw = new Uint8Array([9, 8, 7]);
    expect(
      labelSignatureBytes({ ...baseLabel, sig: raw } as DisplayLabel),
    ).toEqual(raw);
  });

  it("returns null when there is no signature", () => {
    expect(labelSignatureBytes(baseLabel as DisplayLabel)).toBeNull();
  });
});

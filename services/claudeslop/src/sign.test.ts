import { Secp256k1Keypair } from "@atproto/crypto";
import { describe, expect, it } from "vitest";

import type { UnsignedLabel } from "./db.ts";
import { keypairDidKey, signLabel, verifyLabel } from "./sign.ts";

const unsigned: UnsignedLabel = {
  ver: 1,
  src: "did:web:claudeslop.standard-reader.app",
  uri: "at://did:plc:example/site.standard.document/abc123",
  cid: "bafyreigexample",
  val: "ai-writing",
  cts: "2026-06-24T00:00:00.000Z",
};

describe("signLabel / verifyLabel", () => {
  it("produces a signature that verifies against the signer's did:key", async () => {
    const keypair = await Secp256k1Keypair.create({ exportable: true });
    const signed = await signLabel(keypair, unsigned);

    expect(signed.sig).toBeInstanceOf(Uint8Array);
    expect(signed.sig.length).toBeGreaterThan(0);
    await expect(verifyLabel(signed, keypairDidKey(keypair))).resolves.toBe(true);
  });

  it("rejects a tampered label", async () => {
    const keypair = await Secp256k1Keypair.create({ exportable: true });
    const signed = await signLabel(keypair, unsigned);
    const tampered = { ...signed, val: "not-ai" };

    await expect(verifyLabel(tampered, keypairDidKey(keypair))).resolves.toBe(false);
  });

  it("rejects a signature from a different key", async () => {
    const signer = await Secp256k1Keypair.create({ exportable: true });
    const other = await Secp256k1Keypair.create({ exportable: true });
    const signed = await signLabel(signer, unsigned);

    await expect(verifyLabel(signed, keypairDidKey(other))).resolves.toBe(false);
  });
});

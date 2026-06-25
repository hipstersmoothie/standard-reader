/**
 * Label signing & verification.
 *
 * AT Protocol labels are signed so that anyone can verify a label genuinely
 * came from the labeler that claims it. The signature covers the dag-cbor
 * encoding of the label *without* its `sig` field; consumers re-encode the same
 * bytes, look up the labeler's public key from its DID document
 * (`#atproto_label` verification method), and check the signature.
 *
 * We use secp256k1 (the most common atproto key type) via `@atproto/crypto`.
 */

import { Secp256k1Keypair, formatMultikey, verifySignature } from "@atproto/crypto";
import * as dagCbor from "@ipld/dag-cbor";

import type { SignedLabel, UnsignedLabel } from "./db.ts";

/** Drop undefined fields and `neg: false` so the signed bytes are canonical. */
function canonicalUnsigned(label: UnsignedLabel): Record<string, unknown> {
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
  return out;
}

/** The bytes that get signed: canonical dag-cbor of the unsigned label. */
export function labelSigningBytes(label: UnsignedLabel): Uint8Array {
  // dag-cbor sorts map keys deterministically, so field insertion order here
  // does not matter — encoder and verifier always agree.
  return dagCbor.encode(canonicalUnsigned(label));
}

export async function loadKeypair(privateKeyHex: string): Promise<Secp256k1Keypair> {
  return Secp256k1Keypair.import(privateKeyHex);
}

export async function signLabel(
  keypair: Secp256k1Keypair,
  unsigned: UnsignedLabel,
): Promise<SignedLabel> {
  const sig = await keypair.sign(labelSigningBytes(unsigned));
  return { ...unsigned, sig };
}

/**
 * The `did:key` form of a labeler's signing key. This is what
 * `formatDidKey`/`verifySignature` expect, and what a DID document's
 * `#atproto_label` `publicKeyMultibase` decodes to.
 */
export function keypairDidKey(keypair: Secp256k1Keypair): string {
  return keypair.did();
}

/** The multibase string published as `publicKeyMultibase` in the DID document. */
export function keypairMultikey(keypair: Secp256k1Keypair): string {
  return formatMultikey(keypair.jwtAlg, keypair.publicKeyBytes());
}

/** Verify a label against a signer's `did:key`. Used in tests and by consumers. */
export async function verifyLabel(
  label: SignedLabel,
  signerDidKey: string,
): Promise<boolean> {
  const { sig, ...unsigned } = label;
  return verifySignature(signerDidKey, labelSigningBytes(unsigned), sig);
}

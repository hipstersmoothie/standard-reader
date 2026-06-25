/**
 * Generate a secp256k1 signing keypair for the labeler.
 *
 *   pnpm gen-key
 *
 * Put the printed private key in `LABELER_SIGNING_KEY`. The public did:key /
 * multikey is derived from it automatically and published in the DID document —
 * you don't need to save those, they're shown for reference.
 */

import { Secp256k1Keypair, formatMultikey } from "@atproto/crypto";

const keypair = await Secp256k1Keypair.create({ exportable: true });
const privateKey = Buffer.from(await keypair.export()).toString("hex");
const multikey = formatMultikey(keypair.jwtAlg, keypair.publicKeyBytes());

console.log("LABELER_SIGNING_KEY=" + privateKey);
console.log("");
console.log("# derived (for reference — published automatically in did.json):");
console.log("# did:key            " + keypair.did());
console.log("# publicKeyMultibase " + multikey);

/**
 * Credentials for KOReader's progress sync.
 *
 * kosync predates every modern auth story: a device sends `x-auth-user` and
 * `x-auth-key` on each request, where the key is the MD5 of a password the
 * reader typed. There is no OAuth in it, no refresh, no scopes — and KOReader
 * stores the key on the device in the clear.
 *
 * So this does not reuse the reader's AT Proto identity in any form that could
 * be replayed elsewhere. The sync key is *derived* — an HMAC of the reader's
 * DID and a per-reader salt, under a server secret — which means:
 *
 *  - the key itself is never stored, so there is nothing to leak from the DB;
 *  - it grants exactly one capability, reading and writing that reader's
 *    KOReader positions, and nothing else in the app;
 *  - rotating is a single column write (`user.kosync_key_salt`), and the old
 *    key stops working the moment it lands.
 *
 * A `null` salt derives the pre-rotation key, so readers already syncing when
 * rotation shipped keep working without touching anything.
 */

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

function secret(): string {
  const value = process.env.KOSYNC_SECRET;
  if (value) return value;
  // Same shape as `digestConfig.unsubscribeSecret`: a dev placeholder so the
  // feature works locally, and a hard failure in production rather than a
  // silently guessable key.
  if (process.env.NODE_ENV !== "production") return "dev-kosync-secret";
  throw new Error("KOSYNC_SECRET is not set");
}

/** A fresh salt. Random rather than a counter, so rotating is unguessable. */
export function newKosyncSalt(): string {
  return randomBytes(16).toString("base64url");
}

/**
 * The sync key a reader types into KOReader's "Password" field.
 *
 * Base32-ish over an HMAC, cut to 20 characters: long enough to be
 * unguessable, short enough to be typed on an e-reader's on-screen keyboard,
 * and free of the characters that look alike on an e-ink screen.
 */
export function kosyncKeyForDid(did: string, salt: string | null): string {
  const digest = createHmac("sha256", secret())
    .update(salt ? `kosync:${did}:${salt}` : `kosync:${did}`)
    .digest();
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let key = "";
  for (let index = 0; index < 20; index += 1) {
    key += alphabet[(digest[index] ?? 0) % alphabet.length];
  }
  return key;
}

/** What KOReader sends as `x-auth-key`: the MD5 of the typed password. */
export function kosyncAuthKeyForDid(did: string, salt: string | null): string {
  return createHash("md5").update(kosyncKeyForDid(did, salt)).digest("hex");
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** The reader a kosync username resolves to, with the salt their key uses. */
export interface KosyncReader {
  did: string;
  salt: string | null;
}

/**
 * Verify a request's kosync headers and return the reader's DID.
 *
 * `resolveUsername` turns whatever the reader typed as their username into a
 * DID and salt — they may have typed a handle, which is what the settings page
 * shows.
 */
export async function authenticateKosync(
  request: Request,
  resolveUsername: (username: string) => Promise<KosyncReader | null>,
): Promise<string | null> {
  const username = request.headers.get("x-auth-user")?.trim();
  const key = request.headers.get("x-auth-key")?.trim().toLowerCase();
  if (!username || !key) return null;

  const reader = await resolveUsername(username);
  if (!reader) return null;

  return constantTimeEquals(key, kosyncAuthKeyForDid(reader.did, reader.salt))
    ? reader.did
    : null;
}

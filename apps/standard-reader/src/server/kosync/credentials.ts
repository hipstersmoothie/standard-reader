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
 * DID under a server secret — which means:
 *
 *  - nothing new is stored: no credentials table, no rotation bookkeeping;
 *  - the key grants exactly one capability, reading and writing that reader's
 *    KOReader positions, and nothing else in the app;
 *  - a leaked key is contained, and every key can be invalidated at once by
 *    rotating `KOSYNC_SECRET`.
 *
 * The trade is that a single key cannot be revoked on its own. For a
 * position-sync credential that is the right trade — but it is a trade, and it
 * is why the key must never become a general-purpose token.
 */

import { createHash, createHmac, timingSafeEqual } from "node:crypto";

function secret(): string {
  const value = process.env.KOSYNC_SECRET;
  if (value) return value;
  // Same shape as `digestConfig.unsubscribeSecret`: a dev placeholder so the
  // feature works locally, and a hard failure in production rather than a
  // silently guessable key.
  if (process.env.NODE_ENV !== "production") return "dev-kosync-secret";
  throw new Error("KOSYNC_SECRET is not set");
}

/**
 * The sync key a reader types into KOReader's "Password" field.
 *
 * Base32-ish over an HMAC, cut to 20 characters: long enough to be
 * unguessable, short enough to be typed on an e-reader's on-screen keyboard,
 * and free of the characters that look alike on an e-ink screen.
 */
export function kosyncKeyForDid(did: string): string {
  const digest = createHmac("sha256", secret())
    .update(`kosync:${did}`)
    .digest();
  const alphabet = "abcdefghjkmnpqrstuvwxyz23456789";
  let key = "";
  for (let index = 0; index < 20; index += 1) {
    key += alphabet[(digest[index] ?? 0) % alphabet.length];
  }
  return key;
}

/** What KOReader sends as `x-auth-key`: the MD5 of the typed password. */
export function kosyncAuthKeyForDid(did: string): string {
  return createHash("md5").update(kosyncKeyForDid(did)).digest("hex");
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Verify a request's kosync headers and return the reader's DID.
 *
 * `resolveUsername` turns whatever the reader typed as their username into a
 * DID — they may have typed a handle, which is what the settings page shows.
 */
export async function authenticateKosync(
  request: Request,
  resolveUsername: (username: string) => Promise<string | null>,
): Promise<string | null> {
  const username = request.headers.get("x-auth-user")?.trim();
  const key = request.headers.get("x-auth-key")?.trim().toLowerCase();
  if (!username || !key) return null;

  const did = await resolveUsername(username);
  if (!did) return null;

  return constantTimeEquals(key, kosyncAuthKeyForDid(did)) ? did : null;
}

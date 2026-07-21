/**
 * Signed, stateless unsubscribe tokens for the weekly digest. A token is
 * `<userId>.<hmac>` where the HMAC is over `userId` keyed by
 * `DIGEST_UNSUBSCRIBE_SECRET`. This lets the one-click unsubscribe route flip
 * `weeklyDigestEnabled` off without the recipient being logged in, while making
 * the link unforgeable.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import { digestConfig } from "./config";

function sign(userId: string, secret: string): string {
  return createHmac("sha256", secret).update(userId).digest("base64url");
}

/** Build the `<userId>.<hmac>` token embedded in each digest's unsubscribe link. */
export function makeUnsubscribeToken(userId: string): string {
  return `${userId}.${sign(userId, digestConfig.unsubscribeSecret)}`;
}

/**
 * Verify a token and return the `userId` it authorizes, or `null` if the
 * signature doesn't match. Constant-time comparison.
 */
export function verifyUnsubscribeToken(token: string): string | null {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return null;
  const userId = token.slice(0, dot);
  const provided = token.slice(dot + 1);
  const expected = sign(userId, digestConfig.unsubscribeSecret);

  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? userId : null;
}

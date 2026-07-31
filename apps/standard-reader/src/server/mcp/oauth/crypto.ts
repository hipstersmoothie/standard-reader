import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Base64url of 32 random bytes — the shape of every secret we mint. */
export function randomToken(): string {
  return randomBytes(32).toString("base64url");
}

/**
 * Hash a bearer secret for storage and lookup.
 *
 * Plain SHA-256 rather than a password KDF on purpose: these are 256-bit
 * random tokens, not user-chosen passwords, so there is no dictionary to
 * stretch against, and the lookup is on the hot path of every `/mcp` request.
 */
export function hashToken(value: string): string {
  return createHash("sha256").update(value).digest("base64url");
}

/** Constant-time compare of two secrets that are already known to be strings. */
export function secretsMatch(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/** Verify an RFC 7636 `S256` PKCE challenge. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return secretsMatch(computed, challenge);
}

/** Normalize and validate a requested scope string against what we support. */
export function narrowScope(
  requested: string | null | undefined,
  supported: ReadonlyArray<string>,
  fallback: string,
): { scope: string; unsupported: Array<string> } {
  const tokens = (requested ?? "").split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return { scope: fallback, unsupported: [] };
  const unsupported = tokens.filter((token) => !supported.includes(token));
  const granted = tokens.filter((token) => supported.includes(token));
  return { scope: granted.join(" "), unsupported };
}

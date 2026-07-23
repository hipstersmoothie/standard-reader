import { timingSafeEqual } from "node:crypto";

import { ingestConfig } from "./config.ts";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

/**
 * Verify an incoming ingestion request against the shared secret. Accepts the
 * HTTP Basic credential tap sends (`admin:<password>`) or a `Bearer <secret>`
 * token. When no secret is configured, requests are allowed only in non-prod
 * (local dev convenience); in production the gate fails closed.
 */
export function verifyIngestAuth(request: Request): boolean {
  const secret = ingestConfig.webhookSecret;
  if (!secret) {
    // Fail closed in production: a missing secret must never disable auth.
    return process.env.NODE_ENV !== "production";
  }
  const header = request.headers.get("authorization");
  if (!header) {
    return false;
  }
  if (header.startsWith("Basic ")) {
    const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
    const idx = decoded.indexOf(":");
    const password = idx === -1 ? decoded : decoded.slice(idx + 1);
    return safeEqual(password, secret);
  }
  if (header.startsWith("Bearer ")) {
    return safeEqual(header.slice(7), secret);
  }
  return false;
}

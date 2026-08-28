/**
 * Pure helpers for the Resend webhook receiver (see routes/api.resend-webhook).
 * Resend signs webhooks with Svix; we both verify the signature and map the
 * provider payload onto our event vocabulary here so the route handler stays a
 * thin transport shell and the logic is unit-testable.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

import type { NewsletterEventType } from "@standard-reader/db/schema";

const TYPE_MAP: Record<string, NewsletterEventType> = {
  "email.delivered": "delivered",
  "email.opened": "opened",
  "email.clicked": "clicked",
  "email.bounced": "bounced",
  "email.complained": "complained",
};

export interface ResendEvent {
  type?: string;
  data?: {
    email_id?: string;
    to?: string | Array<string>;
    click?: { link?: string };
  };
}

export interface MappedWebhookEvent {
  messageId: string;
  recipient: string;
  type: NewsletterEventType;
  url?: string;
}

/**
 * Map a Resend webhook payload onto a `newsletter_send_events` row's fields.
 * Returns null for events we don't track or that lack the id/recipient we need
 * to correlate back to a send.
 */
export function mapResendEvent(
  payload: ResendEvent,
): MappedWebhookEvent | null {
  const type = payload.type ? TYPE_MAP[payload.type] : undefined;
  const messageId = payload.data?.email_id;
  const to = Array.isArray(payload.data?.to)
    ? payload.data?.to[0]
    : payload.data?.to;

  if (!type || !messageId || !to) return null;

  return {
    messageId,
    recipient: to,
    type,
    url: payload.data?.click?.link,
  };
}

export interface SvixHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

/** Read the three Svix signing headers off a request. */
export function svixHeaders(headers: Headers): SvixHeaders {
  return {
    id: headers.get("svix-id"),
    timestamp: headers.get("svix-timestamp"),
    signature: headers.get("svix-signature"),
  };
}

/** Tolerance for the signed timestamp, matching Svix's default (5 minutes). */
export const SVIX_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Verify a Svix-signed webhook (Resend's scheme). The signing secret is the
 * `whsec_...` value from the Resend dashboard; `now` is injectable so the
 * timestamp-tolerance check is testable. Constant-time compares each candidate
 * signature. Returns false on any missing/malformed input.
 */
export function verifyResendSignature(input: {
  secret: string;
  headers: SvixHeaders;
  body: string;
  now?: number;
  toleranceMs?: number;
}): boolean {
  const { secret, headers, body } = input;
  const { id, timestamp, signature } = headers;
  if (!secret || !id || !timestamp || !signature) return false;

  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = input.now ?? Date.now();
  const tolerance = input.toleranceMs ?? SVIX_TOLERANCE_MS;
  if (Math.abs(now - ts * 1000) > tolerance) return false;

  const secretBytes = secret.startsWith("whsec_")
    ? Buffer.from(secret.slice("whsec_".length), "base64")
    : Buffer.from(secret, "base64");

  const expected = createHmac("sha256", secretBytes)
    .update(`${id}.${timestamp}.${body}`)
    .digest();

  // The header is a space-separated list of `version,base64signature` pairs.
  for (const part of signature.split(" ")) {
    const comma = part.indexOf(",");
    if (comma === -1) continue;
    const candidate = Buffer.from(part.slice(comma + 1), "base64");
    if (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    ) {
      return true;
    }
  }
  return false;
}

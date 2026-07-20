import { trace } from "@opentelemetry/api";

import type { Span } from "./log.ts";

/** Attach signed-in reader identity to a log span when available.
 *
 * Uses the DB-only DID lookup (`getReaderDidForRequest`) instead of the full
 * `getAtprotoSessionForRequest`, which restores the PDS client and incurs a
 * network round trip. Span labeling only needs the DID; any handler that
 * actually needs the PDS client restores it explicitly. */
export async function attachReaderSpanContext(
  span: Span,
  request: Request,
): Promise<string | null> {
  const { getReaderDidForRequest } =
    await import("#/middleware/auth-session.server");
  const did = (await getReaderDidForRequest(request)) ?? null;
  span.set("signedIn", did != null);
  if (did) {
    span.set("did", did);
  }
  return did;
}

/**
 * Label the active span — normally the auto-instrumented HTTP server span — with
 * reader identity.
 *
 * Handlers wrapped in `observe()` get identity via `attachReaderSpanContext`,
 * but that only covers server functions. This covers the request span itself,
 * so SSR document loads (which no `observe()` wrapper ever sees) can still be
 * split by auth state. Without it, logged-out page views are indistinguishable
 * from signed-in ones at the request level.
 *
 * Safe to call when no span is active — it no-ops.
 */
export function labelRequestSpanIdentity(did: string | null): void {
  const span = trace.getActiveSpan();
  if (!span) {
    return;
  }
  span.setAttribute("signedIn", did != null);
  if (did) {
    span.setAttribute("did", did);
  }
}

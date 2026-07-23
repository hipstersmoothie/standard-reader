/**
 * HappyView transport + result handling. The request itself is built purely in
 * `request.ts`; this module executes it and parses the XRPC envelope.
 *
 * Two transports:
 * - `bearerTransport` — plain fetch; Authorization/X-Client-Key are already on
 *   the request (space credentials, cross-service reads).
 * - `dpopTransport` — for `needsDpop` requests, delegates to a DPoP-signing
 *   fetch (an atcute OAuth session bound to the acting user), which adds the
 *   Authorization + DPoP headers with `htu` = the HappyView URL.
 *
 * NOTE: the DPoP wiring against HappyView is exercised only against a live
 * instance (see docs/happyview-runbook.md); it can't be verified from the build
 * sandbox. The request shaping it depends on is unit-tested.
 */

import type { HappyViewRequest } from "./request";

/** A DPoP-signing fetch (typically an atcute OAuth session handler). */
export type DpopFetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<Response>;

export interface SpaceTransport {
  execute(req: HappyViewRequest): Promise<Response>;
}

/** Transport for Bearer / unauthenticated-header requests. */
export function bearerTransport(): SpaceTransport {
  return {
    execute: (req) =>
      fetch(req.url, {
        method: req.method,
        headers: req.headers,
        body: req.body,
      }),
  };
}

/** Transport that DPoP-signs requests flagged `needsDpop`, else plain fetch. */
export function dpopTransport(dpopFetch: DpopFetch): SpaceTransport {
  return {
    execute: (req) => {
      const init = {
        method: req.method,
        headers: req.headers,
        body: req.body,
      };
      return req.needsDpop ? dpopFetch(req.url, init) : fetch(req.url, init);
    },
  };
}

export class HappyViewError extends Error {
  constructor(
    readonly status: number,
    readonly code: string | undefined,
    message: string,
  ) {
    super(message);
    this.name = "HappyViewError";
  }
}

/** Execute a built request and parse the JSON body, throwing on non-2xx. */
export async function callHappyView<T>(
  transport: SpaceTransport,
  req: HappyViewRequest,
): Promise<T> {
  const res = await transport.execute(req);
  const text = await res.text();
  if (!res.ok) {
    let code: string | undefined;
    let message = text;
    try {
      const parsed = JSON.parse(text) as { error?: string; message?: string };
      code = parsed.error;
      message = parsed.message ?? parsed.error ?? text;
    } catch {
      // non-JSON error body; keep the raw text
    }
    throw new HappyViewError(res.status, code, message || res.statusText);
  }
  return (text ? JSON.parse(text) : {}) as T;
}

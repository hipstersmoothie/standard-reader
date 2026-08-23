/**
 * Pure request-shaping for HappyView's space XRPC. Kept separate from the
 * transport so the URL/header/body construction is unit-testable without a live
 * instance. The DPoP path only *marks* that Authorization + DPoP must be added
 * by the signing transport (the atcute OAuth session); the Bearer path (space
 * credentials, cross-service reads) is self-contained.
 */

import type { HappyViewConfig } from "./config";

export type SpaceAuthMode =
  | { kind: "dpop" }
  | { kind: "bearer"; credential: string };

export interface HappyViewRequest {
  url: string;
  method: "GET" | "POST";
  headers: Record<string, string>;
  body?: string;
  /** When true, the transport must DPoP-sign (adds Authorization + DPoP). */
  needsDpop: boolean;
}

export type QueryParams = Record<
  string,
  string | number | boolean | undefined | null
>;

function queryString(params: QueryParams): string {
  const usp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    usp.set(key, String(value));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

/**
 * Build a HappyView XRPC request. `X-Client-Key` is always attached; for
 * server-to-server calls set `includeSecret` to also send `X-Client-Secret`.
 */
export function buildHappyViewRequest(input: {
  config: HappyViewConfig;
  nsid: string;
  method: "GET" | "POST";
  params?: QueryParams;
  body?: unknown;
  auth: SpaceAuthMode;
  includeSecret?: boolean;
}): HappyViewRequest {
  const { config, nsid, method, params, body, auth, includeSecret } = input;

  const headers: Record<string, string> = {
    "x-client-key": config.clientKey,
  };
  if (includeSecret && config.clientSecret) {
    headers["x-client-secret"] = config.clientSecret;
  }
  if (auth.kind === "bearer") {
    headers.authorization = `Bearer ${auth.credential}`;
  }

  let serialized: string | undefined;
  if (method === "POST" && body !== undefined) {
    headers["content-type"] = "application/json";
    serialized = JSON.stringify(body);
  }

  const url =
    `${config.url}/xrpc/${nsid}` + (params ? queryString(params) : "");

  return {
    url,
    method,
    headers,
    body: serialized,
    needsDpop: auth.kind === "dpop",
  };
}

import { getPublicUrlClient } from "#/lib/public-url";

/** Fragment id on did:web for the AppView XRPC service. */
export const APPVIEW_SERVICE_ID = "standard_reader_appview";

/**
 * Client-side mirror of `appviewDid()` in `#/server/xrpc/config`.
 *
 * The host keeps its dots: colons in a `did:web` encode path segments, not the
 * hostname separator. Keep the two in lockstep — the docs page renders this
 * value as the DID callers paste into `atproto-proxy`.
 */
export function appviewDidClient(): string {
  const host = new URL(getPublicUrlClient()).hostname;
  return `did:web:${host}`;
}

export function xrpcBaseUrlClient(): string {
  return `${getPublicUrlClient()}/xrpc`;
}

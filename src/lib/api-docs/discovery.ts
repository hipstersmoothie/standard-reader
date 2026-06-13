import { getPublicUrlClient } from "#/lib/public-url";

/** Fragment id on did:web for the AppView XRPC service. */
export const APPVIEW_SERVICE_ID = "standard_reader_appview";

export function appviewDidClient(): string {
  const host = new URL(getPublicUrlClient()).hostname.replaceAll(".", ":");
  return `did:web:${host}`;
}

export function xrpcBaseUrlClient(): string {
  return `${getPublicUrlClient()}/xrpc`;
}

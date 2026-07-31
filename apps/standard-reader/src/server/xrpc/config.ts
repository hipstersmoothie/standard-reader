import { getPublicUrl } from "#/lib/public-url";

/** Fragment id on did:web:standard-reader.app for the AppView XRPC service. */
export const APPVIEW_SERVICE_ID = "standard_reader_appview";

export function appviewDid(): string {
  const host = new URL(getPublicUrl()).hostname.replaceAll(".", ":");
  return `did:web:${host}`;
}

export function appviewAudience(): string {
  return `${appviewDid()}#${APPVIEW_SERVICE_ID}`;
}

export function xrpcBaseUrl(): string {
  return `${getPublicUrl()}/xrpc`;
}

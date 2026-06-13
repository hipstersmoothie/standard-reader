import type { XrpcAuthContext } from "../auth";
import type { XrpcRequestContext } from "../types";

export function mockXrpcContext(
  partial: Partial<XrpcRequestContext> = {},
): XrpcRequestContext {
  return {
    request: new Request("http://127.0.0.1:3000/xrpc/app.standard-reader.test"),
    auth: null,
    db: {} as XrpcRequestContext["db"],
    schema: {} as XrpcRequestContext["schema"],
    trackReadingEnabled: false,
    params: {},
    body: null,
    ...partial,
  };
}

export function mockAuth(
  overrides: Partial<XrpcAuthContext> = {},
): XrpcAuthContext {
  return {
    did: "did:plc:testreader" as XrpcAuthContext["did"],
    client: null,
    scopes: [],
    via: "accessToken",
    ...overrides,
  };
}

export function xrpcQueryRequest(
  nsid: string,
  params: Record<string, string> = {},
): Request {
  const url = new URL(`http://127.0.0.1:3000/xrpc/${nsid}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  return new Request(url.toString(), { method: "GET" });
}

export function xrpcProcedureRequest(
  nsid: string,
  body: unknown,
  headers?: HeadersInit,
): Request {
  return new Request(`http://127.0.0.1:3000/xrpc/${nsid}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}

export async function readJsonBody<T = unknown>(
  response: Response,
): Promise<T> {
  return (await response.json()) as T;
}

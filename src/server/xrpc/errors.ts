import {
  AuthRequiredError,
  ForbiddenError,
  InvalidRequestError,
  XRPCError,
} from "@atproto/xrpc-server";

export { AuthRequiredError, ForbiddenError, InvalidRequestError, XRPCError };

export function xrpcJsonResponse(
  body: unknown,
  status = 200,
  extraHeaders?: HeadersInit,
): Response {
  const headers = new Headers(extraHeaders);
  headers.set("Content-Type", "application/json");
  headers.set("Access-Control-Allow-Origin", "*");
  return new Response(JSON.stringify(body), { status, headers });
}

export function xrpcErrorResponse(error: XRPCError): Response {
  const headers = new Headers({
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
  });
  if (error.statusCode === 401) {
    headers.set(
      "WWW-Authenticate",
      'Bearer realm="atproto", error="invalid_token"',
    );
  }
  return new Response(JSON.stringify(error.payload), {
    status: error.statusCode,
    headers,
  });
}

export function handleXrpcError(cause: unknown): Response {
  if (cause instanceof XRPCError) {
    return xrpcErrorResponse(cause);
  }
  if (cause instanceof Error) {
    return xrpcErrorResponse(new InvalidRequestError(cause.message));
  }
  return xrpcErrorResponse(new InvalidRequestError("Invalid request"));
}

import type { AtprotoSessionContext } from "#/middleware/auth-session.server";

import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";

export function readSessionTokenFromRequest(
  request: Request,
): string | undefined {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split("; ")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    const name = pair.slice(0, eqIdx);
    if (name === AUTH_SESSION_TOKEN_COOKIE) {
      return pair.slice(eqIdx + 1);
    }
  }
  return undefined;
}

export async function getExtensionSession(
  request: Request,
): Promise<AtprotoSessionContext | undefined> {
  return getAtprotoSessionForRequest(request);
}

export function unauthorizedResponse(): Response {
  return Response.json(
    {
      error: "unauthorized",
      loginUrl: "/login?redirect=/extension/connected",
    },
    { status: 401 },
  );
}

export function badRequestResponse(message: string): Response {
  return Response.json({ error: message }, { status: 400 });
}

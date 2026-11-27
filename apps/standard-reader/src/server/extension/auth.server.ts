import { eq } from "drizzle-orm";

import type { db as dbClient } from "#/db/index.server";
import type * as schemaModule from "#/db/schema";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";
import {
  dbValueToOpenLinksExternally,
  OPEN_LINKS_COOKIE,
  parseOpenLinksExternally,
} from "#/lib/open-links";
import type { AtprotoSessionContext } from "#/middleware/auth-session.server";
import { getAtprotoSessionForRequest } from "#/middleware/auth-session.server";

import { readCookieFromRequest } from "./reader-view";

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

/**
 * The reader's "open links on the original site" preference, resolved the same
 * way as `getOpenLinksPreference`: the account column when signed in, else the
 * cookie (the extension's requests carry the app's cookies).
 */
export async function getExtensionOpenLinksExternally(
  db: typeof dbClient,
  schema: typeof schemaModule,
  session: AtprotoSessionContext | undefined,
  request: Request,
): Promise<boolean> {
  const userId = session?.session.user.id;
  if (userId) {
    const row = await db.query.user.findFirst({
      where: eq(schema.user.id, userId),
      columns: { openLinksExternally: true },
    });
    return dbValueToOpenLinksExternally(row?.openLinksExternally ?? null);
  }
  return parseOpenLinksExternally(
    readCookieFromRequest(request, OPEN_LINKS_COOKIE),
  );
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

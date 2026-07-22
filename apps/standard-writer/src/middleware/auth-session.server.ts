import { eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";

export interface WriterSession {
  userId: string;
  did: string | null;
  name: string;
  image: string | null;
}

function readSessionTokenCookie(
  cookieHeader: string | null,
): string | undefined {
  if (!cookieHeader) return undefined;
  for (const pair of cookieHeader.split("; ")) {
    const eqIdx = pair.indexOf("=");
    if (eqIdx === -1) continue;
    if (pair.slice(0, eqIdx) === AUTH_SESSION_TOKEN_COOKIE) {
      return pair.slice(eqIdx + 1);
    }
  }
  return undefined;
}

/**
 * Resolve the signed-in writer from the request's session cookie. Reads the
 * opaque session token, looks up the (non-expired) `session` row, and returns
 * the owning user. The DID is always read from the `user` row, never trusted
 * from the client. Returns `null` for guests.
 */
export async function getWriterSession(
  request: Request,
): Promise<WriterSession | null> {
  const token = readSessionTokenCookie(request.headers.get("cookie"));
  if (!token) return null;

  const row = await db.query.session.findFirst({
    where: eq(schema.session.token, token),
    with: { user: true },
  });
  if (!row || row.expiresAt.getTime() <= Date.now()) return null;

  const { user } = row;
  return {
    userId: user.id,
    did: user.did,
    name: user.name,
    image: user.image,
  };
}

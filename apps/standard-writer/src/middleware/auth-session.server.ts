import { eq } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { AUTH_SESSION_TOKEN_COOKIE } from "#/integrations/auth/constants";

export interface WriterSession {
  userId: string;
  did: string | null;
  /** Display name (from the profile read-model, falling back to the DID). */
  name: string;
  /** Current handle (e.g. `alice.bsky.social`), resolved from the profile. */
  handle: string | null;
  /** Avatar URL, from the profile read-model. */
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

  // Identity (handle / display name / avatar) lives in the reader's profile
  // read-model, keyed by DID — not on the auth `user` row.
  const profile = user.did
    ? await db.query.profiles.findFirst({
        where: eq(schema.profiles.did, user.did),
      })
    : null;

  return {
    userId: user.id,
    did: user.did,
    name: profile?.displayName || user.name,
    handle: profile?.handle ?? null,
    image: profile?.avatarUrl ?? user.image,
  };
}

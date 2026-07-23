/**
 * "Who is signed in?" — read the app-session cookie, look up the `session` row
 * by token, join `user`, and take the DID off the user row (never trust a
 * client-supplied DID). Read paths call `getCurrentUserDid`; the sidebar uses
 * `getCurrentViewer` for display.
 */

import {
  profiles,
  session as sessionTable,
  user,
} from "@standard-reader/db/schema";
import { eq } from "drizzle-orm";

import { getDb } from "../../db/index.server";
import { AUTH_SESSION_TOKEN_COOKIE } from "./constants";

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(";")) {
    const eqIdx = part.indexOf("=");
    if (eqIdx === -1) continue;
    if (part.slice(0, eqIdx).trim() === name) {
      return decodeURIComponent(part.slice(eqIdx + 1).trim());
    }
  }
  return undefined;
}

export async function getCurrentUserDid(
  request: Request,
): Promise<string | undefined> {
  const db = getDb();
  if (!db) return undefined;
  const token = readCookie(
    request.headers.get("cookie"),
    AUTH_SESSION_TOKEN_COOKIE,
  );
  if (!token) return undefined;

  const [row] = await db
    .select({ did: user.did, expiresAt: sessionTable.expiresAt })
    .from(sessionTable)
    .innerJoin(user, eq(sessionTable.userId, user.id))
    .where(eq(sessionTable.token, token))
    .limit(1);

  if (!row || row.expiresAt.getTime() <= Date.now() || !row.did) {
    return undefined;
  }
  return row.did;
}

export interface Viewer {
  did: string;
  displayName: string;
  handle: string | null;
  image: string | null;
}

export async function getCurrentViewer(
  request: Request,
): Promise<Viewer | null> {
  const did = await getCurrentUserDid(request);
  if (!did) return null;
  const db = getDb();
  if (!db) return null;
  const profile = await db.query.profiles.findFirst({
    where: eq(profiles.did, did),
  });
  return {
    did,
    displayName: profile?.displayName || profile?.handle || did,
    handle: profile?.handle ?? null,
    image: profile?.avatarUrl ?? null,
  };
}

export async function logout(request: Request): Promise<void> {
  const db = getDb();
  if (!db) return;
  const token = readCookie(
    request.headers.get("cookie"),
    AUTH_SESSION_TOKEN_COOKIE,
  );
  if (!token) return;
  await db.delete(sessionTable).where(eq(sessionTable.token, token));
}

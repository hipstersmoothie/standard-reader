import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import type { BridgeExclusion } from "#/lib/atproto/bridged-repo";
import { resolveReaderSessionPreferences } from "#/server/reader/session-preferences.server";

export type XrpcDbContext = {
  db: Db;
  schema: Schema;
  trackReadingEnabled: boolean;
  countOldPostsAsUnreadEnabled: boolean;
  /**
   * The cookie session's bridge exclusion — `"all"` when no reader session
   * backed this request. `dispatch` narrows it for callers who authenticated
   * with a DID token instead; see {@link XrpcRequestContext.excludeBridged}.
   */
  excludeBridged: BridgeExclusion;
  /** Whether a reader session (cookie) backed the preferences above. */
  hasReaderSession: boolean;
};

let cachedDb: Pick<XrpcDbContext, "db" | "schema"> | null = null;

export async function getXrpcDbContext(): Promise<XrpcDbContext> {
  if (!cachedDb) {
    const [{ db }, schema] = await Promise.all([
      import("#/db/index.server"),
      import("#/db/schema"),
    ]);
    cachedDb = { db, schema };
  }
  const {
    trackReadingEnabled,
    countOldPostsAsUnreadEnabled,
    excludeBridged,
    hasReaderSession,
  } = await resolveReaderSessionPreferences(cachedDb.db, cachedDb.schema);
  return {
    ...cachedDb,
    trackReadingEnabled,
    countOldPostsAsUnreadEnabled,
    excludeBridged,
    hasReaderSession,
  };
}

/**
 * The bridge exclusion an XRPC caller actually gets.
 *
 * {@link getXrpcDbContext} can only read a cookie session, and resolves `"all"`
 * when it finds none — right for an anonymous caller, who should see what the
 * signed-out app shows, and wrong for one who authenticated with a DID token
 * this resolver cannot see. Those keep the signed-in default until their own
 * preference can be read.
 */
export function effectiveBridgeExclusion(
  ctx: Pick<XrpcDbContext, "excludeBridged" | "hasReaderSession">,
  auth: unknown,
): BridgeExclusion {
  if (ctx.hasReaderSession) return ctx.excludeBridged;
  return auth ? false : ctx.excludeBridged;
}

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), "utf8").toString("base64url");
}

export function decodeCursor(cursor?: string): number {
  if (!cursor) return 0;
  const parsed = Number(Buffer.from(cursor, "base64url").toString("utf8"));
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

export function nextCursor(
  offset: number,
  pageSize: number,
  total: number,
): string | null {
  const next = offset + pageSize;
  return next < total ? encodeCursor(next) : null;
}

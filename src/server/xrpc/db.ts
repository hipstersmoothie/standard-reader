import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";

import { resolveTrackReadingHistoryEnabled } from "#/server/reader/track-reading-history.server";

export type XrpcDbContext = {
  db: Db;
  schema: Schema;
  trackReadingEnabled: boolean;
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
  const trackReadingEnabled = await resolveTrackReadingHistoryEnabled(
    cachedDb.db,
    cachedDb.schema,
  );
  return { ...cachedDb, trackReadingEnabled };
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

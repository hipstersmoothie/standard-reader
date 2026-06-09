import type { Schema } from "#/integrations/tanstack-query/api-shapes";
import type { SQL } from "drizzle-orm";

import { sql } from "drizzle-orm";

/**
 * Chronological feeds and recency aggregates must ignore posts whose
 * `publishedAt` is still in the future (mis-set clocks or scheduled posts).
 */
export function documentPublishedNotInFuture(d: Schema["documents"]): SQL {
  return sql`${d.publishedAt} <= now()`;
}

import type { Schema } from "#/integrations/tanstack-query/api-shapes";
import type { SQL } from "drizzle-orm";

import { EXCLUDED_PUBLICATION_URL_PATTERN } from "#/lib/publication/exclusions";
import { and, eq, ilike, isNull, not, or } from "drizzle-orm";

/** Read-model filter for directory / search / discovery publication queries. */
export function discoverEligiblePublicationWhere(
  p: Schema["publications"],
  ...extra: Array<SQL | undefined>
): SQL {
  const parts = [
    eq(p.deleted, false),
    eq(p.showInDiscover, true),
    not(ilike(p.url, EXCLUDED_PUBLICATION_URL_PATTERN)),
    ...extra.filter((part): part is SQL => part != null),
  ];
  // `parts` always has the three base conditions, so `and(...)` is never undefined.
  return and(...parts) as SQL;
}

/** Keep articles with no publication row, or whose publication is not excluded. */
export function notExcludedPublicationArticleWhere(p: Schema["publications"]) {
  return or(isNull(p.uri), not(ilike(p.url, EXCLUDED_PUBLICATION_URL_PATTERN)));
}

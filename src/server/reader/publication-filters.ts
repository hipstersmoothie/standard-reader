import type { Schema } from "#/integrations/tanstack-query/api-shapes";

import { EXCLUDED_PUBLICATION_URL_PATTERN } from "#/lib/publication/exclusions";
import { and, eq, ilike, isNull, not, or, type SQL } from "drizzle-orm";

/** Read-model filter for directory / search / discovery publication queries. */
export function discoverEligiblePublicationWhere(
  p: Schema["publications"],
  ...extra: Array<SQL | undefined>
) {
  const parts = [
    eq(p.deleted, false),
    eq(p.showInDiscover, true),
    not(ilike(p.url, EXCLUDED_PUBLICATION_URL_PATTERN)),
    ...extra.filter((part): part is SQL => part != null),
  ];
  return and(...parts);
}

/** Keep articles with no publication row, or whose publication is not excluded. */
export function notExcludedPublicationArticleWhere(p: Schema["publications"]) {
  return or(isNull(p.uri), not(ilike(p.url, EXCLUDED_PUBLICATION_URL_PATTERN)));
}

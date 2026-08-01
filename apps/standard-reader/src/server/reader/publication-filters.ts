import type { SQL } from "drizzle-orm";
import { and, eq, ilike, isNull, not, or } from "drizzle-orm";

import type { Schema } from "#/integrations/tanstack-query/api-shapes";
import { WEB_BRIDGE_HANDLE_SUFFIX } from "#/lib/atproto/bridged-repo";
import { EXCLUDED_PUBLICATION_URL_PATTERN } from "#/lib/publication/exclusions";

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

/**
 * Read-model filter for *article* discovery queries (Latest "All", Trending,
 * tag article counts). A document is discover-eligible when it is a loose
 * document (no publication row — `site` is an `https://` URL with no matching
 * `site.standard.publication`) **or** its publication is discover-eligible.
 * Callers must `leftJoin` publications so loose docs surface as `p.uri IS NULL`.
 */
export function discoverEligibleArticleWhere(p: Schema["publications"]): SQL {
  return or(
    isNull(p.uri),
    and(
      eq(p.deleted, false),
      eq(p.showInDiscover, true),
      not(ilike(p.url, EXCLUDED_PUBLICATION_URL_PATTERN)),
    ),
  ) as SQL;
}

/**
 * Keep publications whose owner is *not* one of Bridgy Fed's bulk web-bridge
 * mirrors (`*.web.brid.gy`). Those sites never asked to be here — they were
 * discovered and mirrored — so recommending them reads as noise even though
 * they are perfectly fine to browse, subscribe to, or find by search.
 *
 * An unresolved handle is kept, matching `isBridgedHandle`: a briefly
 * unreachable DID document should not silently drop a real publisher.
 */
export function notWebBridgePublicationWhere(pr: Schema["profiles"]): SQL {
  return or(
    isNull(pr.handle),
    not(ilike(pr.handle, `%${WEB_BRIDGE_HANDLE_SUFFIX}`)),
  ) as SQL;
}

/** Keep articles with no publication row, or whose publication is not excluded. */
export function notExcludedPublicationArticleWhere(p: Schema["publications"]) {
  return or(isNull(p.uri), not(ilike(p.url, EXCLUDED_PUBLICATION_URL_PATTERN)));
}

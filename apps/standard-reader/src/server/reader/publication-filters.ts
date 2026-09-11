import type { SQL } from "drizzle-orm";
import { and, eq, ilike, isNull, not, or, sql } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";

import type { Schema } from "#/integrations/tanstack-query/api-shapes";
import type { BridgeExclusion } from "#/lib/atproto/bridged-repo";
import { bridgeHandlePattern } from "#/lib/atproto/bridged-repo";
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
 * Which bridges an active exclusion hides. `false` never reaches these helpers
 * — callers gate on it — so the parameter is the narrowed scope.
 */
type ActiveBridgeExclusion = Exclude<BridgeExclusion, false>;

/**
 * Keep publications whose owner is *not* behind the Bridgy Fed bridge the
 * caller is hiding — the bulk web-bridge mirrors (`*.web.brid.gy`) for `"web"`,
 * both bridges for `"all"`. Mirrored sites never asked to be here (they were
 * discovered and mirrored), so recommending them reads as noise even though
 * they are perfectly fine to browse, subscribe to, or find by search.
 *
 * An unresolved handle is kept, matching `isExcludedBridgeHandle`: a briefly
 * unreachable DID document should not silently drop a real publisher.
 */
export function notBridgedPublicationWhere(
  pr: Schema["profiles"],
  exclusion: ActiveBridgeExclusion,
): SQL {
  return or(
    isNull(pr.handle),
    not(ilike(pr.handle, bridgeHandlePattern(exclusion))),
  ) as SQL;
}

/** Keep articles with no publication row, or whose publication is not excluded. */
export function notExcludedPublicationArticleWhere(p: Schema["publications"]) {
  return or(isNull(p.uri), not(ilike(p.url, EXCLUDED_PUBLICATION_URL_PATTERN)));
}

/**
 * `did` does not belong to a Bridgy Fed repo the caller is hiding.
 *
 * The anti-join form, correlating on whatever DID column is passed, so a caller
 * needs no `profiles` join or alias — the read-model queries that want this are
 * spread across `documents`-only counts, `publications`-only counts, and card
 * queries that already join `profiles` twice, and one spelling for all of them
 * is what keeps them from drifting (`topics.ts` and its derivation drifted
 * apart once already, which is why {@link bridgeHandlePattern} exists).
 *
 * Costs about what the equivalent join filter costs — measured on the `/latest`
 * "All" page against production, both forms land at ~2.4ms warm vs ~0.4ms
 * unfiltered, because `profiles.did` is the primary key and the probe is one
 * index search per candidate row. Widening the pattern from `%.web.brid.gy` to
 * `%.brid.gy` changes the string, not the shape, so the cost is unchanged.
 *
 * A DID with no profile row, or an unresolved handle, is kept — matching
 * `isExcludedBridgeHandle`: a briefly unreachable DID document should not
 * silently drop a real publisher.
 */
function notBridgedDidWhere(
  pr: Schema["profiles"],
  didColumn: PgColumn,
  exclusion: ActiveBridgeExclusion,
): SQL {
  return sql`not exists (
    select 1 from ${pr} wb
    where wb.did = ${didColumn}
      and wb.handle ilike ${bridgeHandlePattern(exclusion)}
  )`;
}

/**
 * Drop a document whose **author** is behind a hidden bridge. Pair with
 * {@link notBridgedPublicationOwnerWhere} on any query that also reaches
 * `publications`: a bridged author can post into a non-bridged publication and
 * vice versa, so neither test implies the other.
 */
export function notBridgedAuthorWhere(
  schema: Schema,
  exclusion: ActiveBridgeExclusion,
): SQL {
  return notBridgedDidWhere(schema.profiles, schema.documents.did, exclusion);
}

/** Drop a publication whose **owner** is behind a hidden bridge. */
export function notBridgedPublicationOwnerWhere(
  schema: Schema,
  exclusion: ActiveBridgeExclusion,
): SQL {
  return notBridgedDidWhere(
    schema.profiles,
    schema.publications.did,
    exclusion,
  );
}

/**
 * Both bridge tests for an article query — author and publication owner.
 *
 * `p` must be `leftJoin`ed (loose documents have no publication row); the owner
 * test passes trivially for them since `publications.did` is NULL and the
 * anti-join finds nothing.
 */
export function notBridgedArticleWhere(
  schema: Schema,
  exclusion: ActiveBridgeExclusion,
): SQL {
  return and(
    notBridgedAuthorWhere(schema, exclusion),
    notBridgedPublicationOwnerWhere(schema, exclusion),
  ) as SQL;
}

import { and, eq, ilike, inArray, or, sql } from "drizzle-orm";

import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import { notBlockedByViewer } from "#/server/blocks/blocks";
import { notMutedByViewer } from "#/server/mutes/mutes";
import type { FriendPerson } from "#/server/reader/bsky-friends";
import { userFollowedDids } from "#/server/reader/bsky-friends";
import { discoverEligiblePublicationWhere } from "#/server/reader/publication-filters";

/**
 * People results for `/search` — the writers behind the articles, which search
 * previously surfaced only indirectly by folding matched author DIDs into the
 * article predicate (where they were indistinguishable from real text matches).
 *
 * Rows reuse {@link FriendPerson} and `FriendPersonRow` verbatim: both surfaces
 * answer "here is a writer, here is their readership, follow them?", and the
 * follow CTA targets the *person* in each case.
 */

/** How many matching profiles we're willing to rank. */
export const PEOPLE_CANDIDATE_LIMIT = 50;
/** Trigram indexes need a full 3-char gram; shorter terms can't use the index. */
export const PEOPLE_MIN_QUERY_LENGTH = 3;
/** How many people the section shows. There is no "load more". */
export const PEOPLE_RESULT_LIMIT = 5;

/** Handle/display-name substring match, shared with the loose-doc account lookup. */
export function profileNameMatchSql(pr: Schema["profiles"], like: string) {
  return or(ilike(pr.handle, like), ilike(pr.displayName, like));
}

export interface PersonCandidate {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  publicationNames: Array<string>;
  publicationCount: number;
  subscriberCount: number;
}

/**
 * How well a profile answers the query, highest first. Ranked in TypeScript
 * rather than SQL because the candidate set is capped at
 * {@link PEOPLE_CANDIDATE_LIMIT} rows — a pure comparator is both cheaper than
 * a second pass over the database and directly unit-testable.
 */
export function personMatchScore(
  candidate: Pick<PersonCandidate, "displayName" | "handle">,
  query: string,
): number {
  const q = query.trim().toLowerCase().replace(/^@/, "");
  if (q.length === 0) return 0;
  const handle = candidate.handle?.trim().toLowerCase() ?? "";
  const name = candidate.displayName?.trim().toLowerCase() ?? "";

  if (handle.length > 0 && handle === q) return 4;
  if (
    (handle.length > 0 && handle.startsWith(q)) ||
    (name.length > 0 && name === q)
  ) {
    return 3;
  }
  if (name.split(/\s+/).some((word) => word.length > 0 && word.startsWith(q))) {
    return 2;
  }
  return 1;
}

/** Rank candidates by match quality, then by reach. Total order, so it's stable. */
export function rankPersonRows<T extends PersonCandidate>(
  rows: Array<T>,
  query: string,
): Array<T> {
  return rows.toSorted((a, b) => {
    const score = personMatchScore(b, query) - personMatchScore(a, query);
    if (score !== 0) return score;
    if (b.subscriberCount !== a.subscriberCount) {
      return b.subscriberCount - a.subscriberCount;
    }
    if (b.publicationCount !== a.publicationCount) {
      return b.publicationCount - a.publicationCount;
    }
    return a.did < b.did ? -1 : a.did > b.did ? 1 : 0;
  });
}

/**
 * Profiles matching `q` who actually publish here, ranked, capped at `limit`.
 *
 * Three steps: a trigram-indexed candidate sweep, one aggregate pass over those
 * candidates' publications, then the pure ranking above. The aggregate covers
 * every candidate rather than just the page so readership can participate in
 * the ranking instead of only breaking ties within an already-chosen page.
 */
export async function searchPeople(
  db: Db,
  schema: Schema,
  {
    q,
    readerDid = null,
    blockDid = null,
    muteDid = null,
    limit = PEOPLE_RESULT_LIMIT,
  }: {
    q: string;
    /** The signed-in reader, for follow state. */
    readerDid?: string | null;
    /** Reader whose blocks apply, or null when block filtering is off. */
    blockDid?: string | null;
    /** Reader whose mutes apply, or null when mute filtering is off. */
    muteDid?: string | null;
    limit?: number;
  },
): Promise<Array<FriendPerson>> {
  const term = q.trim();
  if (term.length < PEOPLE_MIN_QUERY_LENGTH) return [];

  const pr = schema.profiles;
  const p = schema.publications;
  const d = schema.documents;
  const st = schema.publicationStats;
  const like = `%${term}%`;

  const candidates = await db
    .select({
      avatarUrl: pr.avatarUrl,
      did: pr.did,
      displayName: pr.displayName,
      handle: pr.handle,
    })
    .from(pr)
    .where(
      and(
        profileNameMatchSql(pr, like),
        // Only people with something to read here. The documents arm keeps
        // writers whose work is all loose documents (no publication row).
        or(
          sql`exists (select 1 from ${p} where ${p.did} = ${pr.did} and ${p.deleted} = false)`,
          sql`exists (select 1 from ${d} where ${d.did} = ${pr.did} and ${d.deleted} = false limit 1)`,
        ),
        ...(blockDid
          ? [notBlockedByViewer(schema, blockDid, sql`${pr.did}`)]
          : []),
        ...(muteDid
          ? [
              notMutedByViewer(schema, muteDid, {
                authorDidExpr: sql`${pr.did}`,
              }),
            ]
          : []),
      ),
    )
    .limit(PEOPLE_CANDIDATE_LIMIT);

  if (candidates.length === 0) return [];
  const dids = candidates.map((row) => row.did);

  const pubRows = await db
    .select({
      did: p.did,
      name: p.name,
      subscriberCount: sql<number>`coalesce(${st.subscriberCount}, 0)::int`,
    })
    .from(p)
    .leftJoin(st, eq(st.publicationUri, p.uri))
    .where(and(inArray(p.did, dids), discoverEligiblePublicationWhere(p)));

  const byDid = new Map<
    string,
    { names: Array<string>; subscriberCount: number }
  >();
  for (const row of pubRows) {
    const entry = byDid.get(row.did) ?? { names: [], subscriberCount: 0 };
    if (row.name) entry.names.push(row.name);
    entry.subscriberCount += row.subscriberCount;
    byDid.set(row.did, entry);
  }

  const ranked = rankPersonRows(
    candidates.map((row) => {
      const agg = byDid.get(row.did);
      return {
        ...row,
        publicationCount: agg?.names.length ?? 0,
        publicationNames: agg?.names ?? [],
        subscriberCount: agg?.subscriberCount ?? 0,
      } satisfies PersonCandidate;
    }),
    term,
  ).slice(0, limit);

  const followed = readerDid
    ? await userFollowedDids(
        db,
        schema,
        readerDid,
        ranked.map((row) => row.did),
      )
    : new Set<string>();

  return ranked.map(
    (row) =>
      ({
        avatarUrl: row.avatarUrl,
        did: row.did,
        displayName: row.displayName,
        handle: row.handle,
        isFollowing: followed.has(row.did),
        publicationCount: row.publicationCount,
        publicationNames: row.publicationNames,
        subscriberCount: row.subscriberCount,
      }) satisfies FriendPerson,
  );
}

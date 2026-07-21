import { and, desc, eq, sql } from "drizzle-orm";

import { db } from "#/db/index.server";
import { documents, lists, publications } from "#/db/schema";
import type { ApiDocsFixtures } from "#/lib/api-docs/fixture-defaults";
import type { ApiDocsTagOption } from "#/lib/api-docs/types";
import { APP_NSID } from "#/lib/atproto/nsids";
import { listRepoRecords } from "#/server/atproto/fetch-record";
import { resolveIdentity } from "#/server/atproto/identity";
import { parseAtUri } from "#/server/atproto/uri";
import { documentPublishedNotInFuture } from "#/server/reader/document-filters";
import { discoverEligiblePublicationWhere } from "#/server/reader/publication-filters";
import { discoverPublicationTopics } from "#/server/reader/queries";

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Find the first `app.standard-reader.list` record URI for a reader.
 *  Tries the DB mirror first (`lists` table); falls back to a PDS probe
 *  (Slingshot first, migration retry) only when no rows exist yet. */
export async function discoverApiDocsListUri(
  did: string,
): Promise<string | undefined> {
  const [row] = await db
    .select({ uri: lists.uri })
    .from(lists)
    .where(and(eq(lists.ownerDid, did), eq(lists.deleted, false)))
    .limit(1);
  if (row?.uri) return row.uri;

  // DB miss — probe the repo once and let the backfill tap land it.
  const identity = await resolveIdentity(did);
  try {
    const { records } = await listRepoRecords(
      did,
      APP_NSID.list,
      identity.pds,
      1,
    );
    const uri = records[0]?.uri;
    return typeof uri === "string" && uri.length > 0 ? uri : undefined;
  } catch {
    return undefined;
  }
}

/** Fill fixture gaps from the Neon read-model (same sources as perf discovery). */
export async function discoverApiDocsFixturesFromDb(): Promise<
  Partial<ApiDocsFixtures>
> {
  const [docRow] = await db
    .select({
      uri: documents.uri,
      tags: documents.tags,
      publicationUri: documents.publicationUri,
    })
    .from(documents)
    .innerJoin(publications, eq(publications.uri, documents.publicationUri))
    .where(
      and(
        discoverEligiblePublicationWhere(publications),
        documentPublishedNotInFuture(documents),
        eq(documents.deleted, false),
      ),
    )
    .orderBy(desc(documents.publishedAt))
    .limit(1);

  const [pubRow] = await db
    .select({
      uri: publications.uri,
      did: publications.did,
      url: publications.url,
    })
    .from(publications)
    .where(discoverEligiblePublicationWhere(publications))
    .orderBy(desc(publications.updatedAt))
    .limit(1);

  const publicationUri = pubRow?.uri ?? docRow?.publicationUri;
  const publicationParsed = publicationUri ? parseAtUri(publicationUri) : null;
  const readerDid = pubRow?.did ?? publicationParsed?.did;
  const resolveUrl = pubRow?.url ?? undefined;
  const handle = resolveUrl
    ? (hostnameFromUrl(resolveUrl) ?? undefined)
    : undefined;
  const tag =
    docRow?.tags?.find((value) => value.trim().length > 0)?.trim() ?? undefined;

  const partial: Partial<ApiDocsFixtures> = {};
  if (publicationUri) partial.publicationUri = publicationUri;
  if (docRow?.uri) partial.documentUri = docRow.uri;
  if (handle) partial.handle = handle;
  if (tag) partial.tag = tag;
  if (readerDid) partial.readerDid = readerDid;
  if (resolveUrl) partial.resolveUrl = resolveUrl;

  if (readerDid && !process.env.API_DOCS_FIXTURE_LIST_URI?.trim()) {
    const listUri = await discoverApiDocsListUri(readerDid);
    if (listUri) {
      partial.listUri = listUri;
    }
  }

  return partial;
}

function formatTagArticleLabel(tag: string, count: number): string {
  return `${tag} · ${count.toLocaleString("en-US")} articles`;
}

function formatTagPublicationLabel(tag: string, count: number): string {
  return `${tag} · ${count.toLocaleString("en-US")} publications`;
}

async function discoverDocumentTagCounts(
  limit: number,
): Promise<Array<ApiDocsTagOption>> {
  const result = await db.execute(sql`
    SELECT lower(btrim(tag)) AS tag, count(*)::int AS cnt
    FROM documents d
    INNER JOIN publications p ON p.uri = d.publication_uri
    CROSS JOIN unnest(d.tags) AS tag
    WHERE d.deleted = false
      AND btrim(tag) <> ''
      AND d.published_at <= now()
      AND p.deleted = false
      AND p.show_in_discover = true
    GROUP BY lower(btrim(tag))
    ORDER BY cnt DESC, tag ASC
    LIMIT ${limit}
  `);

  return result.rows
    .map((row) => {
      const record = row as { tag?: string; cnt?: number };
      const id = typeof record.tag === "string" ? record.tag.trim() : "";
      const count = typeof record.cnt === "number" ? record.cnt : 0;
      if (!id) {
        return null;
      }
      return {
        id,
        label: formatTagArticleLabel(id, count),
        count,
      };
    })
    .filter((item): item is ApiDocsTagOption => item != null);
}

async function discoverTagArticleCount(tag: string): Promise<number> {
  const normalized = tag.trim().toLowerCase();
  if (!normalized) {
    return 0;
  }

  const result = await db.execute(sql`
    SELECT count(*)::int AS cnt
    FROM documents d
    INNER JOIN publications p ON p.uri = d.publication_uri
    CROSS JOIN unnest(d.tags) AS tag
    WHERE d.deleted = false
      AND btrim(tag) <> ''
      AND d.published_at <= now()
      AND p.deleted = false
      AND p.show_in_discover = true
      AND lower(btrim(tag)) = ${normalized}
  `);
  const row = result.rows[0] as { cnt?: number } | undefined;
  return row?.cnt ?? 0;
}

/** Popular tags for getTagFeed — document tags plus discover publication topics. */
export async function discoverApiDocsTagOptions(
  limit = 64,
): Promise<Array<ApiDocsTagOption>> {
  const [documentTags, publicationTopics] = await Promise.all([
    discoverDocumentTagCounts(limit),
    discoverPublicationTopics(db, { limit: 32 }),
  ]);

  const byId = new Map<string, ApiDocsTagOption>();
  for (const option of documentTags) {
    byId.set(option.id, option);
  }
  for (const { topic, count } of publicationTopics) {
    const id = topic.trim().toLowerCase();
    if (!id || byId.has(id)) {
      continue;
    }
    byId.set(id, {
      id,
      label: formatTagPublicationLabel(id, count),
      count,
    });
  }

  return [...byId.values()].toSorted(
    (left, right) =>
      right.count - left.count || left.id.localeCompare(right.id),
  );
}

/** Ensure the fixture default tag appears first in the picklist. */
export async function prioritizeApiDocsFixtureTag(
  options: Array<ApiDocsTagOption>,
  fixtureTag: string | undefined,
): Promise<Array<ApiDocsTagOption>> {
  const normalized = fixtureTag?.trim().toLowerCase();
  if (!normalized) {
    return options;
  }

  const existing = options.find((option) => option.id === normalized);
  if (existing) {
    return [existing, ...options.filter((option) => option.id !== normalized)];
  }

  const count = await discoverTagArticleCount(normalized);
  return [
    {
      id: normalized,
      label: formatTagArticleLabel(normalized, count),
      count,
    },
    ...options,
  ];
}

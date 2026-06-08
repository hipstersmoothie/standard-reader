import { hasRenderableArticleBody } from "#/lib/document/renderable";
import { documentSearchText } from "#/lib/document/search-text";
import { and, asc, eq, gt, inArray, isNotNull, isNull, sql } from "drizzle-orm";

import { db } from "../../db/index.ts";
import { documents, publications } from "../../db/schema.ts";
import { getBlobUrl } from "../atproto/blob.ts";
import { resolveIdentity } from "../atproto/identity.ts";
import { reconcileDocumentDup, reconcilePublicationGroup } from "./handlers.ts";

/**
 * Recompute the derived per-publication aggregates (subscriber/document/
 * recommend counts, freshness, rolling-window activity, trending score).
 *
 * Cheap to run periodically (cron) or after a backfill. The rolling window
 * (7 days) and trending weights are intentionally simple/tunable starting
 * points, per the discovery-engine plan.
 */
export async function recomputePublicationStats(): Promise<void> {
  await db.execute(sql`
    INSERT INTO publication_stats (
      publication_uri, subscriber_count, document_count, recommend_count,
      last_document_at, documents_7d, subscribers_7d, recommends_7d,
      trending_score, trending_window_start, recomputed_at
    )
    SELECT
      p.uri,
      coalesce(s.cnt, 0),
      coalesce(d.cnt, 0),
      coalesce(r.cnt, 0),
      d.last_at,
      coalesce(d.cnt7, 0),
      coalesce(s.cnt7, 0),
      coalesce(r.cnt7, 0),
      (coalesce(d.cnt7, 0) * 3.0 + coalesce(s.cnt7, 0) * 2.0 + coalesce(r.cnt7, 0) * 1.0),
      now() - interval '7 days',
      now()
    FROM publications p
    LEFT JOIN (
      SELECT publication_uri,
             count(*) AS cnt,
             count(*) FILTER (
               WHERE coalesce(created_at, indexed_at) > now() - interval '7 days'
             ) AS cnt7
      FROM subscriptions
      WHERE deleted = false
      GROUP BY publication_uri
    ) s ON s.publication_uri = p.uri
    LEFT JOIN (
      SELECT publication_uri,
             count(*) AS cnt,
             max(published_at) AS last_at,
             count(*) FILTER (
               WHERE published_at > now() - interval '7 days'
             ) AS cnt7
      FROM documents
      WHERE deleted = false AND publication_uri IS NOT NULL
      GROUP BY publication_uri
    ) d ON d.publication_uri = p.uri
    LEFT JOIN (
      SELECT doc.publication_uri,
             count(*) AS cnt,
             count(*) FILTER (
               WHERE coalesce(rc.created_at, rc.indexed_at) > now() - interval '7 days'
             ) AS cnt7
      FROM recommends rc
      JOIN documents doc ON doc.uri = rc.document_uri
      WHERE rc.deleted = false AND doc.publication_uri IS NOT NULL
      GROUP BY doc.publication_uri
    ) r ON r.publication_uri = p.uri
    WHERE p.deleted = false
    ON CONFLICT (publication_uri) DO UPDATE SET
      subscriber_count = EXCLUDED.subscriber_count,
      document_count = EXCLUDED.document_count,
      recommend_count = EXCLUDED.recommend_count,
      last_document_at = EXCLUDED.last_document_at,
      documents_7d = EXCLUDED.documents_7d,
      subscribers_7d = EXCLUDED.subscribers_7d,
      recommends_7d = EXCLUDED.recommends_7d,
      trending_score = EXCLUDED.trending_score,
      trending_window_start = EXCLUDED.trending_window_start,
      recomputed_at = EXCLUDED.recomputed_at
  `);
}

/**
 * Rebuild the materialized co-recommend graph used alongside co-subscriptions
 * for discovery. For each ordered pair of publications, count shared
 * recommenders (readers who liked at least one article from each) and store a
 * cosine-style similarity score.
 */
export async function recomputeCorecommends(): Promise<void> {
  await db.execute(sql`DELETE FROM publication_corecommends`);
  await db.execute(sql`
    WITH deg AS (
      SELECT doc.publication_uri,
             count(DISTINCT rc.recommender_did) AS n
      FROM recommends rc
      JOIN documents doc ON doc.uri = rc.document_uri
      WHERE rc.deleted = false
        AND doc.deleted = false
        AND doc.publication_uri IS NOT NULL
      GROUP BY doc.publication_uri
    ),
    pairs AS (
      SELECT doc_a.publication_uri AS pa,
             doc_b.publication_uri AS pb,
             count(DISTINCT rc_a.recommender_did) AS co
      FROM recommends rc_a
      JOIN documents doc_a ON doc_a.uri = rc_a.document_uri
      JOIN recommends rc_b
        ON rc_b.recommender_did = rc_a.recommender_did
       AND rc_b.document_uri <> rc_a.document_uri
      JOIN documents doc_b ON doc_b.uri = rc_b.document_uri
      WHERE rc_a.deleted = false
        AND rc_b.deleted = false
        AND doc_a.deleted = false
        AND doc_b.deleted = false
        AND doc_a.publication_uri IS NOT NULL
        AND doc_b.publication_uri IS NOT NULL
        AND doc_a.publication_uri <> doc_b.publication_uri
      GROUP BY doc_a.publication_uri, doc_b.publication_uri
    )
    INSERT INTO publication_corecommends (
      publication_uri, related_publication_uri, co_recommender_count, score, recomputed_at
    )
    SELECT
      pairs.pa,
      pairs.pb,
      pairs.co,
      pairs.co::float8 / sqrt(da.n::float8 * db.n::float8),
      now()
    FROM pairs
    JOIN deg da ON da.publication_uri = pairs.pa
    JOIN deg db ON db.publication_uri = pairs.pb
    JOIN publications ppa ON ppa.uri = pairs.pa AND ppa.deleted = false
    JOIN publications ppb ON ppb.uri = pairs.pb AND ppb.deleted = false
  `);
}

/**
 * Rebuild the materialized co-subscription graph used for "Recommended for
 * you". For each ordered pair of publications, count shared subscribers and
 * store a cosine-style similarity score (shared / sqrt(degA * degB)). Only
 * pairs whose endpoints both exist as indexed publications are kept (FK-safe).
 */
export async function recomputeCosubscriptions(): Promise<void> {
  await db.execute(sql`DELETE FROM publication_cosubscriptions`);
  await db.execute(sql`
    WITH deg AS (
      SELECT publication_uri, count(DISTINCT subscriber_did) AS n
      FROM subscriptions
      WHERE deleted = false
      GROUP BY publication_uri
    ),
    pairs AS (
      SELECT a.publication_uri AS pa,
             b.publication_uri AS pb,
             count(DISTINCT a.subscriber_did) AS co
      FROM subscriptions a
      JOIN subscriptions b
        ON a.subscriber_did = b.subscriber_did
       AND a.publication_uri <> b.publication_uri
      WHERE a.deleted = false AND b.deleted = false
      GROUP BY a.publication_uri, b.publication_uri
    )
    INSERT INTO publication_cosubscriptions (
      publication_uri, related_publication_uri, co_subscriber_count, score, recomputed_at
    )
    SELECT
      pairs.pa,
      pairs.pb,
      pairs.co,
      pairs.co::float8 / sqrt(da.n::float8 * db.n::float8),
      now()
    FROM pairs
    JOIN deg da ON da.publication_uri = pairs.pa
    JOIN deg db ON db.publication_uri = pairs.pb
    JOIN publications ppa ON ppa.uri = pairs.pa AND ppa.deleted = false
    JOIN publications ppb ON ppb.uri = pairs.pb AND ppb.deleted = false
  `);
}

/**
 * Derive each publication's `topic` from its documents' tags (the lexicon has
 * no topic field). A publication's topic is the most frequent tag across its
 * non-deleted documents, normalized (trimmed + lowercased), ties broken
 * alphabetically. Publications with no tagged documents are reset to null.
 *
 * The Discover directory's topic chips can then be built from the top-N topics
 * by publication count.
 */
export async function recomputeTopics(): Promise<void> {
  // Clear stale topics first so removed tags don't linger.
  await db.execute(
    sql`UPDATE publications SET topic = NULL WHERE topic IS NOT NULL`,
  );
  await db.execute(sql`
    WITH tag_counts AS (
      SELECT d.publication_uri AS uri,
             lower(btrim(tag)) AS tag,
             count(*) AS n
      FROM documents d, unnest(d.tags) AS tag
      WHERE d.deleted = false
        AND d.publication_uri IS NOT NULL
        AND btrim(tag) <> ''
      GROUP BY d.publication_uri, lower(btrim(tag))
    ),
    ranked AS (
      SELECT uri, tag,
             row_number() OVER (PARTITION BY uri ORDER BY n DESC, tag ASC) AS rk
      FROM tag_counts
    )
    UPDATE publications p
    SET topic = r.tag, updated_at = now()
    FROM ranked r
    WHERE r.uri = p.uri AND r.rk = 1
  `);
}

/**
 * Resolve a batch of DIDs to their PDS endpoints with bounded concurrency.
 * `resolveIdentity` memoizes per-DID, so duplicate DIDs cost one lookup; the
 * pool just keeps the PLC fan-out from spiking under a large backfill.
 */
async function resolvePdsByDid(
  dids: Array<string>,
): Promise<Map<string, string>> {
  const unique = [...new Set(dids)];
  const byDid = new Map<string, string>();
  const CONCURRENCY = 16;
  let cursor = 0;
  async function worker(): Promise<void> {
    while (cursor < unique.length) {
      const did = unique[cursor++];
      const identity = await resolveIdentity(did);
      if (identity.pds) byDid.set(did, identity.pds);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, unique.length) }, worker),
  );
  return byDid;
}

/**
 * Backfill `icon_url` / `cover_image_url` for records that have a stored blob
 * CID but no resolved URL. The hot ingest path builds these from the *cached*
 * identity only (so the tap webhook never blocks on PLC), which means a record
 * indexed before its owner's DID doc was cached lands with the CID but a null
 * URL. This pass resolves the owning PDS and fills the gap; it's idempotent and
 * only touches rows still missing a URL, so it's safe to run on every cron.
 */
export async function backfillBlobUrls(): Promise<{
  icons: number;
  covers: number;
}> {
  const pubRows = await db
    .select({
      uri: publications.uri,
      did: publications.did,
      cid: publications.iconCid,
    })
    .from(publications)
    .where(
      and(
        isNotNull(publications.iconCid),
        isNull(publications.iconUrl),
        eq(publications.deleted, false),
      ),
    );
  const docRows = await db
    .select({
      uri: documents.uri,
      did: documents.did,
      cid: documents.coverImageCid,
    })
    .from(documents)
    .where(
      and(
        isNotNull(documents.coverImageCid),
        isNull(documents.coverImageUrl),
        eq(documents.deleted, false),
      ),
    );

  const pdsByDid = await resolvePdsByDid([
    ...pubRows.map((row) => row.did),
    ...docRows.map((row) => row.did),
  ]);

  let icons = 0;
  for (const row of pubRows) {
    const pds = pdsByDid.get(row.did);
    if (!pds || !row.cid) continue;
    await db
      .update(publications)
      .set({
        iconUrl: getBlobUrl(pds, row.did, row.cid),
        updatedAt: new Date(),
      })
      .where(eq(publications.uri, row.uri));
    icons++;
  }

  let covers = 0;
  for (const row of docRows) {
    const pds = pdsByDid.get(row.did);
    if (!pds || !row.cid) continue;
    await db
      .update(documents)
      .set({
        coverImageUrl: getBlobUrl(pds, row.did, row.cid),
        updatedAt: new Date(),
      })
      .where(eq(documents.uri, row.uri));
    covers++;
  }

  return { icons, covers };
}

/**
 * Fill or refresh `documents.text_content` from record text plus structured
 * content blocks so GIN search covers full article bodies.
 *
 * `content_json` can be large per row, so reads are keyset-paginated by `uri`
 * to stay under the Neon HTTP response cap (~64MB).
 */
export async function backfillDocumentSearchText(): Promise<number> {
  const BATCH_SIZE = 100;
  let cursor: string | null = null;
  let updated = 0;

  for (;;) {
    const rows = await db
      .select({
        uri: documents.uri,
        textContent: documents.textContent,
        contentJson: documents.contentJson,
        contentFormat: documents.contentFormat,
      })
      .from(documents)
      .where(
        cursor == null
          ? eq(documents.deleted, false)
          : and(eq(documents.deleted, false), gt(documents.uri, cursor)),
      )
      .orderBy(asc(documents.uri))
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].uri;

    for (const row of rows) {
      const next = documentSearchText({
        textContent: row.textContent,
        contentJson: row.contentJson,
        contentFormat: row.contentFormat,
      });
      if (next === (row.textContent ?? null)) continue;
      await db
        .update(documents)
        .set({ textContent: next, updatedAt: new Date() })
        .where(eq(documents.uri, row.uri));
      updated++;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return updated;
}

/**
 * Recompute `documents.has_renderable_body` — whether the reader can render an
 * in-app body (structured blocks) vs. an "external" post that should link out
 * to the publication site. Derived in JS from `content_json` (keyset-paginated
 * reads to respect the Neon HTTP cap), then written back in batched
 * `IN (...)`-list UPDATEs so a large corpus costs a handful of round trips
 * instead of one per row. Idempotent.
 */
export async function backfillRenderableBody(): Promise<number> {
  const READ_BATCH = 200;
  const WRITE_CHUNK = 500;
  let cursor: string | null = null;
  const toTrue: Array<string> = [];
  const toFalse: Array<string> = [];

  for (;;) {
    const rows = await db
      .select({
        uri: documents.uri,
        textContent: documents.textContent,
        contentJson: documents.contentJson,
        contentFormat: documents.contentFormat,
        hasRenderableBody: documents.hasRenderableBody,
      })
      .from(documents)
      .where(
        cursor == null
          ? eq(documents.deleted, false)
          : and(eq(documents.deleted, false), gt(documents.uri, cursor)),
      )
      .orderBy(asc(documents.uri))
      .limit(READ_BATCH);

    if (rows.length === 0) break;
    cursor = rows[rows.length - 1].uri;

    for (const row of rows) {
      const next = hasRenderableArticleBody({
        textContent: row.textContent,
        contentJson: row.contentJson,
        contentFormat: row.contentFormat,
      });
      if (next === row.hasRenderableBody) continue;
      (next ? toTrue : toFalse).push(row.uri);
    }

    if (rows.length < READ_BATCH) break;
  }

  for (const [value, uris] of [
    [true, toTrue],
    [false, toFalse],
  ] as const) {
    for (let i = 0; i < uris.length; i += WRITE_CHUNK) {
      const chunk = uris.slice(i, i + WRITE_CHUNK);
      await db
        .update(documents)
        .set({ hasRenderableBody: value, updatedAt: new Date() })
        .where(inArray(documents.uri, chunk));
    }
  }

  return toTrue.length + toFalse.length;
}

/**
 * Collapse duplicate publications (`did, url`) and documents (`did, cid`) to a
 * single canonical row each. Repairs existing data and acts as a safety net for
 * the hot-path dedup. Returns how many duplicate groups were reconciled.
 */
export async function dedupeRecords(): Promise<{
  publications: number;
  documents: number;
}> {
  const pubGroups = await db
    .select({ did: publications.did, url: publications.url })
    .from(publications)
    .where(eq(publications.deleted, false))
    .groupBy(publications.did, publications.url)
    .having(sql`count(*) > 1`);
  for (const group of pubGroups) {
    await reconcilePublicationGroup(group.did, group.url);
  }

  const docGroups = await db
    .select({ did: documents.did, cid: documents.cid })
    .from(documents)
    .where(and(eq(documents.deleted, false), isNotNull(documents.cid)))
    .groupBy(documents.did, documents.cid)
    .having(sql`count(*) > 1`);
  for (const group of docGroups) {
    await reconcileDocumentDup(group.did, group.cid);
  }

  return { documents: docGroups.length, publications: pubGroups.length };
}

/** Run the full derived-data recompute. */
export async function recomputeDerived(): Promise<void> {
  // Dedup first so stats/aggregates compute over canonical rows only.
  await dedupeRecords();
  await recomputePublicationStats();
  await recomputeCosubscriptions();
  await recomputeCorecommends();
  await recomputeTopics();
  // Best-effort: a slow/unreachable PLC must never abort the stats recompute.
  try {
    await backfillBlobUrls();
  } catch {
    // Leave URLs null; the next recompute retries the still-missing rows.
  }
  try {
    await backfillDocumentSearchText();
  } catch {
    // Search text stays as-is; the next recompute retries.
  }
  try {
    await backfillRenderableBody();
  } catch {
    // Renderable flags stay as-is; the next recompute retries.
  }
}

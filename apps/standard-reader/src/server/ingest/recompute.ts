import {
  and,
  asc,
  desc,
  eq,
  gt,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
} from "drizzle-orm";

import { WEB_BRIDGE_HANDLE_PATTERN } from "#/lib/atproto/bridged-repo";
import { mapWithConcurrency } from "#/lib/concurrency";
import { hasRenderableArticleBody } from "#/lib/document/renderable";
import {
  documentExtractedText,
  documentSearchText,
  repairCompoundedSearchText,
} from "#/lib/document/search-text";
import { EXCLUDED_PUBLICATION_URL_PATTERN } from "#/lib/publication/exclusions";
import { SERIAL_DIRECTION } from "#/lib/publication/serial";
import { detectDocumentLanguage, languageColumns } from "#/server/lang/detect";
import { loadGlotlid } from "#/server/lang/glotlid";
import { isJevConfigured, jevLanguage } from "#/server/lang/jev";
import { documentLanguageSample } from "#/server/lang/sample";
import { deriveSerialKind } from "#/server/reader/series";
import {
  ARTICLE_BLEND,
  BACKLINK_SYNC_CONCURRENCY,
  MIN_ARTICLE_RECOMMENDERS,
  PUBLICATION_BLEND,
  PUBLICATION_PRIOR_WINDOW_DAYS,
  PUBLICATION_RECENT_WINDOW_DAYS,
  TRENDING_MAX_AGE_DAYS,
} from "#/server/reader/trending-scoring";

import { db } from "../../db/index.ts";
import * as schema from "../../db/schema.ts";
import {
  documents,
  NETWORK_DOCUMENT_COUNT_KEY,
  NETWORK_DOCUMENT_COUNT_NO_WEB_BRIDGE_KEY,
  networkStats,
  profiles,
  publications,
  UNTAGGED_LANGUAGE_KEY,
} from "../../db/schema.ts";
import { getBacklinkCountForTarget } from "../atproto/constellation.ts";
import {
  INVALID_HANDLE,
  isUsableHandle,
  refreshIdentity,
} from "../atproto/identity.ts";
import { logEvent } from "../observability/log.ts";
import { replayDeadLetters } from "./consumer.ts";
import { reconcileDocumentDup, reconcilePublicationGroup } from "./handlers.ts";

/**
 * How many documents one sweep will language-tag before stopping.
 *
 * Well under a second of model time per sweep — enough to absorb an hour of
 * ingest many times over, and small enough that a corpus that has never been
 * tagged degrades into "this takes a while" rather than "the ingest worker
 * stops keeping up". See {@link backfillDocumentLanguages}.
 */
const LANGUAGE_SWEEP_CAP = 2000;

/**
 * How many Jev tiebreaks one sweep will run. ~2% of an hour's ~600 new
 * documents need one, so this clears the steady state with room to spare and
 * works a post-backfill queue down over a few hours instead of all at once.
 * See {@link tiebreakDocumentLanguages}.
 */
const JEV_TIEBREAK_CAP = 1000;

/**
 * Recompute the derived per-publication aggregates (subscriber/document/
 * recommend counts, freshness, rolling-window activity, normalized trending
 * score). Distinct recommenders exclude self-recommends; velocity compares
 * recent vs prior windows; trending_score is a z-score blend.
 */
export async function recomputePublicationStats(): Promise<void> {
  const recentDays = PUBLICATION_RECENT_WINDOW_DAYS;
  const priorDays = PUBLICATION_PRIOR_WINDOW_DAYS;
  const totalWindow = recentDays + priorDays;

  await db.execute(sql`
    INSERT INTO publication_stats (
      publication_uri, subscriber_count, document_count, recommend_count,
      last_document_at, documents_7d, subscribers_7d, recommends_7d,
      documents_prev_7d, subscribers_prev_7d, recommends_prev_7d,
      backlinks_7d, trending_velocity, trending_score,
      trending_window_start, recomputed_at
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
      coalesce(d.cnt_prev7, 0),
      coalesce(s.cnt_prev7, 0),
      coalesce(r.cnt_prev7, 0),
      coalesce(bl.backlinks, 0),
      0,
      0,
      now() - (${recentDays}::text || ' days')::interval,
      now()
    FROM publications p
    LEFT JOIN (
      SELECT publication_uri,
             count(DISTINCT subscriber_did) AS cnt,
             count(DISTINCT subscriber_did) FILTER (
               WHERE coalesce(created_at, indexed_at) > now() - (${recentDays}::text || ' days')::interval
             ) AS cnt7,
             count(DISTINCT subscriber_did) FILTER (
               WHERE coalesce(created_at, indexed_at) > now() - (${totalWindow}::text || ' days')::interval
                 AND coalesce(created_at, indexed_at) <= now() - (${recentDays}::text || ' days')::interval
             ) AS cnt_prev7
      FROM subscriptions
      WHERE deleted = false
      GROUP BY publication_uri
    ) s ON s.publication_uri = p.uri
    LEFT JOIN (
      SELECT publication_uri,
             count(*) AS cnt,
             max(published_at) FILTER (WHERE published_at <= now()) AS last_at,
             count(*) FILTER (
               WHERE published_at > now() - (${recentDays}::text || ' days')::interval
                 AND published_at <= now()
             ) AS cnt7,
             count(*) FILTER (
               WHERE published_at > now() - (${totalWindow}::text || ' days')::interval
                 AND published_at <= now() - (${recentDays}::text || ' days')::interval
             ) AS cnt_prev7
      FROM documents
      WHERE deleted = false AND publication_uri IS NOT NULL
      GROUP BY publication_uri
    ) d ON d.publication_uri = p.uri
    LEFT JOIN (
      SELECT doc.publication_uri,
             count(DISTINCT rc.recommender_did) AS cnt,
             count(DISTINCT rc.recommender_did) FILTER (
               WHERE coalesce(rc.created_at, rc.indexed_at) > now() - (${recentDays}::text || ' days')::interval
             ) AS cnt7,
             count(DISTINCT rc.recommender_did) FILTER (
               WHERE coalesce(rc.created_at, rc.indexed_at) > now() - (${totalWindow}::text || ' days')::interval
                 AND coalesce(rc.created_at, rc.indexed_at) <= now() - (${recentDays}::text || ' days')::interval
             ) AS cnt_prev7
      FROM recommends rc
      JOIN documents doc ON doc.uri = rc.document_uri
      WHERE rc.deleted = false
        AND doc.deleted = false
        AND doc.publication_uri IS NOT NULL
        AND rc.recommender_did <> doc.did
      GROUP BY doc.publication_uri
    ) r ON r.publication_uri = p.uri
    LEFT JOIN (
      SELECT publication_uri,
             coalesce(sum(backlink_count), 0)::int AS backlinks
      FROM documents
      WHERE deleted = false
        AND publication_uri IS NOT NULL
        AND published_at > now() - (${TRENDING_MAX_AGE_DAYS}::text || ' days')::interval
        AND published_at <= now()
      GROUP BY publication_uri
    ) bl ON bl.publication_uri = p.uri
    WHERE p.deleted = false
    ON CONFLICT (publication_uri) DO UPDATE SET
      subscriber_count = EXCLUDED.subscriber_count,
      document_count = EXCLUDED.document_count,
      recommend_count = EXCLUDED.recommend_count,
      last_document_at = EXCLUDED.last_document_at,
      documents_7d = EXCLUDED.documents_7d,
      subscribers_7d = EXCLUDED.subscribers_7d,
      recommends_7d = EXCLUDED.recommends_7d,
      documents_prev_7d = EXCLUDED.documents_prev_7d,
      subscribers_prev_7d = EXCLUDED.subscribers_prev_7d,
      recommends_prev_7d = EXCLUDED.recommends_prev_7d,
      backlinks_7d = EXCLUDED.backlinks_7d,
      trending_window_start = EXCLUDED.trending_window_start,
      recomputed_at = EXCLUDED.recomputed_at
  `);

  const wDoc = PUBLICATION_BLEND.documents;
  const wSub = PUBLICATION_BLEND.subscribers;
  const wRec = PUBLICATION_BLEND.recommends;
  const wBl = PUBLICATION_BLEND.backlinks;
  const wVel = PUBLICATION_BLEND.velocity;

  await db.execute(sql`
    WITH base AS (
      SELECT publication_uri,
        ln(1 + documents_7d::float8) AS doc_ln,
        ln(1 + subscribers_7d::float8) AS sub_ln,
        ln(1 + recommends_7d::float8) AS rec_ln,
        ln(1 + backlinks_7d::float8) AS bl_ln,
        (documents_7d + subscribers_7d + recommends_7d)::float8
          - (documents_prev_7d + subscribers_prev_7d + recommends_prev_7d)::float8 AS vel_raw
      FROM publication_stats
    ),
    stats AS (
      SELECT
        avg(doc_ln) AS doc_avg,
        nullif(stddev_pop(doc_ln), 0) AS doc_std,
        avg(sub_ln) AS sub_avg,
        nullif(stddev_pop(sub_ln), 0) AS sub_std,
        avg(rec_ln) AS rec_avg,
        nullif(stddev_pop(rec_ln), 0) AS rec_std,
        avg(bl_ln) AS bl_avg,
        nullif(stddev_pop(bl_ln), 0) AS bl_std,
        avg(vel_raw) AS vel_avg,
        nullif(stddev_pop(vel_raw), 0) AS vel_std
      FROM base
    ),
    scored AS (
      SELECT b.publication_uri,
        b.vel_raw,
        CASE WHEN s.doc_std IS NULL THEN 0
             ELSE (b.doc_ln - s.doc_avg) / s.doc_std END AS z_doc,
        CASE WHEN s.sub_std IS NULL THEN 0
             ELSE (b.sub_ln - s.sub_avg) / s.sub_std END AS z_sub,
        CASE WHEN s.rec_std IS NULL THEN 0
             ELSE (b.rec_ln - s.rec_avg) / s.rec_std END AS z_rec,
        CASE WHEN s.bl_std IS NULL THEN 0
             ELSE (b.bl_ln - s.bl_avg) / s.bl_std END AS z_bl,
        CASE WHEN s.vel_std IS NULL THEN 0
             ELSE (b.vel_raw - s.vel_avg) / s.vel_std END AS z_vel
      FROM base b
      CROSS JOIN stats s
    )
    UPDATE publication_stats ps
    SET trending_velocity = sc.vel_raw,
        trending_score = (
          sc.z_doc * ${wDoc} + sc.z_sub * ${wSub} + sc.z_rec * ${wRec}
          + sc.z_bl * ${wBl} + sc.z_vel * ${wVel}
        ),
        recomputed_at = now()
    FROM scored sc
    WHERE ps.publication_uri = sc.publication_uri
  `);
}

/**
 * Sync Constellation backlink totals for recent discover-eligible documents.
 * Best-effort; failures are non-fatal.
 *
 * **Only rows whose count actually moves are written**, for the same reason
 * `recomputeDocumentTrending` skips unchanged scores: `backlink_count` is read
 * by the trending blend and the row lives in a 16GB table with a GIN index on
 * tags, so every write is a non-HOT update that versions the tuple in *every*
 * index. This ran unconditionally, one UPDATE per document per hour.
 *
 * Measured on prod, of 313,553 rows the sweep has ever synced, 224,494 (72%)
 * already held `backlink_count = backlink_count_prev`, and 258,902 (83%) sat at
 * zero — so the large majority of those writes rewrote a value over itself.
 * Over a 9.75-day window the sweep was 3,517,982 updates and 7.5% of all
 * database time, and the churn is a first-order contributor to the 510,139 dead
 * tuples that keep autovacuum behind on `documents`.
 *
 * `backlink_synced_at` stops advancing for skipped rows, which is free —
 * nothing reads that column.
 */
export async function recomputeDocumentBacklinks(): Promise<number> {
  const rows = await db.execute<{ uri: string; canonical_url: string }>(sql`
    SELECT d.uri, d.canonical_url AS "canonical_url"
    FROM documents d
    JOIN publications p ON p.uri = d.publication_uri
    WHERE d.deleted = false
      AND p.deleted = false
      AND p.show_in_discover = true
      AND p.url NOT ILIKE ${EXCLUDED_PUBLICATION_URL_PATTERN}
      AND d.canonical_url IS NOT NULL
      AND d.published_at > now() - (${TRENDING_MAX_AGE_DAYS}::text || ' days')::interval
      AND d.published_at <= now()
  `);

  const targets = rows.rows.filter(
    (row): row is { uri: string; canonical_url: string } =>
      typeof row.uri === "string" && typeof row.canonical_url === "string",
  );

  let updated = 0;
  let cursor = 0;
  const concurrency = Math.min(BACKLINK_SYNC_CONCURRENCY, targets.length || 1);

  async function worker(): Promise<void> {
    while (cursor < targets.length) {
      const row = targets[cursor++];
      const count = await getBacklinkCountForTarget(row.canonical_url);
      // Only write rows the sync actually moves. The guard matches the
      // post-state exactly: this update sets `prev` to the *current* count, so
      // a row already sitting at (prev = count = C) with a fresh count of C is
      // unchanged by it. Velocity still settles to zero the first time a
      // growing document stops growing, because `prev` differing from the new
      // count is itself enough to write.
      const result = await db.execute(sql`
        UPDATE documents
        SET backlink_count_prev = backlink_count,
            backlink_count = ${count},
            backlink_synced_at = now(),
            updated_at = now()
        WHERE uri = ${row.uri}
          AND (backlink_count IS DISTINCT FROM ${count}
               OR backlink_count_prev IS DISTINCT FROM ${count})
      `);
      if ((result.rowCount ?? 0) > 0) updated++;
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return updated;
}

/**
 * Precompute per-document trending scores for the recency-gated candidate set.
 * Articles below the distinct-recommender floor get score 0.
 *
 * **Only rows whose score actually moved are written.** This used to open with
 * a blanket `UPDATE ... SET trending_score = 0` over every eligible document,
 * then immediately overwrite all of them with their real score. Measured, the
 * two passes targeted *the same 24,602 rows* — symmetric difference zero in
 * both directions — so every eligible document was written twice an hour, and
 * the zeroing pass alone cost 62.9s mean / 10,063s total over 6.7 days, ~3x the
 * scoring pass it was priming.
 *
 * That is expensive out of proportion to the row count because `trending_score`
 * is indexed (`documents_trending_idx`), so each write is a non-HOT update: a
 * new tuple version in *every* index on a 12GB table, including the tags GIN.
 * And of the 24,602 eligible documents only ~13 carry a non-zero score — the
 * rest were rewriting 0 over 0. The `IS DISTINCT FROM` guard on the scoring
 * update skips those; `trending_recomputed_at` stops advancing for skipped
 * rows, which is free because nothing reads that column.
 */
export async function recomputeDocumentTrending(): Promise<void> {
  const maxAge = TRENDING_MAX_AGE_DAYS;
  const minRecs = MIN_ARTICLE_RECOMMENDERS;
  const wRec = ARTICLE_BLEND.recommends;
  const wRecVel = ARTICLE_BLEND.recommendVelocity;
  const wFresh = ARTICLE_BLEND.freshness;
  const wBl = ARTICLE_BLEND.backlinks;
  const wBlVel = ARTICLE_BLEND.backlinkVelocity;
  const wPub = ARTICLE_BLEND.parentPublication;

  await db.execute(sql`
    WITH eligible AS (
      SELECT d.uri,
             d.published_at,
             d.backlink_count,
             d.backlink_count_prev,
             coalesce(st.trending_score, 0)::float8 AS pub_score
      FROM documents d
      JOIN publications p ON p.uri = d.publication_uri
      LEFT JOIN publication_stats st ON st.publication_uri = p.uri
      WHERE d.deleted = false
        AND p.deleted = false
        AND p.show_in_discover = true
        AND p.url NOT ILIKE ${EXCLUDED_PUBLICATION_URL_PATTERN}
        AND d.published_at > now() - (${maxAge}::text || ' days')::interval
        AND d.published_at <= now()
    ),
    rec AS (
      SELECT rc.document_uri,
        count(DISTINCT rc.recommender_did) AS distinct_cnt,
        coalesce(sum(
          exp(-ln(2) * extract(epoch from (now() - coalesce(rc.created_at, rc.indexed_at)))
              / 3600.0 / 30.0)
        ) FILTER (
          WHERE coalesce(rc.created_at, rc.indexed_at)
            > now() - (${maxAge}::text || ' days')::interval
        ), 0)::float8 AS decay_sum,
        count(DISTINCT rc.recommender_did) FILTER (
          WHERE coalesce(rc.created_at, rc.indexed_at) > now() - interval '24 hours'
        ) AS recent24,
        count(DISTINCT rc.recommender_did) FILTER (
          WHERE coalesce(rc.created_at, rc.indexed_at) > now() - interval '48 hours'
            AND coalesce(rc.created_at, rc.indexed_at) <= now() - interval '24 hours'
        ) AS prev24
      FROM recommends rc
      JOIN documents doc ON doc.uri = rc.document_uri
      WHERE rc.deleted = false
        AND rc.recommender_did <> doc.did
      GROUP BY rc.document_uri
    ),
    raw AS (
      SELECT e.uri,
        coalesce(r.distinct_cnt, 0)::int AS distinct_cnt,
        coalesce(r.decay_sum, 0)::float8 AS decay_sum,
        (coalesce(r.recent24, 0) - coalesce(r.prev24, 0))::float8 AS rec_vel,
        exp(-ln(2) * extract(epoch from (now() - e.published_at)) / 3600.0 / 30.0)::float8 AS freshness,
        e.backlink_count::float8 AS bl,
        greatest(e.backlink_count - e.backlink_count_prev, 0)::float8 AS bl_vel,
        e.pub_score
      FROM eligible e
      LEFT JOIN rec r ON r.document_uri = e.uri
    ),
    stats AS (
      SELECT
        coalesce(avg(ln(1 + decay_sum)), 0) AS rec_avg,
        coalesce(nullif(stddev_pop(ln(1 + decay_sum)), 0), 1) AS rec_std,
        coalesce(avg(rec_vel), 0) AS rec_vel_avg,
        coalesce(nullif(stddev_pop(rec_vel), 0), 1) AS rec_vel_std,
        coalesce(avg(freshness), 0) AS fresh_avg,
        coalesce(nullif(stddev_pop(freshness), 0), 1) AS fresh_std,
        coalesce(avg(ln(1 + bl)), 0) AS bl_avg,
        coalesce(nullif(stddev_pop(ln(1 + bl)), 0), 1) AS bl_std,
        coalesce(avg(ln(1 + bl_vel)), 0) AS bl_vel_avg,
        coalesce(nullif(stddev_pop(ln(1 + bl_vel)), 0), 1) AS bl_vel_std,
        coalesce(avg(pub_score), 0) AS pub_avg,
        coalesce(nullif(stddev_pop(pub_score), 0), 1) AS pub_std,
        count(*) FILTER (WHERE distinct_cnt >= ${minRecs}) AS qualifying
      FROM raw
    ),
    scored AS (
      SELECT r.uri,
        r.distinct_cnt,
        CASE
          WHEN r.distinct_cnt < ${minRecs} THEN 0
          WHEN s.qualifying = 0 THEN 0
          ELSE (
            ((ln(1 + r.decay_sum) - s.rec_avg) / s.rec_std) * ${wRec}
            + ((r.rec_vel - s.rec_vel_avg) / s.rec_vel_std) * ${wRecVel}
            + ((r.freshness - s.fresh_avg) / s.fresh_std) * ${wFresh}
            + ((ln(1 + r.bl) - s.bl_avg) / s.bl_std) * ${wBl}
            + ((ln(1 + r.bl_vel) - s.bl_vel_avg) / s.bl_vel_std) * ${wBlVel}
            + ((r.pub_score - s.pub_avg) / s.pub_std) * ${wPub}
          )
        END AS score
      FROM raw r
      CROSS JOIN stats s
    )
    UPDATE documents d
    SET trending_score = sc.score,
        distinct_recommender_count = sc.distinct_cnt,
        trending_recomputed_at = now()
    FROM scored sc
    WHERE d.uri = sc.uri
      AND (d.trending_score IS DISTINCT FROM sc.score
           OR d.distinct_recommender_count IS DISTINCT FROM sc.distinct_cnt)
  `);

  // Clear scores left on documents that have since fallen out of the candidate
  // set — aged past the window, unpublished, deleted, or on a publication that
  // left Discover. The old zeroing pass never did this: its predicate selected
  // *eligible* rows, so anything that aged out kept its last score forever (276
  // such rows at the time of writing, against 13 legitimately current ones).
  // Readers are unaffected either way — every trending query re-applies the
  // same recency gate — but leaving the column lying is a trap for the next
  // caller who trusts it without the gate.
  //
  // Cheap despite naming no candidate set: `documents_trending_idx` makes
  // `trending_score <> 0` an index scan over the handful of scored rows, and
  // the NOT EXISTS is a primary-key probe per row.
  await db.execute(sql`
    UPDATE documents d
    SET trending_score = 0,
        distinct_recommender_count = 0,
        trending_recomputed_at = now()
    WHERE d.trending_score <> 0
      AND NOT EXISTS (
        SELECT 1 FROM publications p
        WHERE p.uri = d.publication_uri
          AND p.deleted = false
          AND p.show_in_discover = true
          AND p.url NOT ILIKE ${EXCLUDED_PUBLICATION_URL_PATTERN}
          AND d.deleted = false
          AND d.published_at > now() - (${maxAge}::text || ' days')::interval
          AND d.published_at <= now()
      )
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
 * The Discover directory's topic chips are built from these by
 * {@link recomputeDiscoverTopicCounts}, which runs on a slower cadence — this
 * pass stays in the hourly sweep because it is ~15s and a new publication
 * should get a topic promptly.
 */
export async function recomputePublicationTopics(): Promise<void> {
  // One pass, and it writes only the publications whose dominant tag actually
  // moved. The previous shape was `UPDATE ... SET topic = NULL` (every row with
  // a topic) followed by a re-set of every ranked row — two full rewrites of
  // `publications` per sweep, plus the `updated_at` index churn behind them,
  // to change a handful of topics.
  //
  // The `LEFT JOIN top` is what lets one statement do both jobs: publications
  // that still have a dominant tag get it, and publications whose last tagged
  // document went away land on `t.tag IS NULL` and are reset. `IS DISTINCT
  // FROM` skips the rest.
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
    ),
    top AS (
      SELECT uri, tag FROM ranked WHERE rk = 1
    ),
    changed AS (
      SELECT p.uri, t.tag
      FROM publications p
      LEFT JOIN top t ON t.uri = p.uri
      WHERE p.topic IS DISTINCT FROM t.tag
    )
    UPDATE publications p
    SET topic = c.tag, updated_at = now()
    FROM changed c
    WHERE c.uri = p.uri
  `);
}

/**
 * Rebuild the network-wide topic counts behind the Discover topic filter.
 *
 * The chip list and its search read this table instead of running a ~2s
 * `unnest(tags)` aggregation on the request path. `publication_count` is a
 * distinct-publication count per tag (the UNION dedupes each publication's
 * repeated tags), matching the chip click path (`topicMatch: "document"`).
 *
 * **Diffed, not rebuilt.** This used to `DELETE FROM discover_topic_counts`
 * and re-`INSERT` the whole table inside a transaction — 1,056,381 rows, and
 * with them the primary key, the count btree, and the trigram GIN index, every
 * hour. Measured against a live snapshot, an hour of ingest moves **85 rows out
 * of 1,056,446: 20 changed, 65 new, 0 removed** (0.008%). So the sweep was
 * rewriting a million rows and three indexes to persist eighty-five.
 *
 * Now the aggregation lands in a transaction-scoped temp table and only the
 * difference is applied: `DO UPDATE ... WHERE ... IS DISTINCT FROM` skips rows
 * whose count is unchanged, so an unchanged row costs no heap write and no
 * index maintenance. Still one transaction, so concurrent readers see the prior
 * snapshot until commit and the chips never briefly empty.
 *
 * The aggregation itself is an unavoidable full scan of `documents` × their
 * tags — it is a global count, so no index can narrow it (unlike
 * `documentCarriesTagWhere`, which can). That read is why this runs on the
 * daily topic cron rather than in the hourly sweep; see `scripts/topics-cron.ts`.
 */
export async function recomputeDiscoverTopicCounts(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`
      CREATE TEMP TABLE fresh_topic_counts ON COMMIT DROP AS
      WITH eligible AS (
        SELECT p.uri, p.topic
        FROM publications p
        WHERE p.show_in_discover = true
          AND p.deleted = false
          AND p.url NOT ILIKE ${EXCLUDED_PUBLICATION_URL_PATTERN}
      ),
      pub_topic AS (
        SELECT uri, lower(btrim(topic)) AS topic
        FROM eligible
        WHERE topic IS NOT NULL AND btrim(topic) <> ''
        UNION
        SELECT e.uri, lower(btrim(tag)) AS topic
        FROM eligible e
        JOIN documents d ON d.publication_uri = e.uri AND d.deleted = false
        CROSS JOIN unnest(d.tags) AS tag
        WHERE btrim(tag) <> ''
      )
      SELECT topic, count(*)::int AS publication_count
      FROM pub_topic
      WHERE char_length(topic) BETWEEN 1 AND 128
      GROUP BY topic
    `);
    // Both statements below probe this table per row across ~1M rows; without
    // the index (and stats for it) they plan as nested-loop scans.
    await tx.execute(sql`CREATE UNIQUE INDEX ON fresh_topic_counts (topic)`);
    await tx.execute(sql`ANALYZE fresh_topic_counts`);

    await tx.execute(sql`
      DELETE FROM discover_topic_counts d
      WHERE NOT EXISTS (
        SELECT 1 FROM fresh_topic_counts f WHERE f.topic = d.topic
      )
    `);
    await tx.execute(sql`
      INSERT INTO discover_topic_counts (topic, publication_count)
      SELECT topic, publication_count FROM fresh_topic_counts
      ON CONFLICT (topic) DO UPDATE
        SET publication_count = excluded.publication_count
        WHERE discover_topic_counts.publication_count
              IS DISTINCT FROM excluded.publication_count
    `);
  });
}

/**
 * Rebuild the network-wide scalars in `network_stats`.
 *
 * Both entries are the Latest "All" tab badge: the plain corpus tally, and the
 * same tally with Bridgy Fed's bulk web-bridge mirrors removed, which is what a
 * reader with "Hide mirrored websites" on is looking at (see
 * `#/lib/exclude-web-bridge`). Computing either on the request path is an
 * unbounded `count(*)` over every document joined to publications — no index can
 * serve it, so it lands as a seq scan (~1.08s over ~1.4M rows / 2.2GB at time of
 * writing; **26.5s** for the filtered variant when its exclusions are written as
 * per-row anti-joins) on `/latest`'s blocking loader, and re-reads the whole heap
 * from storage on each call. Here it is sweep-time work; readers get a
 * single-row primary-key lookup.
 *
 * Measured on a prod-scale copy (3.0M documents), this statement runs **~4.8s**
 * against **~3.8s** for the single-count version it replaces — the second tally
 * costs about a second per sweep. Two shapes that cost considerably more, both
 * rejected:
 *
 * - **Aggregating after the `UNION ALL`** — a row-level CTE of eligibility flags
 *   with a `count(*)` branch and a `count(*) FILTER` branch over it. It reads as
 *   one pass and is not one: Postgres walks `documents` once per branch (5.7s).
 *   Hence the aggregation below happens *first*, and the `UNION ALL` only
 *   unpivots the resulting single row — which is also what guarantees the two
 *   scalars describe the same instant.
 * - **The `NOT EXISTS` spelling the read path uses**
 *   ({@link notWebBridgeArticleWhere}). Equivalent, but the read path's sits in a
 *   `WHERE`, where the planner turns it into an anti-join. As a projected boolean
 *   there is no anti-join to reach for, so it becomes a SubPlan run once per row:
 *   2.97M index searches, 8.9M buffer hits.
 *
 * The `LEFT JOIN` against an inline subquery below hashes the ~5.6k bridged repos
 * once and probes. Note the inline subquery rather than a CTE: a CTE scan is
 * parallel-restricted, which costs nothing *here* (`ON CONFLICT` already makes
 * the insert parallel-unsafe) but doubles the runtime of the same aggregate run
 * on its own — 4.9s against 2.6s — so the parallel-safe spelling is the one to
 * keep. `profiles.did` is the primary key, so neither join can duplicate a row.
 *
 * The predicate must stay in lockstep with `discoverEligibleArticleWhere` +
 * `documentPublishedNotInFuture` (and, for the filtered variant,
 * `notWebBridgeArticleWhere`) in `#/server/reader/queries` — those still define
 * what the "All" tab actually lists, and this is only its cardinality.
 */
export async function recomputeNetworkStats(): Promise<void> {
  const recomputedAt = new Date();
  await db.execute(sql`
    INSERT INTO network_stats (key, value, recomputed_at)
    SELECT stat.key, stat.value, ${recomputedAt}
    FROM (
      SELECT
        coalesce(d.lang, ${UNTAGGED_LANGUAGE_KEY}) AS lang,
        GROUPING(d.lang) AS is_total,
        count(*) AS all_documents,
        count(*) FILTER (
          WHERE wba.did IS NULL AND wbp.did IS NULL
        ) AS documents_without_web_bridge
      FROM documents d
      LEFT JOIN publications p ON p.uri = d.publication_uri
      LEFT JOIN (
        SELECT did FROM profiles WHERE handle ILIKE ${WEB_BRIDGE_HANDLE_PATTERN}
      ) wba ON wba.did = d.did
      LEFT JOIN (
        SELECT did FROM profiles WHERE handle ILIKE ${WEB_BRIDGE_HANDLE_PATTERN}
      ) wbp ON wbp.did = p.did
      WHERE d.deleted = false
        AND (d.published_at IS NULL OR d.published_at <= now())
        AND (
          p.uri IS NULL
          OR (
            p.deleted = false
            AND p.show_in_discover = true
            AND p.url NOT ILIKE ${EXCLUDED_PUBLICATION_URL_PATTERN}
          )
        )
      -- One scan, two levels: the grand total (the two headline scalars) and
      -- the per-language breakdown the language filter's badge sums. GROUPING()
      -- is 1 for the rollup row and 0 for the per-language ones.
      GROUP BY GROUPING SETS ((), (d.lang))
    ) totals
    CROSS JOIN LATERAL (VALUES
      (
        CASE WHEN totals.is_total = 1
          THEN ${NETWORK_DOCUMENT_COUNT_KEY}
          ELSE ${NETWORK_DOCUMENT_COUNT_KEY} || '_lang:' || totals.lang
        END,
        totals.all_documents
      ),
      (
        CASE WHEN totals.is_total = 1
          THEN ${NETWORK_DOCUMENT_COUNT_NO_WEB_BRIDGE_KEY}
          ELSE ${NETWORK_DOCUMENT_COUNT_NO_WEB_BRIDGE_KEY} || '_lang:' || totals.lang
        END,
        totals.documents_without_web_bridge
      )
    ) AS stat(key, value)
    ON CONFLICT (key) DO UPDATE
      SET value = excluded.value, recomputed_at = excluded.recomputed_at
  `);

  // A language whose last document was deleted stops appearing in the scan, and
  // its row would otherwise sit there forever asserting a count that is no
  // longer true. Anything this run did not touch no longer exists.
  await db.delete(networkStats).where(
    and(
      // `starts_with`, not LIKE: every one of these keys is full of
      // underscores, and LIKE would read each as a single-character wildcard.
      or(
        sql`starts_with(${networkStats.key}, ${`${NETWORK_DOCUMENT_COUNT_KEY}_lang:`})`,
        sql`starts_with(${networkStats.key}, ${`${NETWORK_DOCUMENT_COUNT_NO_WEB_BRIDGE_KEY}_lang:`})`,
      ),
      sql`${networkStats.recomputedAt} < ${recomputedAt}`,
    ),
  );
}

/**
 * Derive `publications.serial_kind` for serial publications — the ones whose
 * publisher set `preferences.prevNextDirection = "ltr"`, declaring that the
 * publication reads forwards from its first post (see
 * `#/lib/publication/serial`).
 *
 * The classification itself lives in `deriveSerialKind`
 * (`#/server/reader/series`), shared with the on-demand read path so a
 * publication can't be judged one way by the sweep and another way on a page
 * load. This pass is the safety net that keeps every serial current as its posts
 * change; the read path only ever classifies one that has never been judged.
 *
 * Only serial publications are sampled — there are few of them, and `content_json`
 * is large per row — and `serial_kind` is cleared on any publication that is no
 * longer a serial so a preference flipped back to `"rtl"` doesn't linger.
 */
const SERIAL_KIND_CONCURRENCY = 6;

export async function recomputeSerialKinds(): Promise<void> {
  // A publication that stopped being a serial keeps no derived kind.
  await db
    .update(publications)
    .set({ serialKind: null })
    .where(
      and(
        isNotNull(publications.serialKind),
        or(
          isNull(publications.prevNextDirection),
          sql`${publications.prevNextDirection} <> ${SERIAL_DIRECTION}`,
        ),
      ),
    );

  const serials = await db
    .select({ uri: publications.uri })
    .from(publications)
    .where(
      and(
        eq(publications.prevNextDirection, SERIAL_DIRECTION),
        eq(publications.deleted, false),
      ),
    );

  // Each classification samples up to 40 bodies, so the rows are wide; a few in
  // flight hides the round trips without pulling a lot of `content_json` into
  // memory at once.
  await mapWithConcurrency(serials, SERIAL_KIND_CONCURRENCY, ({ uri }) =>
    deriveSerialKind(db, schema, uri),
  );
}

/**
 * Fill or refresh `documents.text_content` from record text plus structured
 * content blocks so GIN search covers full article bodies.
 *
 * The stored column is itself the output of this function, so each row's text
 * is first run through `repairCompoundedSearchText` to strip the duplicate
 * extracted-text copies an earlier (non-idempotent) version of this backfill
 * appended on every run. With that and containment-based dedupe in
 * `documentSearchText`, re-running this is a fixed point.
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
    cursor = rows.at(-1)?.uri ?? null;

    for (const row of rows) {
      const base = row.textContent
        ? repairCompoundedSearchText(
            row.textContent,
            documentExtractedText(row.contentJson, row.contentFormat),
          )
        : row.textContent;
      const next = documentSearchText({
        textContent: base,
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
    cursor = rows.at(-1)?.uri ?? null;

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
 * Tag documents the language detector has never looked at.
 *
 * `upsertDocument` detects on write in the ingest worker, so in steady state
 * this pass finds little: the rows that predate language tagging, the ones the
 * web server indexed on demand (it never loads the model — see
 * `#/server/lang/glotlid`), and the handful ingest can still leave behind (a
 * body that arrived out of order, a write that raced a deploy). The work queue
 * is `lang_detected_at IS NULL`, served by the partial
 * `documents_lang_pending_idx`, so the query cost shrinks toward zero as the
 * corpus is covered rather than scanning 3.4M rows every hour.
 *
 * **Bounded on purpose.** Detection is ~0.3 ms of CPU per document plus the
 * read, and this runs in the ingest worker, in front of the live stream.
 * {@link LANGUAGE_SWEEP_CAP} is what keeps a cold corpus from monopolising a
 * sweep; the initial pass over an existing corpus belongs in
 * `scripts/backfill-document-languages.ts`, which can take as long as it likes.
 *
 * Stamps `lang_detected_at` whether or not a language came out, so a document
 * with nothing detectable in it is examined once and never again. Idempotent.
 * Returns how many documents were examined.
 */
export async function backfillDocumentLanguages(
  opts: {
    /** Stop after this many documents. The sweep's cap by default. */
    limit?: number;
    /** Called after each batch, for the backfill script's progress line. */
    onProgress?: (examined: number) => void;
  } = {},
): Promise<number> {
  await loadGlotlid();
  const limit = opts.limit ?? LANGUAGE_SWEEP_CAP;
  const READ_BATCH = 500;
  let examined = 0;

  while (examined < limit) {
    const rows = await db
      .select({
        description: documents.description,
        textContent: documents.textContent,
        title: documents.title,
        uri: documents.uri,
      })
      .from(documents)
      .where(
        and(eq(documents.deleted, false), isNull(documents.langDetectedAt)),
      )
      .orderBy(desc(documents.publishedAt))
      .limit(Math.min(READ_BATCH, limit - examined));

    if (rows.length === 0) break;

    await writeLanguageColumns(
      rows.map((row) => ({
        uri: row.uri,
        // Never `undefined` here: the model was loaded above.
        ...languageColumns(detectDocumentLanguage(row)),
      })),
    );

    examined += rows.length;
    opts.onProgress?.(examined);
    if (rows.length < READ_BATCH) break;
  }

  if (examined > 0) {
    logEvent("ingest.languageSweep", { examined });
  }
  return examined;
}

/**
 * Write per-document language columns in one statement per chunk.
 *
 * Every row carries its own confidence, so rows can't be grouped into one
 * UPDATE per language; a `VALUES` list joined on `uri` keeps it to a single
 * round trip per {@link WRITE_CHUNK} rows instead of one per document — the
 * difference that matters when the database is a continent away from the
 * worker.
 */
async function writeLanguageColumns(
  rows: Array<{
    uri: string;
    lang: string | null;
    langConfidence: number | null;
    langDetectedAt: Date | null;
    langSource: string | null;
  }>,
): Promise<void> {
  const WRITE_CHUNK = 250;
  for (let i = 0; i < rows.length; i += WRITE_CHUNK) {
    const part = rows.slice(i, i + WRITE_CHUNK);
    const values = sql.join(
      part.map(
        (row) =>
          sql`(${row.uri}, ${row.lang}::text, ${row.langConfidence}::double precision, ${row.langSource}::text, ${row.langDetectedAt?.toISOString() ?? null}::timestamptz)`,
      ),
      sql`, `,
    );
    await db.execute(sql`
      update documents as d
      set lang = v.lang,
          lang_confidence = v.lang_confidence,
          lang_source = v.lang_source,
          lang_detected_at = v.lang_detected_at
      from (values ${values}) as v(uri, lang, lang_confidence, lang_source, lang_detected_at)
      where d.uri = v.uri
    `);
  }
}

/**
 * Ask Jev about the documents GlotLID wasn't sure of.
 *
 * The queue is `lang_source = 'glotlid-unsure'` (~2% of documents), served by
 * `documents_lang_tiebreak_idx`. Each call is one Jev request (~1,400 input
 * tokens, fractions of a cent); {@link JEV_TIEBREAK_CAP} bounds a sweep to a few
 * minutes and a few cents even when a backfill has just queued thousands.
 *
 * A failed call leaves the document queued for the next sweep; a run of them
 * ends this one early rather than burning the sweep on an outage. A call that
 * *succeeds* is terminal (`lang_source = 'jev'`) whatever it says, so a
 * document neither model can place is asked about once, not every hour.
 *
 * No-op when `JEV_API_KEY` isn't set. Returns how many documents were settled.
 */
export async function tiebreakDocumentLanguages(
  opts: {
    /** Stop after this many documents. The sweep's cap by default. */
    limit?: number;
    onProgress?: (settled: number) => void;
  } = {},
): Promise<number> {
  if (!isJevConfigured()) return 0;
  const limit = opts.limit ?? JEV_TIEBREAK_CAP;
  const READ_BATCH = 100;
  const CONCURRENCY = 4;
  const MAX_CONSECUTIVE_FAILURES = 10;
  let settled = 0;
  let failures = 0;
  let consecutiveFailures = 0;
  const skipped = new Set<string>();

  while (settled + skipped.size < limit) {
    const rows = await db
      .select({
        description: documents.description,
        textContent: documents.textContent,
        title: documents.title,
        uri: documents.uri,
      })
      .from(documents)
      .where(
        and(
          eq(documents.deleted, false),
          eq(documents.langSource, "glotlid-unsure"),
          skipped.size > 0
            ? sql`${documents.uri} not in (${sql.join(
                [...skipped].map((uri) => sql`${uri}`),
                sql`, `,
              )})`
            : undefined,
        ),
      )
      .orderBy(desc(documents.publishedAt))
      .limit(Math.min(READ_BATCH, limit - settled - skipped.size));
    if (rows.length === 0) break;

    const verdicts = await mapWithConcurrency(
      rows,
      CONCURRENCY,
      async (row) => {
        if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) return;
        const verdict = await jevLanguage(documentLanguageSample(row));
        if (verdict) consecutiveFailures = 0;
        else consecutiveFailures += 1;
        return verdict;
      },
    );

    const writes: Parameters<typeof writeLanguageColumns>[0] = [];
    for (const [i, row] of rows.entries()) {
      const verdict = verdicts[i];
      if (!verdict) {
        failures += 1;
        skipped.add(row.uri);
        continue;
      }
      writes.push({
        lang: verdict.code,
        langConfidence: Number(verdict.probability.toFixed(3)),
        langDetectedAt: new Date(),
        langSource: "jev",
        uri: row.uri,
      });
    }
    await writeLanguageColumns(writes);
    settled += writes.length;
    opts.onProgress?.(settled);

    if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) break;
    if (rows.length < READ_BATCH) break;
  }

  if (settled > 0 || failures > 0) {
    logEvent("ingest.languageTiebreak", { failures, settled });
  }
  return settled;
}

/**
 * Repair `profiles.handle` for actors stranded without a usable handle —
 * `null`, or the `handle.invalid` sentinel a relay emits when it can't verify a
 * handle at that instant. Once persisted, that placeholder never refreshed on
 * its own and leaked into every denormalized `ownerHandle` copied off the row
 * (issue #4). We re-resolve each affected DID straight from its DID document
 * (forced, bypassing any stale cache entry) and write back the real handle.
 *
 * Idempotent and cron-safe: only rows still lacking a usable handle are read,
 * and a row is written only when resolution produces a different, usable handle.
 * Returns how many profiles were updated.
 */
export async function backfillActorHandles(): Promise<number> {
  const BATCH_SIZE = 100;
  let cursor: string | null = null;
  let updated = 0;

  for (;;) {
    const staleHandle = or(
      isNull(profiles.handle),
      eq(profiles.handle, INVALID_HANDLE),
    );
    const rows = await db
      .select({ did: profiles.did, handle: profiles.handle })
      .from(profiles)
      .where(
        cursor == null
          ? staleHandle
          : and(staleHandle, gt(profiles.did, cursor)),
      )
      .orderBy(asc(profiles.did))
      .limit(BATCH_SIZE);

    if (rows.length === 0) break;
    cursor = rows.at(-1)?.did ?? null;

    for (const row of rows) {
      const identity = await refreshIdentity(row.did);
      if (!isUsableHandle(identity.handle)) continue;
      if (identity.handle === row.handle) continue;
      await db
        .update(profiles)
        .set({ handle: identity.handle, updatedAt: new Date() })
        .where(eq(profiles.did, row.did));
      updated++;
    }

    if (rows.length < BATCH_SIZE) break;
  }

  return updated;
}

/**
 * Publication dedup groups checked at once. `reconcilePublicationGroup` now
 * verifies candidates against the repo (a network round trip per group), so
 * unlike the rest of this sweep it's no longer pure DB work — a handful in
 * flight bounds sweep latency without hammering PDSes, mirroring the
 * `RECONCILE_CONCURRENCY` used for the same kind of repo check elsewhere.
 */
const PUBLICATION_DEDUP_CONCURRENCY = 8;

/**
 * Duplicate-publication groups verified against the repo per sweep.
 *
 * `recompute-cron` triggers this over plain `fetch` with no client timeout
 * (`scripts/recompute-cron.mjs`), and the sweep runs synchronously inside
 * `recomputeDerived()` ahead of every other step — so an unbounded number of
 * per-group PDS checks can push the whole request past whatever timeout sits
 * between the trigger and the ingest worker (undici's ~5-minute default,
 * observed as the cron "crashing" a few minutes after its container reported
 * healthy). Capping the batch bounds worst-case latency the same way
 * `RECONCILE_BATCH_DEFAULT` bounds the repo round-robin; leftover groups are
 * simply picked up on the next hourly pass — this function is a safety net,
 * not the hot-path dedup, so a group sitting un-collapsed for one more hour
 * is not user-visible.
 */
const PUBLICATION_DEDUP_BATCH = 100;

/**
 * Collapse duplicate publications (`did, url`) and documents (`did, cid`) to a
 * single canonical row each. Repairs existing data and acts as a safety net for
 * the hot-path dedup. Returns how many duplicate groups were reconciled.
 */
export async function dedupeRecords(): Promise<{
  publications: number;
  documents: number;
}> {
  // Group on the trailing-slash-normalized url: re-created publication records
  // arrive as slash variants of the same site (`https://x.com/` vs
  // `https://x.com`) and must collapse into one group.
  const normalizedUrl = sql<string>`rtrim(${publications.url}, '/')`;
  const allPubGroups = await db
    .select({ did: publications.did, url: normalizedUrl })
    .from(publications)
    .where(eq(publications.deleted, false))
    .groupBy(publications.did, normalizedUrl)
    .having(sql`count(*) > 1`);
  const pubGroups = allPubGroups.slice(0, PUBLICATION_DEDUP_BATCH);
  if (allPubGroups.length > pubGroups.length) {
    logEvent("ingest.publicationDedupBatchCapped", {
      checked: pubGroups.length,
      ok: true,
      total: allPubGroups.length,
    });
  }
  // Best-effort per group: reconcilePublicationGroup now checks the repo
  // before collapsing anything, so a single unreachable PDS or slow lookup
  // must not abort the rest of the sweep (or the recompute run it's part
  // of) — a failed group is simply retried on the next hourly pass.
  await mapWithConcurrency(
    pubGroups,
    PUBLICATION_DEDUP_CONCURRENCY,
    async (group) => {
      try {
        await reconcilePublicationGroup(group.did, group.url);
      } catch (error: unknown) {
        logEvent("ingest.publicationDedup", {
          did: group.did,
          error: error instanceof Error ? error.message : String(error),
          ok: false,
          url: group.url,
        });
      }
    },
  );

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

/** Run the full derived-data recompute (trending + discovery graphs). */
export async function recomputeDerived(): Promise<void> {
  // Replay events dropped by transient DB failures so the sweep computes over
  // complete data; failures stay dead-lettered and retry next sweep.
  try {
    await replayDeadLetters();
  } catch {
    // Replay is best-effort; the rows persist and the next sweep retries.
  }
  // The PDS round-robin used to run here too, a batch per sweep. It moved to
  // its own cron service (`scripts/reconcile-repos-cron.ts`): repairing a repo
  // means enumerating it and rewriting every changed record, and doing that
  // inside the ingest worker put the repair in direct competition with the live
  // tap stream it exists to backstop — the worker sits pinned at its in-flight
  // cap as it is. Nothing schedules repair from this process any more.

  // Re-resolve any actor stranded at `null`/`handle.invalid` so a handle change
  // that never arrived as a usable identity event still self-heals (issue #4).
  try {
    await backfillActorHandles();
  } catch {
    // Best-effort; only stale-handle rows are touched and the next sweep retries.
  }
  // Dedup first so stats/aggregates compute over canonical rows only.
  await dedupeRecords();
  try {
    await recomputeDocumentBacklinks();
  } catch {
    // Backlink counts stay as-is; the next recompute retries.
  }
  await recomputePublicationStats();
  await recomputeCosubscriptions();
  await recomputeCorecommends();
  await recomputePublicationTopics();
  // Topic derivation is deliberately NOT here — it clusters the whole tag
  // graph and calls the naming model, which is minutes of work whose output
  // barely moves hour to hour. It runs on its own daily schedule instead;
  // see `scripts/topics-cron.ts`.
  //
  // `recomputeDiscoverTopicCounts()` moved there too, for the same reason: its
  // aggregation is a full `documents` × tags scan (~119s, the single most
  // expensive statement in this sweep) and an hour of ingest moves 85 of its
  // 1.05M rows. Hourly bought nothing and put two minutes of scan in front of
  // live traffic every hour.
  await recomputeSerialKinds();
  try {
    await backfillDocumentLanguages();
    await tiebreakDocumentLanguages();
  } catch {
    // Best-effort: an untagged document is shown to everyone rather than
    // hidden from anyone, so falling behind here costs nothing a reader sees.
    // The next sweep picks up the same queue.
  }
  await recomputeDocumentTrending();
  // Last: dedup + the passes above are what change the eligible-document set,
  // so counting here records the sweep's final state rather than a mid-sweep one.
  await recomputeNetworkStats();
}

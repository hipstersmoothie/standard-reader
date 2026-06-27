import type { Db, Schema } from "#/integrations/tanstack-query/api-shapes";
import type {
  CollectionColophon,
  CollectionEditorial,
} from "#/lib/collections/manifest";
import type { CollectionTheme } from "#/lib/collections/theme";
import type { ThemeMode } from "#/lib/theme";
import type { ArticleDetailSourceRow } from "#/server/reader/article-detail-build";

import { publicationLinkParams } from "#/components/reader/format";
import { collectionManifestForOwner } from "#/lib/collections/resolve-manifest";
import { MAX_MAGAZINE_FEATURES } from "#/magazine/constants";
import {
  getAtprotoSessionForRequest,
  getReaderContextForRequest,
} from "#/middleware/auth-session.server";
import { authorPds } from "#/server/atproto/identity";
import { parseAtUri } from "#/server/atproto/uri";
import {
  buildArticleDetail,
  manifestFromCollectionRow,
} from "#/server/reader/article-detail-build";
import { themeModeForRequest } from "#/server/theme-preference";
import { sql } from "drizzle-orm";

type BundleKind = "collection" | "feature";

type BundleSqlRow = {
  kind: BundleKind;
  feature_note: string | null;
  feature_ord: number;
  uri: string;
  did: string;
  title: string;
  description: string | null;
  path: string | null;
  canonical_url: string | null;
  cover_image_cid: string | null;
  published_at: Date | string;
  record_updated_at: Date | string | null;
  featured: boolean;
  tags: Array<string> | null;
  content_json: unknown;
  content_format: string | null;
  collection_json: unknown;
  text_content: string | null;
  bsky_post_uri: string | null;
  bsky_post_cid: string | null;
  publication_uri: string | null;
  pub_uri: string | null;
  pub_did: string | null;
  pub_name: string | null;
  pub_url: string | null;
  pub_description: string | null;
  pub_icon_cid: string | null;
  pub_theme_background: string | null;
  pub_theme_foreground: string | null;
  pub_theme_accent: string | null;
  pub_theme_accent_foreground: string | null;
  pub_theme_json: unknown;
  pub_owner_avatar_url: string | null;
  pub_owner_handle: string | null;
  pub_owner_display_name: string | null;
  pub_topic: string | null;
  pub_verified: boolean | null;
  pub_subscriber_count: number | null;
  pub_document_count: number | null;
  pub_last_document_at: Date | string | null;
  author_pds: string | null;
  contrib_did: string | null;
  contrib_role: string | null;
  contrib_display_name: string | null;
  contrib_profile_display_name: string | null;
  contrib_handle: string | null;
  contrib_avatar_url: string | null;
};

type LocalContributor = {
  did: string;
  role: string | null;
  displayName: string | null;
  handle: string | null;
  avatarUrl: string | null;
};

export interface CollectionMagazineFeature {
  detail: Awaited<ReturnType<typeof buildArticleDetail>>;
  note: string | null;
}

export interface CollectionMagazineData {
  name: string;
  publicationName: string | null;
  publicationUri: string | null;
  publicationParams: { did: string; rkey: string } | null;
  ownerHandle: string | null;
  editorial: CollectionEditorial | null;
  colophon: CollectionColophon | null;
  coverImageUrl: string | null;
  theme: CollectionTheme | null;
  /** Full collection document — seeds the article cache for reader view. */
  collectionDoc: Awaited<ReturnType<typeof buildArticleDetail>>;
  features: Array<CollectionMagazineFeature>;
}

function toDate(value: Date | string | null | undefined): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return value;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function mapSqlRowToSource(row: BundleSqlRow): ArticleDetailSourceRow {
  const publishedAt = toDate(row.published_at);
  if (!publishedAt) {
    throw new Error(`Missing published_at for document ${row.uri}`);
  }

  return {
    uri: row.uri,
    did: row.did,
    title: row.title,
    description: row.description,
    path: row.path,
    canonicalUrl: row.canonical_url,
    coverImageCid: row.cover_image_cid,
    publishedAt,
    recordUpdatedAt: toDate(row.record_updated_at),
    featured: row.featured,
    tags: row.tags,
    contentJson: row.content_json,
    contentFormat: row.content_format,
    collectionJson: row.collection_json,
    textContent: row.text_content,
    bskyPostUri: row.bsky_post_uri,
    bskyPostCid: row.bsky_post_cid,
    publicationUri: row.publication_uri,
    pubUri: row.pub_uri,
    pubDid: row.pub_did,
    pubName: row.pub_name,
    pubUrl: row.pub_url,
    pubDescription: row.pub_description,
    pubIconCid: row.pub_icon_cid,
    pubThemeBackground: row.pub_theme_background,
    pubThemeForeground: row.pub_theme_foreground,
    pubThemeAccent: row.pub_theme_accent,
    pubThemeAccentForeground: row.pub_theme_accent_foreground,
    pubThemeJson: row.pub_theme_json,
    pubOwnerAvatarUrl: row.pub_owner_avatar_url,
    pubOwnerHandle: row.pub_owner_handle,
    pubOwnerDisplayName: row.pub_owner_display_name,
    pubTopic: row.pub_topic,
    pubVerified: row.pub_verified,
    pubSubscriberCount: row.pub_subscriber_count,
    pubDocumentCount: row.pub_document_count,
    pubLastDocumentAt: toDate(row.pub_last_document_at),
  };
}

function contributorFromRow(row: BundleSqlRow): LocalContributor | null {
  if (!row.contrib_did) return null;
  return {
    did: row.contrib_did,
    role: row.contrib_role,
    displayName: row.contrib_display_name ?? row.contrib_profile_display_name,
    handle: row.contrib_handle,
    avatarUrl: row.contrib_avatar_url,
  };
}

/**
 * One SQL round trip: collection row + manifest feature rows + publication
 * joins + contributors. Content resolution and Shiki run afterward in-process.
 */
async function fetchCollectionMagazineRows(
  db: Db,
  collectionUri: string,
  maxFeatures: number,
): Promise<Array<BundleSqlRow>> {
  const result = await db.execute(sql`
    WITH coll AS (
      SELECT *
      FROM documents
      WHERE uri = ${collectionUri}
        AND deleted = false
      LIMIT 1
    ),
    features AS (
      SELECT
        nullif(btrim(item->>'document'), '') AS uri,
        nullif(btrim(item->>'note'), '') AS note,
        ordinality::int AS ord
      FROM coll,
      LATERAL jsonb_array_elements(
        CASE
          WHEN jsonb_typeof(coll.collection_json->'items') = 'array'
            THEN coll.collection_json->'items'
          ELSE '[]'::jsonb
        END
      ) WITH ORDINALITY AS t(item, ordinality)
      WHERE ordinality <= ${maxFeatures}
    ),
    bundle AS (
      SELECT
        'collection'::text AS kind,
        coll.uri,
        NULL::text AS feature_note,
        0 AS feature_ord
      FROM coll
      UNION ALL
      SELECT
        'feature'::text,
        f.uri,
        f.note,
        f.ord
      FROM features f
      WHERE f.uri IS NOT NULL
    )
    SELECT
      b.kind,
      b.feature_note,
      b.feature_ord,
      d.uri,
      d.did,
      d.title,
      d.description,
      d.path,
      d.canonical_url,
      d.cover_image_cid,
      d.published_at,
      d.record_updated_at,
      d.featured,
      d.tags,
      d.content_json,
      d.content_format,
      d.collection_json,
      d.text_content,
      d.bsky_post_uri,
      d.bsky_post_cid,
      d.publication_uri,
      p.uri AS pub_uri,
      p.did AS pub_did,
      p.name AS pub_name,
      p.url AS pub_url,
      p.description AS pub_description,
      p.icon_cid AS pub_icon_cid,
      p.theme_background AS pub_theme_background,
      p.theme_foreground AS pub_theme_foreground,
      p.theme_accent AS pub_theme_accent,
      p.theme_accent_foreground AS pub_theme_accent_foreground,
      p.theme_json AS pub_theme_json,
      pr_pub.avatar_url AS pub_owner_avatar_url,
      pr_pub.handle AS pub_owner_handle,
      pr_pub.display_name AS pub_owner_display_name,
      p.topic AS pub_topic,
      p.verified AS pub_verified,
      st.subscriber_count AS pub_subscriber_count,
      st.document_count AS pub_document_count,
      st.last_document_at AS pub_last_document_at,
      pr_author.pds AS author_pds,
      dc.did AS contrib_did,
      dc.role AS contrib_role,
      dc.display_name AS contrib_display_name,
      pr_contrib.display_name AS contrib_profile_display_name,
      pr_contrib.handle AS contrib_handle,
      pr_contrib.avatar_url AS contrib_avatar_url
    FROM bundle b
    INNER JOIN documents d ON d.uri = b.uri AND d.deleted = false
    LEFT JOIN publications p ON p.uri = d.publication_uri
    LEFT JOIN publication_stats st ON st.publication_uri = p.uri
    LEFT JOIN profiles pr_pub ON pr_pub.did = p.did
    LEFT JOIN profiles pr_author ON pr_author.did = d.did
    LEFT JOIN document_contributors dc ON dc.document_uri = d.uri
    LEFT JOIN profiles pr_contrib ON pr_contrib.did = dc.did
    WHERE b.kind = 'collection'
      OR d.published_at <= now()
    ORDER BY b.feature_ord, dc.did
  `);

  return result.rows as Array<BundleSqlRow>;
}

type GroupedBundleDoc = {
  kind: BundleKind;
  featureNote: string | null;
  featureOrd: number;
  row: ArticleDetailSourceRow;
  authorPdsFromProfile: string | null;
  contributors: Array<LocalContributor>;
};

function groupBundleRows(rows: Array<BundleSqlRow>): Array<GroupedBundleDoc> {
  const byUri = new Map<string, GroupedBundleDoc>();

  for (const sqlRow of rows) {
    let grouped = byUri.get(sqlRow.uri);
    if (!grouped) {
      grouped = {
        kind: sqlRow.kind,
        featureNote: sqlRow.kind === "feature" ? sqlRow.feature_note : null,
        featureOrd: sqlRow.feature_ord,
        row: mapSqlRowToSource(sqlRow),
        authorPdsFromProfile: sqlRow.author_pds,
        contributors: [],
      };
      byUri.set(sqlRow.uri, grouped);
    }

    const contributor = contributorFromRow(sqlRow);
    if (contributor) {
      grouped.contributors.push(contributor);
    }
  }

  return [...byUri.values()].toSorted((a, b) => a.featureOrd - b.featureOrd);
}

async function resolveAuthorPdsEndpoints(
  docs: Array<GroupedBundleDoc>,
): Promise<Map<string, string | null>> {
  const byDid = new Map<string, string | null>();
  for (const doc of docs) {
    if (!byDid.has(doc.row.did)) {
      byDid.set(doc.row.did, doc.authorPdsFromProfile);
    }
  }

  await Promise.all(
    [...byDid.entries()].map(async ([did, pds]) => {
      byDid.set(did, await authorPds(did, pds));
    }),
  );

  return byDid;
}

export async function loadCollectionMagazine(
  db: Db,
  schema: Schema,
  collectionUri: string,
  request: Request,
  maxFeatures: number = MAX_MAGAZINE_FEATURES,
): Promise<CollectionMagazineData | null> {
  const rows = await fetchCollectionMagazineRows(
    db,
    collectionUri,
    maxFeatures,
  );
  const grouped = groupBundleRows(rows);
  const collectionEntry = grouped.find((doc) => doc.kind === "collection");
  if (!collectionEntry) return null;

  const reader = await getReaderContextForRequest(request);
  let manifest = manifestFromCollectionRow(collectionEntry.row);
  if (!manifest) return null;

  if (reader && reader.did === collectionEntry.row.did) {
    const parsed = parseAtUri(collectionEntry.row.uri);
    if (parsed) {
      // Only now — when the reader owns this collection — do we pay for
      // the PDS client restore to read the manifest from their repo.
      const session = await getAtprotoSessionForRequest(request);
      if (session?.client) {
        const freshManifest = await collectionManifestForOwner(
          session.client,
          collectionEntry.row.did,
          parsed.rkey,
          manifest,
        );
        if (freshManifest) {
          manifest = freshManifest;
          collectionEntry.row = {
            ...collectionEntry.row,
            collectionJson: freshManifest,
          };
        }
      }
    }
  }

  const themeMode: ThemeMode = await themeModeForRequest(
    db,
    schema,
    reader?.userId,
  );
  const authorPdsByDid = await resolveAuthorPdsEndpoints(grouped);

  const builtByUri = new Map<
    string,
    Awaited<ReturnType<typeof buildArticleDetail>>
  >();
  await Promise.all(
    grouped.map(async (doc) => {
      const detail = await buildArticleDetail(
        db,
        schema,
        doc.row,
        doc.contributors,
        authorPdsByDid.get(doc.row.did) ?? null,
        themeMode,
        {
          skipSocialCounts: true,
        },
      );
      builtByUri.set(doc.row.uri, detail);
    }),
  );

  const collectionDoc = builtByUri.get(collectionEntry.row.uri);
  if (!collectionDoc) return null;

  const features = grouped
    .filter((doc) => doc.kind === "feature")
    .map((doc) => {
      const detail = builtByUri.get(doc.row.uri);
      if (!detail) return null;
      return { detail, note: doc.featureNote };
    })
    .filter((f): f is CollectionMagazineFeature => f != null);

  const publicationUri = collectionDoc.publicationUri;
  return {
    name:
      collectionDoc.title || collectionDoc.publication?.name || "Collection",
    publicationName: collectionDoc.publication?.name ?? null,
    publicationUri,
    publicationParams: publicationUri
      ? publicationLinkParams(publicationUri)
      : null,
    ownerHandle: collectionDoc.publicationOwnerHandle,
    editorial: manifest.editorial ?? null,
    colophon: manifest.colophon ?? null,
    coverImageUrl: collectionDoc.coverImageUrl,
    theme: collectionDoc.collectionTheme,
    collectionDoc,
    features,
  };
}

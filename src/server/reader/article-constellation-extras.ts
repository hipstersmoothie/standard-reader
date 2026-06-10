import type { db } from "#/db/index.server";
import type * as schema from "#/db/schema";
import type { ArticleCard } from "#/integrations/tanstack-query/api-shapes";
import type { ConstellationBacklinkRecord } from "#/server/atproto/constellation";

import {
  COSMIK_CONNECTION_COLLECTION,
  getCitationBacklinksForTarget,
  getCosmikConnectionBacklinksForTarget,
} from "#/server/atproto/constellation";
import { fetchRepoRecord } from "#/server/atproto/fetch-record";
import { resolveIdentity } from "#/server/atproto/identity";
import { selectArticleCardsByUris } from "#/server/reader/queries";
import { and, eq, inArray } from "drizzle-orm";

export interface MarginConnectionItem {
  article: ArticleCard;
  connectionType: string;
  connectionLabel: string;
  createdAt: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function linkTargetVariants(url: string): Array<string> {
  const trimmed = url.trim();
  if (!trimmed) return [];

  const variants = new Set<string>([trimmed]);
  try {
    const parsed = new URL(trimmed);
    if (!parsed.search && !parsed.hash) {
      if (trimmed.endsWith("/")) {
        variants.add(trimmed.replace(/\/+$/, "") || trimmed);
      } else {
        variants.add(`${trimmed}/`);
      }
    }
  } catch {
    // Keep the original target when it is not a parseable absolute URL.
  }

  return [...variants];
}

function recordUri(record: ConstellationBacklinkRecord): string {
  return `at://${record.did}/${record.collection}/${record.rkey}`;
}

function formatConnectionLabel(connectionType: string): string {
  const normalized = connectionType.trim().toLowerCase().replaceAll("_", " ");
  if (!normalized) return "Connected";
  return normalized.replaceAll(/\b\w/g, (char) => char.toUpperCase());
}

function dedupeRecords(
  recordSets: Array<Array<ConstellationBacklinkRecord>>,
): Array<ConstellationBacklinkRecord> {
  const seen = new Set<string>();
  const merged: Array<ConstellationBacklinkRecord> = [];

  for (const records of recordSets) {
    for (const record of records) {
      const key = recordUri(record);
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(record);
    }
  }

  return merged;
}

async function discoverCitationRecords(
  urls: Array<string>,
): Promise<Array<ConstellationBacklinkRecord>> {
  const linkTargets = [
    ...new Set(urls.flatMap((url) => linkTargetVariants(url))),
  ];
  if (linkTargets.length === 0) return [];

  const backlinkSets = await Promise.all(
    linkTargets.map((target) => getCitationBacklinksForTarget(target)),
  );
  return dedupeRecords(backlinkSets);
}

async function discoverCosmikConnectionRecords(
  urls: Array<string>,
): Promise<Array<ConstellationBacklinkRecord>> {
  const linkTargets = [
    ...new Set(urls.flatMap((url) => linkTargetVariants(url))),
  ];
  if (linkTargets.length === 0) return [];

  const backlinkSets = await Promise.all(
    linkTargets.map((target) => getCosmikConnectionBacklinksForTarget(target)),
  );
  return dedupeRecords(backlinkSets);
}

async function documentUrisByCanonicalUrls(
  dbClient: typeof db,
  schemaModule: typeof schema,
  urls: Array<string>,
): Promise<Map<string, string>> {
  const variants = [...new Set(urls.flatMap((url) => linkTargetVariants(url)))];
  if (variants.length === 0) return new Map();

  const d = schemaModule.documents;
  const rows = await dbClient
    .select({ uri: d.uri, canonicalUrl: d.canonicalUrl })
    .from(d)
    .where(and(eq(d.deleted, false), inArray(d.canonicalUrl, variants)));

  const byUrl = new Map<string, string>();
  for (const row of rows) {
    if (!row.canonicalUrl) continue;
    byUrl.set(row.canonicalUrl, row.uri);
    for (const variant of linkTargetVariants(row.canonicalUrl)) {
      byUrl.set(variant, row.uri);
    }
  }

  return byUrl;
}

interface ParsedCosmikConnection {
  sourceUrl: string;
  connectionType: string;
  createdAt: string;
}

async function loadCosmikConnection(
  record: ConstellationBacklinkRecord,
): Promise<ParsedCosmikConnection | null> {
  if (record.collection !== COSMIK_CONNECTION_COLLECTION) return null;

  const identity = await resolveIdentity(record.did);
  if (!identity.pds) return null;

  const value = await fetchRepoRecord(identity.pds, recordUri(record));
  if (!isRecord(value)) return null;

  const sourceUrl = typeof value.source === "string" ? value.source.trim() : "";
  if (!sourceUrl) return null;

  const connectionType =
    typeof value.connectionType === "string"
      ? value.connectionType
      : "connected";
  const createdAt =
    typeof value.createdAt === "string"
      ? value.createdAt
      : new Date().toISOString();

  return { sourceUrl, connectionType, createdAt };
}

/** Articles in the read-model whose body links to this document's URL. */
export async function fetchCitedInArticles(
  dbClient: typeof db,
  schemaModule: typeof schema,
  {
    urls,
    excludeDocumentUri,
    limit = 5,
  }: {
    urls: Array<string>;
    excludeDocumentUri: string;
    limit?: number;
  },
): Promise<Array<ArticleCard>> {
  const records = await discoverCitationRecords(urls);
  const citingUris = [
    ...new Set(
      records
        .map((record) => recordUri(record))
        .filter((uri) => uri !== excludeDocumentUri),
    ),
  ].slice(0, limit);

  if (citingUris.length === 0) return [];

  const articles = await selectArticleCardsByUris(
    dbClient,
    schemaModule,
    citingUris,
  );
  return articles.slice(0, limit);
}

/** Margin/Semble graph connections pointing at this article's URL. */
export async function fetchMarginConnections(
  dbClient: typeof db,
  schemaModule: typeof schema,
  {
    urls,
    limit = 5,
  }: {
    urls: Array<string>;
    limit?: number;
  },
): Promise<Array<MarginConnectionItem>> {
  const records = await discoverCosmikConnectionRecords(urls);
  if (records.length === 0) return [];

  const loadedConnections = await Promise.all(
    records.map((record) => loadCosmikConnection(record)),
  );
  const parsed = loadedConnections.filter(
    (item): item is ParsedCosmikConnection => item != null,
  );

  if (parsed.length === 0) return [];

  const sourceUrls = parsed.map((item) => item.sourceUrl);
  const uriByUrl = await documentUrisByCanonicalUrls(
    dbClient,
    schemaModule,
    sourceUrls,
  );

  const orderedUris = [
    ...new Set(
      parsed
        .map((item) => uriByUrl.get(item.sourceUrl))
        .filter((uri): uri is string => uri != null),
    ),
  ].slice(0, limit);

  if (orderedUris.length === 0) return [];

  const articles = await selectArticleCardsByUris(
    dbClient,
    schemaModule,
    orderedUris,
  );
  const articleByUri = new Map(
    articles.map((article) => [article.uri, article]),
  );

  const items: Array<MarginConnectionItem> = [];

  for (const connection of parsed) {
    const uri = uriByUrl.get(connection.sourceUrl);
    const article = uri ? articleByUri.get(uri) : null;
    if (!article) continue;

    items.push({
      article,
      connectionType: connection.connectionType,
      connectionLabel: formatConnectionLabel(connection.connectionType),
      createdAt: connection.createdAt,
    });
    if (items.length >= limit) break;
  }

  return items;
}

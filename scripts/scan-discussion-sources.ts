/**
 * Discover Constellation link sources on indexed article URLs — surfaces
 * collection:path pairs beyond what Standard Reader already queries.
 *
 *   pnpm scan:discussion-sources
 *   pnpm scan:discussion-sources -- --limit=50
 */
import { and, eq, isNotNull } from "drizzle-orm";

import type { ConstellationLinkSourceSummary } from "../src/server/atproto/constellation.ts";

import { db } from "../src/db/index.ts";
import { documents, publications } from "../src/db/schema.ts";
import {
  CITATION_LINK_SOURCES,
  COSMIK_CONNECTION_LINK_SOURCES,
  DISCUSSION_LINK_SOURCES,
  getAllLinkSourcesForTarget,
} from "../src/server/atproto/constellation.ts";
import { buildCanonicalUrl } from "../src/server/ingest/mappers.ts";

const PAGE_SIZE = 50;
const DEFAULT_DOC_LIMIT = 25;
const REQUEST_DELAY_MS = 120;

const SUPPORTED_SOURCES = new Set<string>([
  ...DISCUSSION_LINK_SOURCES,
  ...CITATION_LINK_SOURCES,
  ...COSMIK_CONNECTION_LINK_SOURCES,
]);

const BOOKMARK_COLLECTION_RE =
  /bookmark|saved|inspo|directory\.submission|visited/i;
const CHAT_COLLECTION_RE = /chat|message|colibri|stream/i;
const CITE_COLLECTION_RE = /^(site\.standard\.document|pub\.(leaflet|oxa)\.)/;
const GRAPH_COLLECTION_RE = /^network\.cosmik\.connection$/;

function parseLimitArg(argv: Array<string>): number {
  for (const arg of argv) {
    const match = arg.match(/^--limit=(\d+)$/);
    if (match) return Number.parseInt(match[1] ?? "", 10);
  }
  return DEFAULT_DOC_LIMIT;
}

function sourceKey(source: ConstellationLinkSourceSummary): string {
  return `${source.collection}:${source.path}`;
}

function classifySource(source: ConstellationLinkSourceSummary): string {
  if (SUPPORTED_SOURCES.has(sourceKey(source))) return "supported";
  if (BOOKMARK_COLLECTION_RE.test(source.collection)) return "bookmark";
  if (CHAT_COLLECTION_RE.test(source.collection)) return "chat";
  if (CITE_COLLECTION_RE.test(source.collection)) return "cite";
  if (GRAPH_COLLECTION_RE.test(source.collection)) return "graph";
  return "other";
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

const docLimit = parseLimitArg(process.argv.slice(2));

const rows: Array<{ uri: string; canonicalUrl: string }> = [];

for (let offset = 0; rows.length < docLimit; offset += PAGE_SIZE) {
  const batch = await db
    .select({
      uri: documents.uri,
      path: documents.path,
      canonicalUrl: documents.canonicalUrl,
      publicationUrl: publications.url,
    })
    .from(documents)
    .leftJoin(publications, eq(publications.uri, documents.publicationUri))
    .where(
      and(eq(documents.deleted, false), isNotNull(documents.publicationUri)),
    )
    .limit(PAGE_SIZE)
    .offset(offset);

  if (batch.length === 0) break;

  for (const row of batch) {
    const canonicalUrl =
      row.canonicalUrl ?? buildCanonicalUrl(row.publicationUrl, row.path);
    if (!canonicalUrl) continue;
    rows.push({ uri: row.uri, canonicalUrl });
    if (rows.length >= docLimit) break;
  }
}

const aggregate = new Map<
  string,
  ConstellationLinkSourceSummary & { urls: number; class: string }
>();

for (const row of rows) {
  const { sources } = await getAllLinkSourcesForTarget(row.canonicalUrl);

  for (const source of sources) {
    const key = sourceKey(source);
    const existing = aggregate.get(key);
    if (existing) {
      existing.records += source.records;
      existing.distinctDids += source.distinctDids;
      existing.urls += 1;
      continue;
    }

    aggregate.set(key, {
      ...source,
      urls: 1,
      class: classifySource(source),
    });
  }

  await sleep(REQUEST_DELAY_MS);
}

const ranked = [...aggregate.values()].toSorted(
  (a, b) => b.records - a.records,
);

// eslint-disable-next-line no-console
console.log(
  `Scanned ${rows.length} indexed document(s) against Constellation /links/all.\n`,
);

const unsupported = ranked.filter((row) => row.class !== "supported");

// eslint-disable-next-line no-console
console.log("Unsupported or unhandled sources (discussion-adjacent):\n");
if (unsupported.length === 0) {
  // eslint-disable-next-line no-console
  console.log("  (none in this sample)");
} else {
  for (const row of unsupported.slice(0, 40)) {
    // eslint-disable-next-line no-console
    console.log(
      `  ${row.records.toString().padStart(4)} rec  [${row.class.padEnd(9)}]  ${row.collection}  ${row.path}`,
    );
  }
}

// eslint-disable-next-line no-console
console.log("\nSupported sources in this sample:\n");
for (const row of ranked.filter((entry) => entry.class === "supported")) {
  // eslint-disable-next-line no-console
  console.log(
    `  ${row.records.toString().padStart(4)} rec  ${row.collection}  ${row.path}`,
  );
}

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);

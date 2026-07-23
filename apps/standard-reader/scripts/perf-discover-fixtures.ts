/**
 * Discover stable article/publication paths for perf regression tests.
 *
 *   pnpm perf:discover-fixtures
 *
 * Prints env vars to copy into `.env` (or exports for your shell).
 */
import { and, desc, eq } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents, publications } from "../src/db/schema.ts";
import { STANDARD_NSID } from "../src/lib/atproto/nsids.ts";
import { parseAtUri } from "../src/server/atproto/uri.ts";
import { documentPublishedNotInFuture } from "../src/server/reader/document-filters.ts";
import { discoverEligiblePublicationWhere } from "../src/server/reader/publication-filters.ts";

function pathFromUri(
  uri: string,
  collection: string,
  prefix: "/a" | "/p",
): string | null {
  const parsed = parseAtUri(uri);
  if (!parsed || parsed.collection !== collection) return null;
  return `${prefix}/${encodeURIComponent(parsed.did)}/${encodeURIComponent(parsed.rkey)}`;
}

const [docRow] = await db
  .select({ uri: documents.uri, tags: documents.tags })
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
  .select({ uri: publications.uri })
  .from(publications)
  .where(discoverEligiblePublicationWhere(publications))
  .orderBy(desc(publications.updatedAt))
  .limit(1);

const articlePath = docRow
  ? pathFromUri(docRow.uri, STANDARD_NSID.document, "/a")
  : null;
const publicationPath = pubRow
  ? pathFromUri(pubRow.uri, STANDARD_NSID.publication, "/p")
  : null;

const tag =
  docRow?.tags?.find((value) => value.trim().length > 0)?.trim() ??
  "observability";

// eslint-disable-next-line no-console
console.log("# Paste into .env for perf regression tests\n");
if (articlePath) {
  // eslint-disable-next-line no-console
  console.log(`PERF_TEST_ARTICLE_PATH="${articlePath}"`);
  // eslint-disable-next-line no-console
  console.log(`PERF_TEST_ARTICLE_URI="${docRow?.uri ?? ""}"`);
}
if (publicationPath) {
  // eslint-disable-next-line no-console
  console.log(`PERF_TEST_PUBLICATION_PATH="${publicationPath}"`);
  // eslint-disable-next-line no-console
  console.log(`PERF_TEST_PUBLICATION_URI="${pubRow?.uri ?? ""}"`);
}
// eslint-disable-next-line no-console
console.log(`PERF_TEST_TAG="${tag}"`);
// eslint-disable-next-line no-console
console.log('PERF_TEST_SEARCH_QUERY="reader"');

if (!articlePath || !publicationPath) {
  // eslint-disable-next-line no-console
  console.warn(
    "\nWarning: could not resolve article and/or publication fixtures from the DB.",
  );
  process.exitCode = 1;
}

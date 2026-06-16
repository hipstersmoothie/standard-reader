import { STANDARD_NSID } from "../../src/lib/atproto/nsids.ts";
import { parseAtUri } from "../../src/server/atproto/uri.ts";

export interface PerfFixtures {
  articlePath: string | null;
  publicationPath: string | null;
  collectionEditPath: string | null;
  tag: string;
  searchQuery: string;
}

function routeFromRecordUri(
  uri: string,
  collection: string,
  prefix: "/a" | "/p",
): string | null {
  const parsed = parseAtUri(uri);
  if (!parsed || parsed.collection !== collection) return null;
  const did = encodeURIComponent(parsed.did);
  const rkey = encodeURIComponent(parsed.rkey);
  return `${prefix}/${did}/${rkey}`;
}

export function loadPerfFixtures(): PerfFixtures {
  const articlePath =
    envPath("PERF_TEST_ARTICLE_PATH") ??
    routeFromEnvUri("PERF_TEST_ARTICLE_URI", STANDARD_NSID.document, "/a");

  const publicationPath =
    envPath("PERF_TEST_PUBLICATION_PATH") ??
    routeFromEnvUri(
      "PERF_TEST_PUBLICATION_URI",
      STANDARD_NSID.publication,
      "/p",
    ) ??
    (process.env.PERF_TEST_PUBLICATION_DID &&
    process.env.PERF_TEST_PUBLICATION_RKEY
      ? `/p/${encodeURIComponent(process.env.PERF_TEST_PUBLICATION_DID)}/${encodeURIComponent(process.env.PERF_TEST_PUBLICATION_RKEY)}`
      : null);

  const resolvedArticle =
    articlePath ??
    (process.env.PERF_TEST_ARTICLE_DID && process.env.PERF_TEST_ARTICLE_RKEY
      ? `/a/${encodeURIComponent(process.env.PERF_TEST_ARTICLE_DID)}/${encodeURIComponent(process.env.PERF_TEST_ARTICLE_RKEY)}`
      : null);

  const collectionRkey = process.env.PERF_TEST_COLLECTION_RKEY?.trim();
  const collectionEditPath =
    envPath("PERF_TEST_COLLECTION_EDIT_PATH") ??
    (collectionRkey
      ? `/collections/edit/${encodeURIComponent(collectionRkey)}`
      : null);

  return {
    articlePath: resolvedArticle,
    publicationPath,
    collectionEditPath,
    tag: process.env.PERF_TEST_TAG?.trim() || "observability",
    searchQuery: process.env.PERF_TEST_SEARCH_QUERY?.trim() || "reader",
  };
}

function envPath(name: string): string | null {
  const value = process.env[name]?.trim();
  if (!value) return null;
  return value.startsWith("/") ? value : `/${value}`;
}

function routeFromEnvUri(
  envName: string,
  collection: string,
  prefix: "/a" | "/p",
): string | null {
  const uri = process.env[envName]?.trim();
  if (!uri) return null;
  return routeFromRecordUri(uri, collection, prefix);
}

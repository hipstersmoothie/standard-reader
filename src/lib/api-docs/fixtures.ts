import type { ApiDocsFixtures } from "./fixture-defaults";

import { loadPerfFixtures } from "../../../perf/lib/fixtures";
import { getDefaultApiDocsFixtures } from "./fixture-defaults";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function envPublicationUri(): string | undefined {
  return (
    env("API_DOCS_FIXTURE_PUBLICATION_URI") ??
    env("PERF_TEST_PUBLICATION_URI") ??
    (env("PERF_TEST_PUBLICATION_DID") && env("PERF_TEST_PUBLICATION_RKEY")
      ? `at://${env("PERF_TEST_PUBLICATION_DID")}/site.standard.publication/${env("PERF_TEST_PUBLICATION_RKEY")}`
      : undefined)
  );
}

export function envDocumentUri(): string | undefined {
  return (
    env("API_DOCS_FIXTURE_DOCUMENT_URI") ??
    env("PERF_TEST_ARTICLE_URI") ??
    (env("PERF_TEST_ARTICLE_DID") && env("PERF_TEST_ARTICLE_RKEY")
      ? `at://${env("PERF_TEST_ARTICLE_DID")}/site.standard.document/${env("PERF_TEST_ARTICLE_RKEY")}`
      : undefined)
  );
}

/** Stable AT-URI / handle fixtures for live API docs examples (env only). */
export function loadApiDocsFixtures(): ApiDocsFixtures {
  const defaults = getDefaultApiDocsFixtures();
  const perf = loadPerfFixtures();

  return {
    publicationUri: envPublicationUri() ?? defaults.publicationUri,
    documentUri: envDocumentUri() ?? defaults.documentUri,
    handle: env("API_DOCS_FIXTURE_HANDLE") ?? defaults.handle,
    tag: env("API_DOCS_FIXTURE_TAG") ?? perf.tag,
    searchQuery: env("API_DOCS_FIXTURE_SEARCH") ?? perf.searchQuery,
    readerDid: env("API_DOCS_FIXTURE_READER_DID") ?? defaults.readerDid,
    listUri: env("API_DOCS_FIXTURE_LIST_URI") ?? defaults.listUri,
    resolveUrl: env("API_DOCS_FIXTURE_URL") ?? defaults.resolveUrl,
  };
}

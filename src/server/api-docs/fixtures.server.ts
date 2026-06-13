import type { ApiDocsFixtures } from "#/lib/api-docs/fixture-defaults";
import type { ApiDocsTagOption } from "#/lib/api-docs/types";

import { getDefaultApiDocsFixtures } from "#/lib/api-docs/fixture-defaults";
import {
  envDocumentUri,
  envPublicationUri,
  loadApiDocsFixtures,
} from "#/lib/api-docs/fixtures";
import {
  discoverApiDocsFixturesFromDb,
  discoverApiDocsTagOptions,
  prioritizeApiDocsFixtureTag,
} from "#/server/api-docs/discover-fixtures.server";

function env(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

let cachedAsyncFixtures: ApiDocsFixtures | null = null;

/** Env + DB discovery — server-only (example runner, docs route loader). */
export async function loadApiDocsFixturesAsync(): Promise<ApiDocsFixtures> {
  if (cachedAsyncFixtures) {
    return cachedAsyncFixtures;
  }

  const defaults = getDefaultApiDocsFixtures();
  const fromEnv = loadApiDocsFixtures();
  const needsDbDiscovery =
    fromEnv.publicationUri === defaults.publicationUri ||
    fromEnv.documentUri === defaults.documentUri ||
    fromEnv.readerDid === defaults.readerDid ||
    fromEnv.listUri === defaults.listUri ||
    fromEnv.resolveUrl === defaults.resolveUrl ||
    fromEnv.handle === defaults.handle;

  const discovered = needsDbDiscovery
    ? await discoverApiDocsFixturesFromDb()
    : {};

  cachedAsyncFixtures = {
    ...defaults,
    ...discovered,
    ...fromEnv,
    publicationUri:
      envPublicationUri() ??
      discovered.publicationUri ??
      defaults.publicationUri,
    documentUri:
      envDocumentUri() ?? discovered.documentUri ?? defaults.documentUri,
    handle:
      env("API_DOCS_FIXTURE_HANDLE") ?? discovered.handle ?? defaults.handle,
    tag: env("API_DOCS_FIXTURE_TAG") ?? discovered.tag ?? fromEnv.tag,
    readerDid:
      env("API_DOCS_FIXTURE_READER_DID") ??
      discovered.readerDid ??
      defaults.readerDid,
    listUri:
      env("API_DOCS_FIXTURE_LIST_URI") ??
      discovered.listUri ??
      defaults.listUri,
    resolveUrl:
      env("API_DOCS_FIXTURE_URL") ??
      discovered.resolveUrl ??
      defaults.resolveUrl,
  };

  return cachedAsyncFixtures;
}

export type ApiDocsPageData = {
  fixtures: ApiDocsFixtures;
  tagOptions: Array<ApiDocsTagOption>;
};

let cachedPageData: ApiDocsPageData | null = null;

/** Fixtures + tag picklist for the /docs/api page loader. */
export async function loadApiDocsPageData(): Promise<ApiDocsPageData> {
  if (cachedPageData) {
    return cachedPageData;
  }
  const [fixtures, discoveredTags] = await Promise.all([
    loadApiDocsFixturesAsync(),
    discoverApiDocsTagOptions(),
  ]);
  const tagOptions = await prioritizeApiDocsFixtureTag(
    discoveredTags,
    fixtures.tag,
  );
  cachedPageData = { fixtures, tagOptions };
  return cachedPageData;
}

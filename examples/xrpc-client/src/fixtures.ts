/**
 * The example arguments in the generated plan are `{{tokens}}`. Fill them in.
 *
 * Everything is discovered from the AppView's own public endpoints so the
 * runner works against any deployment (prod, a preview, localhost) with no
 * fixture file to keep current. Any value can be pinned with an env var.
 */

import type { StandardReaderClient } from "./client";

export type Fixtures = Record<string, string | undefined>;

function env(name: string): string | undefined {
  return process.env[name]?.trim() || undefined;
}

async function firstPublicationUri(
  client: StandardReaderClient,
): Promise<string | undefined> {
  const result = await client.call(
    "app.standard-reader.getTrendingPublications",
    { params: { limit: "1" }, anonymous: true },
  );
  const body = result.body as { items?: Array<{ uri?: string }> } | undefined;
  return body?.items?.[0]?.uri;
}

async function firstDocumentUri(
  client: StandardReaderClient,
  publicationUri: string | undefined,
): Promise<string | undefined> {
  if (!publicationUri) return undefined;
  const result = await client.call(
    "app.standard-reader.getPublicationDocuments",
    { params: { publication: publicationUri, limit: "1" }, anonymous: true },
  );
  const body = result.body as { items?: Array<{ uri?: string }> } | undefined;
  return body?.items?.[0]?.uri;
}

async function publicationSiteUrl(
  client: StandardReaderClient,
  publicationUri: string | undefined,
): Promise<string | undefined> {
  if (!publicationUri) return undefined;
  const result = await client.call("app.standard-reader.getPublication", {
    params: { publication: publicationUri },
    anonymous: true,
  });
  const body = result.body as { publication?: { url?: string } } | undefined;
  return body?.publication?.url;
}

/** The owner of a publication — anyone but the caller, who cannot follow self. */
async function publicationOwnerDid(
  client: StandardReaderClient,
  publicationUri: string | undefined,
): Promise<string | undefined> {
  if (!publicationUri) return undefined;
  const authority = /^at:\/\/([^/]+)/.exec(publicationUri)?.[1];
  return authority;
}

async function ownListUri(
  client: StandardReaderClient,
  did: string,
): Promise<string | undefined> {
  const result = await client.call("app.standard-reader.getUserLists", {
    params: { did, limit: "1" },
  });
  const body = result.body as { lists?: Array<{ uri?: string }> } | undefined;
  return body?.lists?.[0]?.uri;
}

export async function discoverFixtures(
  client: StandardReaderClient,
  did: string,
): Promise<Fixtures> {
  const publicationUri =
    env("EXAMPLE_PUBLICATION_URI") ?? (await firstPublicationUri(client));
  const documentUri =
    env("EXAMPLE_DOCUMENT_URI") ??
    (await firstDocumentUri(client, publicationUri));
  const siteUrl = await publicationSiteUrl(client, publicationUri);

  return {
    documentUri,
    // The calling reader — reader-state examples must describe *this* session,
    // which is exactly what an unauthenticated call cannot answer.
    readerDid: did,
    followTargetDid:
      env("EXAMPLE_FOLLOW_TARGET_DID") ??
      (await publicationOwnerDid(client, publicationUri)),
    labelerDid:
      env("EXAMPLE_LABELER_DID") ?? "did:plc:ar7c4by46qjdydhdevvrndac",
    listUri: env("EXAMPLE_LIST_URI") ?? (await ownListUri(client, did)),
    publicationUri,
    resolveUrl: env("EXAMPLE_RESOLVE_URL") ?? siteUrl,
    searchQuery: env("EXAMPLE_SEARCH") ?? "reader",
    tag: env("EXAMPLE_TAG") ?? "writing",
  };
}

const TOKEN = /^\{\{(\w+)\}\}$/;

/** Replace `{{token}}` values; report the tokens that had no fixture. */
export function resolveArgs<T extends Record<string, unknown>>(
  args: T | undefined,
  fixtures: Fixtures,
): { missing: Array<string>; value: T | undefined } {
  if (!args) return { missing: [], value: undefined };
  const missing: Array<string> = [];

  const resolve = (input: unknown): unknown => {
    if (typeof input === "string") {
      const match = TOKEN.exec(input);
      if (!match) return input;
      const key = match[1] as string;
      const value = fixtures[key];
      if (value === undefined) missing.push(key);
      return value;
    }
    if (Array.isArray(input)) return input.map((item) => resolve(item));
    return input;
  };

  const value = Object.fromEntries(
    Object.entries(args).map(([key, item]) => [key, resolve(item)]),
  ) as T;
  return { missing, value };
}

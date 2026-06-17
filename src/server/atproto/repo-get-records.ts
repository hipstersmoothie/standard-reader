import type { ComAtprotoRepoGetRecord } from "@atcute/atproto";
import type { Client } from "@atcute/client";
import type { InferInput } from "@atcute/lexicons/validations";

import { COLLECTION } from "#/lib/atproto/nsids";

type RepoGetRecordParams = InferInput<
  typeof ComAtprotoRepoGetRecord.mainSchema.params
>;

function lexGetRecordParams(args: {
  repo: string;
  collection: string;
  rkey: string;
}): RepoGetRecordParams {
  return args as RepoGetRecordParams;
}

/** Read one `site.standard.document` record's value straight from the repo. */
export async function getDocumentRecord(
  client: Client,
  repo: string,
  rkey: string,
): Promise<unknown | null> {
  const res = await client.get("com.atproto.repo.getRecord", {
    params: lexGetRecordParams({
      repo,
      collection: COLLECTION.document,
      rkey,
    }),
  });
  return res.ok ? (res.data?.value ?? null) : null;
}

/** Read one `app.standard-reader.collection` sidecar's value from the repo. */
export async function getCollectionRecord(
  client: Client,
  repo: string,
  rkey: string,
): Promise<unknown | null> {
  const res = await client.get("com.atproto.repo.getRecord", {
    params: lexGetRecordParams({
      repo,
      collection: COLLECTION.collection,
      rkey,
    }),
  });
  return res.ok ? (res.data?.value ?? null) : null;
}

/** Read one `app.standard-reader.publicationTheme` record's value. */
export async function getPublicationThemeRecord(
  client: Client,
  repo: string,
  publicationRkey: string,
): Promise<unknown | null> {
  const res = await client.get("com.atproto.repo.getRecord", {
    params: lexGetRecordParams({
      repo,
      collection: COLLECTION.publicationTheme,
      rkey: publicationRkey,
    }),
  });
  return res.ok ? (res.data?.value ?? null) : null;
}

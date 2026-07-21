import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  getAtprotoSessionForRequest,
  getReaderContextForRequest,
  getReaderDidForRequest,
} from "#/middleware/auth-session.server";
import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";
import { authorPds } from "#/server/atproto/identity";
import type { ThirdPartyCollectionSummary } from "#/server/atproto/repo-records";
import {
  createSembleCollection,
  listSembleCollectionRecords,
  saveToSembleCollection,
} from "#/server/atproto/repo-records";
import { observe } from "#/server/observability/log";

/**
 * Semble/Cosmik (semble.so, appview at network.cosmik.*) save API.
 *
 * Write path: create a `network.cosmik.card` plus a
 * `network.cosmik.collectionLink` strongRef in the signed-in reader's own
 * repo (source of truth — no DB mirror; third-party collection per
 * AGENTS.md §3(c)).
 *
 * Read path: list the reader's own `network.cosmik.collection` records via
 * Slingshot/PDS — a public, unauthenticated repo read (no write scope
 * required). Uses {@link getReaderDidForRequest} rather than
 * {@link getAtprotoSessionForRequest}: the latter also restores a
 * write-capable OAuth client, an unnecessary dependency for a read that
 * would otherwise silently return an empty list if that restore hiccups.
 */

const listSembleCollections = createServerFn({ method: "GET" }).handler(
  observe(
    "semble.listCollections",
    async (
      _args,
      span,
    ): Promise<{ collections: Array<ThirdPartyCollectionSummary> }> => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) return { collections: [] };
      span.set("did", did);

      const pds = await authorPds(did);
      const collections = await listSembleCollectionRecords(did, pds);
      return { collections };
    },
  ),
);

const saveInput = z
  .object({
    collectionUri: z.string().startsWith("at://").optional(),
    collectionCid: z.string().optional(),
    newCollectionName: z.string().min(1).max(200).optional(),
    url: z.string().url(),
    title: z.string().min(1).max(1000),
    description: z.string().max(2000).optional(),
    author: z.string().max(300).optional(),
    siteName: z.string().max(200).optional(),
    imageUrl: z.string().url().optional(),
  })
  .refine((d) => Boolean(d.collectionUri) !== Boolean(d.newCollectionName), {
    message: "Choose an existing collection or name a new one, not both.",
  });

/**
 * Resolve a Semble collection's live cid for the `collectionLink` strongRef.
 * The client-supplied cid may be stale (collection listed earlier in the
 * session), so re-fetch via Slingshot/PDS and only fall back to the supplied
 * value if the record can't be re-fetched.
 */
async function resolveCollectionCid(
  collectionUri: string,
  clientSuppliedCid: string | undefined,
  pds: string | null,
): Promise<string> {
  const res = await fetchRepoRecordWithFallback(collectionUri, pds);
  if (res?.cid) return res.cid;
  if (clientSuppliedCid) return clientSuppliedCid;
  throw new Error(
    "Could not resolve the collection. It may have been deleted.",
  );
}

/**
 * Save an article to a Semble collection, creating the collection first when
 * `newCollectionName` is given instead of `collectionUri`. Throws if not
 * signed in, or the server surfaces a `ScopeMissingError` if the reader's
 * OAuth grant doesn't include `network.cosmik.card` — the client detects that
 * and triggers the `upgradeToSemble` flow.
 */
const saveArticleToSembleCollection = createServerFn({ method: "POST" })
  .validator(saveInput)
  .handler(
    observe("semble.save", async ({ data }, span) => {
      const request = getRequest();
      const session = await getAtprotoSessionForRequest(request);
      if (!session) {
        const reader = await getReaderContextForRequest(request);
        if (reader) {
          throw new Error(
            "ScopeMissingError: network.cosmik.card (re-authorization required)",
          );
        }
        throw new Error("Sign in to save to Semble.");
      }
      span.set("did", session.did);

      const createdAt = new Date().toISOString();
      let collectionUri = data.collectionUri;
      let collectionCid = data.collectionCid;
      if (!collectionUri && data.newCollectionName) {
        const created = await createSembleCollection(
          session.client,
          session.did,
          { name: data.newCollectionName, createdAt },
        );
        collectionUri = created.uri;
        collectionCid = created.cid;
      }
      if (!collectionUri) {
        throw new Error("Choose or create a collection.");
      }
      span.set("collectionUri", collectionUri);
      const pds = await authorPds(session.did);
      const resolvedCid = await resolveCollectionCid(
        collectionUri,
        collectionCid,
        pds,
      );

      const result = await saveToSembleCollection(session.client, session.did, {
        collectionUri,
        collectionCid: resolvedCid,
        url: data.url,
        title: data.title,
        ...(data.description ? { description: data.description } : {}),
        ...(data.author ? { author: data.author } : {}),
        ...(data.siteName ? { siteName: data.siteName } : {}),
        ...(data.imageUrl ? { imageUrl: data.imageUrl } : {}),
        createdAt,
      });
      return { ...result, collectionUri };
    }),
  );

export const sembleApi = {
  listSembleCollections,
  saveArticleToSembleCollection,
  getSembleCollectionsQueryOptions: () =>
    queryOptions({
      queryKey: ["semble", "collections"],
      queryFn: () => listSembleCollections(),
      staleTime: 60_000,
    }),
};

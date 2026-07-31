import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";

import {
  getAtprotoSessionForRequest,
  getReaderContextForRequest,
  getReaderDidForRequest,
} from "#/middleware/auth-session.server";
import { authorPds } from "#/server/atproto/identity";
import type { ThirdPartyCollectionSummary } from "#/server/atproto/repo-records";
import {
  createMarginCollection,
  listMarginCollectionRecords,
  saveToMarginCollection,
} from "#/server/atproto/repo-records";
import { observe } from "#/server/observability/log";

/**
 * Margin (margin.at) save API.
 *
 * Write path: create an `at.margin.note` (bookmark, or a highlight when a
 * passage is given) plus an `at.margin.collectionItem` in the signed-in
 * reader's own repo (source of truth — no DB mirror; third-party collection
 * per AGENTS.md §3(c)).
 *
 * Read path: list the reader's own `at.margin.collection` records via
 * Slingshot/PDS — a public, unauthenticated repo read (no write scope
 * required). Uses {@link getReaderDidForRequest} rather than
 * {@link getAtprotoSessionForRequest}: the latter also restores a
 * write-capable OAuth client, an unnecessary dependency for a read that
 * would otherwise silently return an empty list if that restore hiccups.
 */

const listMarginCollections = createServerFn({ method: "GET" }).handler(
  observe(
    "margin.listCollections",
    async (
      _args,
      span,
    ): Promise<{ collections: Array<ThirdPartyCollectionSummary> }> => {
      const did = await getReaderDidForRequest(getRequest());
      if (!did) return { collections: [] };
      span.set("did", did);

      const pds = await authorPds(did);
      const collections = await listMarginCollectionRecords(did, pds);
      return { collections };
    },
  ),
);

const saveInput = z
  .object({
    collectionUri: z.string().startsWith("at://").optional(),
    newCollectionName: z.string().min(1).max(200).optional(),
    url: z.string().url(),
    title: z.string().min(1).max(1000),
    passage: z.string().max(10_000).optional(),
    /** Free-text note attached to the bookmark/highlight (`body.value`). */
    note: z.string().max(3000).optional(),
  })
  .refine((d) => Boolean(d.collectionUri) !== Boolean(d.newCollectionName), {
    message: "Choose an existing collection or name a new one, not both.",
  });

/**
 * Save an article to a Margin collection, creating the collection first when
 * `newCollectionName` is given instead of `collectionUri`. Throws if not
 * signed in, or the server surfaces a `ScopeMissingError` if the reader's
 * OAuth grant doesn't include `at.margin.note` — the client detects that and
 * triggers the `upgradeToMargin` flow.
 */
const saveArticleToMarginCollection = createServerFn({ method: "POST" })
  .validator(saveInput)
  .handler(
    observe("margin.save", async ({ data }, span) => {
      const request = getRequest();
      const session = await getAtprotoSessionForRequest(request);
      if (!session) {
        const reader = await getReaderContextForRequest(request);
        if (reader) {
          throw new Error(
            "ScopeMissingError: at.margin.note (re-authorization required)",
          );
        }
        throw new Error("Sign in to save to Margin.");
      }
      span.set("did", session.did);

      const createdAt = new Date().toISOString();
      let collectionUri = data.collectionUri;
      if (!collectionUri && data.newCollectionName) {
        const created = await createMarginCollection(
          session.client,
          session.did,
          { name: data.newCollectionName, createdAt },
        );
        collectionUri = created.uri;
      }
      if (!collectionUri) {
        throw new Error("Choose or create a collection.");
      }
      span.set("collectionUri", collectionUri);

      const result = await saveToMarginCollection(session.client, session.did, {
        collectionUri,
        url: data.url,
        title: data.title,
        ...(data.passage ? { passage: data.passage } : {}),
        ...(data.note ? { note: data.note } : {}),
        createdAt,
      });
      return { ...result, collectionUri };
    }),
  );

export const marginApi = {
  listMarginCollections,
  saveArticleToMarginCollection,
  getMarginCollectionsQueryOptions: () =>
    queryOptions({
      queryKey: ["margin", "collections"],
      queryFn: () => listMarginCollections(),
      staleTime: 60_000,
    }),
};

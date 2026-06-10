import type { SubscriptionList } from "#/server/reader/saved-lists";

import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { APP_NSID } from "#/lib/atproto/nsids";
import { getAtprotoSessionForRequest } from "#/middleware/auth";
import { resolveIdentity } from "#/server/atproto/identity";
import {
  deleteListRecord,
  deleteListSaveRecord,
  hasListSaveRecord,
  listCollectionRecords,
  newListRkey,
  putListRecord,
  putListSaveRecord,
} from "#/server/atproto/repo-records";
import { observe } from "#/server/observability/log";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import {
  followedPublications,
  selectArticleCards,
} from "#/server/reader/queries";
import {
  fetchPublicList,
  invalidateSavedLists,
  listUriFromParams,
  savedListsForReader,
  toSubscriptionList,
} from "#/server/reader/saved-lists";
import {
  articleCardsAsAllRead,
  resolveTrackReadingHistoryEnabled,
} from "#/server/reader/track-reading-history";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import type { ArticleCard, Db, PublicationCard, Schema } from "./api-shapes";

import { dbMiddleware } from "./db-middleware";

/**
 * Publication lists (`app.standard-reader.list`) — named, ordered, shareable
 * lists of publications, like a Bluesky user list. Your own lists double as
 * the sidebar folders; any list has a public page at `/l/$did/$rkey`, and
 * other readers can add it to their app via an `app.standard-reader.listSave`
 * record (deterministic rkey, so save/unsave/status address one record).
 *
 * Lists are NOT mirrored into the Neon read-model: reads go straight to the
 * owning repo's PDS (strongly consistent — an edit shows up on the next
 * fetch), and only the member publications are hydrated from Neon. Saved
 * lists also act as virtual subscriptions (see `#/server/reader/saved-lists`).
 */

const putListInput = z.object({
  /** Omit to create a new list (a fresh TID rkey is generated). */
  rkey: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(300).optional(),
  publications: z.array(z.string().min(1)).max(500),
  /** Preserved across edits; defaults to now for new lists. */
  createdAt: z.iso.datetime().optional(),
});

const rkeyInput = z.object({
  rkey: z.string().min(1),
});

const listRefInput = z.object({
  did: z.string().min(1),
  rkey: z.string().min(1),
});

const listFeedInput = listRefInput.extend({
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
});

const listUriInput = z.object({
  listUri: z.string().min(1),
});

export type { SubscriptionList };

export interface ListOwner {
  did: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
}

/** Chronological articles from a list's member publications. */
export interface ListFeed {
  items: Array<ArticleCard>;
  /** Offset for the next page, or null when the last page was reached. */
  nextOffset: number | null;
}

/** Data for the public list page (`/l/$did/$rkey`). */
export interface ListPage {
  /** Null when the record doesn't exist (or its repo is unreachable). */
  list: SubscriptionList | null;
  owner: ListOwner | null;
  /** Hydrated cards in list order (uris missing from the read-model are omitted). */
  publications: Array<PublicationCard>;
  viewer: { signedIn: boolean; isOwner: boolean; isSaved: boolean };
}

/** Another reader's list the viewer has saved, hydrated for the sidebar. */
export interface SavedList {
  list: SubscriptionList;
  owner: ListOwner;
  publications: Array<PublicationCard>;
}

/** Owner identity for attribution: read-model profile first, DID doc fallback. */
async function lookupOwners(
  db: Db,
  schema: Schema,
  dids: Array<string>,
): Promise<Map<string, ListOwner>> {
  const unique = [...new Set(dids)];
  const owners = new Map<string, ListOwner>();
  if (unique.length === 0) {
    return owners;
  }
  const pr = schema.profiles;
  const rows = await db
    .select({
      did: pr.did,
      handle: pr.handle,
      displayName: pr.displayName,
      avatarUrl: pr.avatarUrl,
    })
    .from(pr)
    .where(inArray(pr.did, unique));
  for (const row of rows) {
    owners.set(row.did, row);
  }
  await Promise.all(
    unique
      .filter((did) => !owners.get(did)?.handle)
      .map(async (did) => {
        const identity = await resolveIdentity(did);
        owners.set(did, {
          did,
          handle: identity.handle,
          displayName: owners.get(did)?.displayName ?? null,
          avatarUrl: owners.get(did)?.avatarUrl ?? null,
        });
      }),
  );
  return owners;
}

/** Hydrated cards reordered to match the list's own publication order. */
async function hydrateInListOrder(
  db: Db,
  schema: Schema,
  uris: Array<string>,
): Promise<Array<PublicationCard>> {
  const cards = await followedPublications(db, schema, uris);
  const byUri = new Map(cards.map((card) => [card.uri, card]));
  return uris
    .map((uri) => byUri.get(uri))
    .filter((card): card is PublicationCard => card != null);
}

// ── Own lists (sidebar folders) ──────────────────────────────────────────────

const getLists = createServerFn({ method: "GET" }).handler(
  observe("lists.getLists", async (_, span) => {
    const session = await getAtprotoSessionForRequest(getRequest());
    if (!session) {
      return [] satisfies Array<SubscriptionList>;
    }
    span.set("did", session.did);

    const records = await listCollectionRecords(
      session.client,
      session.did,
      APP_NSID.list,
    );
    const lists = records
      .map((record) =>
        toSubscriptionList(record.uri, record.rkey, record.value),
      )
      .filter((list): list is SubscriptionList => list !== null)
      .toSorted((a, b) => a.rkey.localeCompare(b.rkey));
    span.set("count", lists.length);
    return lists satisfies Array<SubscriptionList>;
  }),
);

const putList = createServerFn({ method: "POST" })
  .inputValidator(putListInput)
  .handler(
    observe("lists.putList", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage lists.");
      }
      span.set("did", session.did);
      span.set("publications", data.publications.length);

      const rkey = data.rkey ?? newListRkey();
      span.set("rkey", rkey);
      await putListRecord(session.client, session.did, rkey, {
        name: data.name,
        description: data.description || undefined,
        publications: data.publications,
        createdAt: data.createdAt ?? new Date().toISOString(),
      });
      return { ok: true as const, rkey };
    }),
  );

const deleteList = createServerFn({ method: "POST" })
  .inputValidator(rkeyInput)
  .handler(
    observe("lists.deleteList", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage lists.");
      }
      span.set("did", session.did);
      span.set("rkey", data.rkey);

      await deleteListRecord(session.client, session.did, data.rkey);
      return { ok: true as const };
    }),
  );

// ── Public list page ─────────────────────────────────────────────────────────

const getList = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(listRefInput)
  .handler(
    observe("lists.getList", async ({ data, context }, span) => {
      span.set("listDid", data.did);
      span.set("rkey", data.rkey);
      const listUri = listUriFromParams(data.did, data.rkey);

      const session = await getAtprotoSessionForRequest(getRequest());
      const isOwner = session?.did === data.did;
      const [list, isSaved] = await Promise.all([
        fetchPublicList(data.did, data.rkey),
        session && !isOwner
          ? hasListSaveRecord(session.client, session.did, listUri).catch(
              () => false,
            )
          : Promise.resolve(false),
      ]);
      if (!list) {
        span.set("found", false);
        return {
          list: null,
          owner: null,
          publications: [],
          viewer: {
            signedIn: Boolean(session),
            isOwner: false,
            isSaved: false,
          },
        } satisfies ListPage;
      }

      const { db, schema } = context;
      const [publications, owners] = await Promise.all([
        hydrateInListOrder(db, schema, list.publications),
        lookupOwners(db, schema, [data.did]),
      ]);
      span.set("count", publications.length);

      return {
        list,
        owner: owners.get(data.did) ?? {
          did: data.did,
          handle: null,
          displayName: null,
          avatarUrl: null,
        },
        publications,
        viewer: { signedIn: Boolean(session), isOwner, isSaved },
      } satisfies ListPage;
    }),
  );

const getListFeed = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .inputValidator(listFeedInput)
  .handler(
    observe("lists.getListFeed", async ({ data, context }, span) => {
      span.set("listDid", data.did);
      span.set("rkey", data.rkey);
      span.set("offset", data.offset);

      const list = await fetchPublicList(data.did, data.rkey);
      if (!list || list.publications.length === 0) {
        span.set("count", 0);
        return {
          items: [],
          nextOffset: null,
        } satisfies ListFeed;
      }

      const session = await getAtprotoSessionForRequest(getRequest());
      const { db, schema } = context;
      const trackReading =
        session == null
          ? false
          : await resolveTrackReadingHistoryEnabled(db, schema);

      const items = await selectArticleCards(db, schema, {
        publicationUris: list.publications,
        readForDid: trackReading ? session?.did : undefined,
        limit: data.limit,
        offset: data.offset,
      });
      span.set("count", items.length);

      const normalized = trackReading ? items : articleCardsAsAllRead(items);
      const enriched = await attachCommentCountsToArticles(
        db,
        schema,
        normalized,
      );

      return {
        items: enriched,
        nextOffset:
          items.length === data.limit ? data.offset + data.limit : null,
      } satisfies ListFeed;
    }),
  );

// ── Saved lists (other readers' lists added to this app) ────────────────────

const getSavedLists = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe("lists.getSavedLists", async ({ context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        return [] satisfies Array<SavedList>;
      }
      span.set("did", session.did);

      const lists = await savedListsForReader(session.did);
      const { db, schema } = context;
      const allUris = [...new Set(lists.flatMap((list) => list.publications))];
      const [cards, owners] = await Promise.all([
        followedPublications(db, schema, allUris),
        lookupOwners(
          db,
          schema,
          lists.map(
            (list) => list.uri.slice("at://".length).split("/")[0] as string,
          ),
        ),
      ]);
      const cardByUri = new Map(cards.map((card) => [card.uri, card]));

      span.set("count", lists.length);
      return lists.map((list) => {
        const ownerDid = list.uri.slice("at://".length).split("/")[0] as string;
        return {
          list,
          owner: owners.get(ownerDid) ?? {
            did: ownerDid,
            handle: null,
            displayName: null,
            avatarUrl: null,
          },
          publications: list.publications
            .map((uri) => cardByUri.get(uri))
            .filter((card): card is PublicationCard => card != null),
        };
      }) satisfies Array<SavedList>;
    }),
  );

const saveList = createServerFn({ method: "POST" })
  .inputValidator(listUriInput)
  .handler(
    observe("lists.saveList", async ({ data }, span) => {
      span.set("listUri", data.listUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to add lists.");
      }
      span.set("did", session.did);

      await putListSaveRecord(
        session.client,
        session.did,
        data.listUri,
        new Date().toISOString(),
      );
      invalidateSavedLists(session.did);
      return { ok: true as const };
    }),
  );

const unsaveList = createServerFn({ method: "POST" })
  .inputValidator(listUriInput)
  .handler(
    observe("lists.unsaveList", async ({ data }, span) => {
      span.set("listUri", data.listUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage lists.");
      }
      span.set("did", session.did);

      await deleteListSaveRecord(session.client, session.did, data.listUri);
      invalidateSavedLists(session.did);
      return { ok: true as const };
    }),
  );

// ── React Query options (for the UI) ────────────────────────────────────────

function getListsQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "lists"] as const,
    queryFn: async () => getLists(),
  });
}

function getSavedListsQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "savedLists"] as const,
    queryFn: async () => getSavedLists(),
  });
}

function getListQueryOptions(did: string, rkey: string) {
  return queryOptions({
    queryKey: ["list", did, rkey] as const,
    queryFn: async () => getList({ data: { did, rkey } }),
  });
}

function getListFeedQueryOptions(
  did: string,
  rkey: string,
  { limit = 20, offset = 0 }: { limit?: number; offset?: number } = {},
) {
  return queryOptions({
    queryKey: ["list", did, rkey, "feed", limit, offset] as const,
    queryFn: async () => getListFeed({ data: { did, rkey, limit, offset } }),
  });
}

function putListMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "putList"] as const,
    mutationFn: async (input: z.input<typeof putListInput>) =>
      putList({ data: input }),
  });
}

function deleteListMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "deleteList"] as const,
    mutationFn: async (rkey: string) => deleteList({ data: { rkey } }),
  });
}

function saveListMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "saveList"] as const,
    mutationFn: async (listUri: string) => saveList({ data: { listUri } }),
  });
}

function unsaveListMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "unsaveList"] as const,
    mutationFn: async (listUri: string) => unsaveList({ data: { listUri } }),
  });
}

export const listApi = {
  // own lists
  getLists,
  getListsQueryOptions,
  putList,
  putListMutationOptions,
  deleteList,
  deleteListMutationOptions,
  // public page
  getList,
  getListQueryOptions,
  getListFeed,
  getListFeedQueryOptions,
  // saved lists
  getSavedLists,
  getSavedListsQueryOptions,
  saveList,
  saveListMutationOptions,
  unsaveList,
  unsaveListMutationOptions,
};

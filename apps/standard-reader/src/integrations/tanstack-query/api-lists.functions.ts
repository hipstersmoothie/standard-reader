import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { inArray } from "drizzle-orm";
import { z } from "zod";

import { articleCardsAsAllRead } from "#/lib/track-reading-history";
import {
  getAtprotoSessionForRequest,
  getReaderDidForRequest,
} from "#/middleware/auth-session.server";
import { resolveIdentity } from "#/server/atproto/identity";
import {
  deleteListRecord,
  deleteListSaveRecord,
  newListRkey,
  putListRecord,
  putListSaveRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { Collections, buildAtUri } from "#/server/atproto/uri";
import {
  deleteRecord,
  upsertList,
  upsertListSave,
} from "#/server/ingest/handlers";
import { observe } from "#/server/observability/log";
import { attachCommentCountsToArticles } from "#/server/reader/document-comments";
import {
  followedPublications,
  selectArticleCards,
} from "#/server/reader/queries";
import { attachRecommendedByToArticles } from "#/server/reader/recommended-by";
import type { SubscriptionList } from "#/server/reader/saved-lists";
import {
  hasSavedListDb,
  invalidateSavedLists,
  listUriFromParams,
  readList,
} from "#/server/reader/saved-lists";
import {
  loadOwnSubscriptionLists,
  loadSavedListsHydrated,
} from "#/server/reader/shell-snapshot.server";

import type { ArticleCard, Db, PublicationCard, Schema } from "./api-shapes";
import { dbMiddleware } from "./db-middleware";

/**
 * Publication lists (`app.standard-reader.list`) — named, ordered, shareable
 * lists of publications, like a Bluesky user list. Your own lists double as
 * the sidebar folders; any list has a public page at `/l/$did/$rkey`, and
 * other readers can add it to their app via an `app.standard-reader.listSave`
 * record (deterministic rkey, so save/unsave/status address one record).
 *
 * Lists are mirrored into the Neon read-model (`lists` + `list_saves` tables)
 * by the tap ingester, so reads go to the DB (no PDS I/O on the hot path). A
 * backfill from the PDS runs on first access when no rows exist yet. Saved
 * lists also act as virtual subscriptions (see `#/server/reader/saved-lists`).
 */

const putListInput = z.object({
  /** Omit to create a new list (a fresh TID rkey is generated). */
  rkey: z.string().min(1).optional(),
  name: z.string().trim().min(1).max(64),
  description: z.string().trim().max(300).optional(),
  publications: z.array(z.string().min(1)).max(500),
  users: z.array(z.string().startsWith("did:")).max(500).default([]),
  /** Preserved across edits; defaults to now for new lists. */
  createdAt: z.iso.datetime().optional(),
});

/** Toggle a single user's membership in one of the reader's lists. */
const listMembershipInput = z.object({
  rkey: z.string().min(1),
  did: z.string().startsWith("did:"),
});

const rkeyInput = z.object({
  rkey: z.string().min(1),
});

const listRefInput = z.object({
  did: z.string().min(1),
  rkey: z.string().min(1),
});

const authorListsInput = z.object({
  did: z.string().min(1),
});

const listFeedInput = listRefInput.extend({
  limit: z.number().int().min(1).max(50).default(20),
  offset: z.number().int().min(0).default(0),
  /**
   * When true, filter the page down to documents the reader hasn't read
   * server-side (the "hide read" toggle). Only takes effect for a signed-in
   * reader who tracks reading history; ignored otherwise. Filtering in the query
   * means each page returns a full run of unread articles instead of a sparse
   * client-filtered slice, so pagination and empty states behave predictably.
   */
  hideRead: z.boolean().default(false),
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
  /** Hydrated user members in list order (byline identity for each DID). */
  users: Array<ListOwner>;
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
    // DID-only lookup (no PDS client restore) — list membership is DB data.
    const did = await getReaderDidForRequest(getRequest());
    if (!did) {
      return [] satisfies Array<SubscriptionList>;
    }
    span.set("did", did);

    const lists = await loadOwnSubscriptionLists(null, did);
    span.set("count", lists.length);
    return lists satisfies Array<SubscriptionList>;
  }),
);

const putList = createServerFn({ method: "POST" })
  .validator(putListInput)
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
      span.set("users", data.users.length);
      const createdAt = data.createdAt ?? new Date().toISOString();
      const { uri, cid } = await putListRecord(
        session.client,
        session.did,
        rkey,
        {
          name: data.name,
          description: data.description || undefined,
          publications: data.publications,
          users: data.users,
          createdAt,
        },
      );
      // Write through to the DB mirror so the read path sees the change
      // immediately, without waiting for the tap to deliver the event.
      await upsertList(uri, session.did, rkey, cid, {
        name: data.name,
        description: data.description || undefined,
        publications: data.publications,
        users: data.users,
        createdAt,
      });
      return { ok: true as const, rkey };
    }),
  );

/** Read one of the reader's own lists (from the DB mirror) for a membership
 * edit; throws if it isn't theirs or doesn't exist. */
async function readOwnListForEdit(db: Db, ownerDid: string, rkey: string) {
  const list = await readList(db, ownerDid, rkey);
  if (!list) {
    throw new Error("List not found.");
  }
  return list;
}

/** Persist a mutated member set back to the reader's list record + mirror. */
async function writeListMembers(
  session: { client: Parameters<typeof putListRecord>[0]; did: string },
  rkey: string,
  list: SubscriptionList,
  next: { publications: Array<string>; users: Array<string> },
): Promise<void> {
  const createdAt = list.createdAt ?? new Date().toISOString();
  const record = {
    name: list.name,
    description: list.description || undefined,
    publications: next.publications,
    users: next.users,
    createdAt,
  };
  const { uri, cid } = await putListRecord(
    session.client,
    session.did,
    rkey,
    record,
  );
  await upsertList(uri, session.did, rkey, cid, record);
}

const addUserToList = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(listMembershipInput)
  .handler(
    observe("lists.addUserToList", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage lists.");
      }
      span.set("did", session.did);
      span.set("rkey", data.rkey);
      const list = await readOwnListForEdit(context.db, session.did, data.rkey);
      if (list.users.includes(data.did)) {
        return { ok: true as const };
      }
      await writeListMembers(session, data.rkey, list, {
        publications: list.publications,
        users: [...list.users, data.did],
      });
      return { ok: true as const };
    }),
  );

const removeUserFromList = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(listMembershipInput)
  .handler(
    observe("lists.removeUserFromList", async ({ data, context }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage lists.");
      }
      span.set("did", session.did);
      span.set("rkey", data.rkey);
      const list = await readOwnListForEdit(context.db, session.did, data.rkey);
      if (!list.users.includes(data.did)) {
        return { ok: true as const };
      }
      await writeListMembers(session, data.rkey, list, {
        publications: list.publications,
        users: list.users.filter((u) => u !== data.did),
      });
      return { ok: true as const };
    }),
  );

const deleteList = createServerFn({ method: "POST" })
  .validator(rkeyInput)
  .handler(
    observe("lists.deleteList", async ({ data }, span) => {
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage lists.");
      }
      span.set("did", session.did);
      span.set("rkey", data.rkey);

      await deleteListRecord(session.client, session.did, data.rkey);
      // Write through: remove from the DB mirror so the read path sees the
      // deletion immediately, without waiting for the tap.
      await deleteRecord(
        buildAtUri(session.did, Collections.list, data.rkey),
        Collections.list,
      );
      return { ok: true as const };
    }),
  );

const deleteAllLists = createServerFn({ method: "POST" }).handler(
  observe("lists.deleteAllLists", async (_, span) => {
    const session = await getAtprotoSessionForRequest(getRequest());
    if (!session) {
      throw new Error("Sign in to manage lists.");
    }
    span.set("did", session.did);

    // Read list rkeys from the DB mirror (no PDS I/O for the read).
    const { db } = await import("#/db/index.server");
    const { lists } = await import("#/db/schema");
    const { eq: eqList } = await import("drizzle-orm");

    const rows = await db
      .select({ rkey: lists.rkey })
      .from(lists)
      .where(eqList(lists.ownerDid, session.did));

    await Promise.all(
      rows.map((row) =>
        deleteListRecord(session.client, session.did, row.rkey),
      ),
    );
    // Write through: remove all of the reader's list rows from the DB mirror.
    await Promise.all(
      rows.map((row) =>
        deleteRecord(
          buildAtUri(session.did, Collections.list, row.rkey),
          Collections.list,
        ),
      ),
    );
    invalidateSavedLists(session.did);
    span.set("deleted", rows.length);
    return { ok: true as const, deleted: rows.length };
  }),
);

// ── Public list page ─────────────────────────────────────────────────────────

const getList = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(listRefInput)
  .handler(
    observe("lists.getList", async ({ data, context }, span) => {
      span.set("listDid", data.did);
      span.set("rkey", data.rkey);
      const listUri = listUriFromParams(data.did, data.rkey);

      const session = await getAtprotoSessionForRequest(getRequest());
      const isOwner = session?.did === data.did;
      const { db, schema } = context;
      const [list, isSaved] = await Promise.all([
        readList(db, data.did, data.rkey),
        session && !isOwner
          ? hasSavedListDb(db, session.did, listUri)
          : Promise.resolve(false),
      ]);
      if (!list) {
        span.set("found", false);
        return {
          list: null,
          owner: null,
          publications: [],
          users: [],
          viewer: {
            signedIn: Boolean(session),
            isOwner: false,
            isSaved: false,
          },
        } satisfies ListPage;
      }
      const [publications, owners] = await Promise.all([
        hydrateInListOrder(db, schema, list.publications),
        lookupOwners(db, schema, [data.did, ...list.users]),
      ]);
      span.set("count", publications.length);
      span.set("users", list.users.length);

      const users = list.users
        .map((memberDid) => owners.get(memberDid))
        .filter((owner): owner is ListOwner => owner != null);

      return {
        list,
        owner: owners.get(data.did) ?? {
          did: data.did,
          handle: null,
          displayName: null,
          avatarUrl: null,
        },
        publications,
        users,
        viewer: { signedIn: Boolean(session), isOwner, isSaved },
      } satisfies ListPage;
    }),
  );

const getListFeed = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(listFeedInput)
  .handler(
    observe("lists.getListFeed", async ({ data, context }, span) => {
      span.set("listDid", data.did);
      span.set("rkey", data.rkey);
      span.set("offset", data.offset);

      const { db, schema, trackReadingEnabled, countOldPostsAsUnreadEnabled } =
        context;
      const list = await readList(db, data.did, data.rkey);
      if (
        !list ||
        (list.publications.length === 0 && list.users.length === 0)
      ) {
        span.set("count", 0);
        return {
          items: [],
          nextOffset: null,
        } satisfies ListFeed;
      }

      const session = await getAtprotoSessionForRequest(getRequest());
      const trackReading = session == null ? false : trackReadingEnabled;
      const countOldPostsAsUnread =
        session == null ? true : countOldPostsAsUnreadEnabled;
      // Only the "hide read" toggle asks for unread-only, and only a reader who
      // tracks reading history has read state to filter on.
      const unreadForDid =
        data.hideRead && trackReading ? session?.did : undefined;
      span.set("hideRead", Boolean(unreadForDid));

      const items = await selectArticleCards(db, schema, {
        publicationUris: list.publications,
        followedUserDids: list.users,
        readForDid: trackReading ? session?.did : undefined,
        unreadForDid,
        countOldPostsAsUnread,
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
      const attributed =
        list.users.length > 0
          ? await attachRecommendedByToArticles(
              db,
              schema,
              list.users,
              enriched,
            )
          : enriched;

      return {
        items: attributed,
        nextOffset:
          items.length === data.limit ? data.offset + data.limit : null,
      } satisfies ListFeed;
    }),
  );

// ── Author's public lists (profile "Lists" tab) ──────────────────────────────

const getAuthorLists = createServerFn({ method: "GET" })
  .validator(authorListsInput)
  .handler(
    observe("lists.getAuthorLists", async ({ data }, span) => {
      // The author whose lists these are, not the viewer — see
      // `author.getProfile` for why this is not `did`.
      span.set("subject.did", data.did);
      // Lists are public repo records — no ownership/auth check needed to
      // view another author's lists, same as their publications or posts.
      const lists = await loadOwnSubscriptionLists(null, data.did);
      span.set("count", lists.length);
      return lists satisfies Array<SubscriptionList>;
    }),
  );

// ── Saved lists (other readers' lists added to this app) ────────────────────

const getSavedLists = createServerFn({ method: "GET" }).handler(
  observe("lists.getSavedLists", async (_, span) => {
    // DID-only lookup (no PDS client restore) — list membership is DB data.
    const did = await getReaderDidForRequest(getRequest());
    if (!did) {
      return [] satisfies Array<SavedList>;
    }
    span.set("did", did);

    const [{ db }, schema] = await Promise.all([
      import("#/db/index.server"),
      import("#/db/schema"),
    ]);
    const savedLists = await loadSavedListsHydrated(db, schema, did);
    span.set("count", savedLists.length);
    return savedLists satisfies Array<SavedList>;
  }),
);

const saveList = createServerFn({ method: "POST" })
  .validator(listUriInput)
  .handler(
    observe("lists.saveList", async ({ data }, span) => {
      span.set("listUri", data.listUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to add lists.");
      }
      span.set("did", session.did);

      const createdAt = new Date().toISOString();
      const { uri, cid } = await putListSaveRecord(
        session.client,
        session.did,
        data.listUri,
        createdAt,
      );
      await upsertListSave(uri, session.did, subjectRkey(data.listUri), cid, {
        list: data.listUri,
        createdAt,
      });
      invalidateSavedLists(session.did);
      return { ok: true as const };
    }),
  );

const unsaveList = createServerFn({ method: "POST" })
  .validator(listUriInput)
  .handler(
    observe("lists.unsaveList", async ({ data }, span) => {
      span.set("listUri", data.listUri);
      const session = await getAtprotoSessionForRequest(getRequest());
      if (!session) {
        throw new Error("Sign in to manage lists.");
      }
      span.set("did", session.did);

      await deleteListSaveRecord(session.client, session.did, data.listUri);
      await deleteRecord(
        buildAtUri(
          session.did,
          Collections.listSave,
          subjectRkey(data.listUri),
        ),
        Collections.listSave,
      );
      invalidateSavedLists(session.did);
      return { ok: true as const };
    }),
  );

// ── React Query options (for the UI) ────────────────────────────────────────

function getListsQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "lists"] as const,
    queryFn: async () => getLists(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function getSavedListsQueryOptions() {
  return queryOptions({
    queryKey: ["reader", "savedLists"] as const,
    queryFn: async () => getSavedLists(),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
  });
}

function getAuthorListsQueryOptions(did: string) {
  return queryOptions({
    queryKey: ["author", did, "lists"] as const,
    queryFn: async () => getAuthorLists({ data: { did } }),
    staleTime: 5 * 60_000,
    refetchOnWindowFocus: false,
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
  {
    limit = 20,
    offset = 0,
    hideRead = false,
    readerScope = "guest",
  }: {
    limit?: number;
    offset?: number;
    hideRead?: boolean;
    /** Scopes the cache to the signed-in reader (unread state is per-reader). */
    readerScope?: string;
  } = {},
) {
  return queryOptions({
    queryKey: [
      "list",
      did,
      rkey,
      "feed",
      limit,
      offset,
      hideRead,
      readerScope,
    ] as const,
    queryFn: async () =>
      getListFeed({ data: { did, rkey, limit, offset, hideRead } }),
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

function addUserToListMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "addUserToList"] as const,
    mutationFn: async (input: z.input<typeof listMembershipInput>) =>
      addUserToList({ data: input }),
  });
}

function removeUserFromListMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "removeUserFromList"] as const,
    mutationFn: async (input: z.input<typeof listMembershipInput>) =>
      removeUserFromList({ data: input }),
  });
}

function deleteAllListsMutationOptions() {
  return mutationOptions({
    mutationKey: ["reader", "deleteAllLists"] as const,
    mutationFn: async () => deleteAllLists(),
    retry: false,
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
  deleteAllLists,
  deleteAllListsMutationOptions,
  addUserToList,
  addUserToListMutationOptions,
  removeUserFromList,
  removeUserFromListMutationOptions,
  // public page
  getList,
  getListQueryOptions,
  getListFeed,
  getListFeedQueryOptions,
  // author's public lists
  getAuthorLists,
  getAuthorListsQueryOptions,
  // saved lists
  getSavedLists,
  getSavedListsQueryOptions,
  saveList,
  saveListMutationOptions,
  unsaveList,
  unsaveListMutationOptions,
};

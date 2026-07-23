import type { Client } from "@atcute/client";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { eq } from "drizzle-orm";
import { z } from "zod";

import {
  FEEDBACK_DRAFT_TTL_MS,
  feedbackDraft,
} from "#/db/schema/feedback-draft";
import type { FeedbackDraft } from "#/db/schema/feedback-draft";
import { UPVOTE_DRAFT_TTL_MS, upvoteDraft } from "#/db/schema/upvote-draft";
import type { UpvoteDraft } from "#/db/schema/upvote-draft";
import type { FeedbackStatus } from "#/lib/userinput/space";
import {
  STANDARD_READER_SPACE_URI,
  USERINPUT_APPVIEW_BASE,
  USERINPUT_DISCUSSION_SOURCE,
  USERINPUT_LIST_DISCUSSIONS_METHOD,
  USERINPUT_UPVOTE_SOURCE,
  fetchStandardReaderDiscussionStatuses,
  resolveStandardReaderSpaceStrongRef,
} from "#/lib/userinput/space";
import {
  getAtprotoSessionForRequest,
  getReaderContextForRequest,
} from "#/middleware/auth-session.server";
import { fetchRepoRecordWithFallback } from "#/server/atproto/fetch-record";
import {
  createUserinputDiscussionRecord,
  createUserinputUpvoteRecord,
  deleteUserinputUpvoteRecord,
  listCollectionRecords,
} from "#/server/atproto/repo-records";
import { parseAtUri } from "#/server/atproto/uri";
import { observe } from "#/server/observability/log";

/**
 * userinput.app feedback API.
 *
 * Write path: create an `app.userinput.discussion` record in the signed-in
 * reader's own repo (source of truth — no DB mirror; this is a third-party
 * collection per AGENTS.md §3(c)). The record's `space` strongRef pins it to
 * Standard Reader's feedback space.
 *
 * Draft path: a pending draft is stashed server-side before the OAuth
 * scope-upgrade round-trip and consumed once on `/feedback/return` to
 * auto-create the record.
 *
 * Read path: list discussions for our space via the constellation AppView
 * (`app.userinput.constellation.listDiscussions`). Also third-party, no DB
 * mirror.
 */

/**
 * Persist a pending feedback draft. Returns the row's id (threaded through
 * OAuth `state.redirect` as `?draft=<id>`). Auth-scoped to `userId` so a leaked
 * id can't be used by another reader.
 */
async function createFeedbackDraft(input: {
  userId: string;
  title: string;
  body: string | null;
  tag: "bug" | "feature" | "question";
}): Promise<{ id: string }> {
  const { db } = await import("#/db/index.server");
  const id = crypto.randomUUID();
  await db.insert(feedbackDraft).values({
    id,
    userId: input.userId,
    title: input.title,
    body: input.body,
    tag: input.tag,
    expiresAt: new Date(Date.now() + FEEDBACK_DRAFT_TTL_MS),
  });
  return { id };
}

/**
 * Atomic delete-and-return. Returns the draft row iff it exists, belongs to
 * `userId`, and hasn't expired; returns `null` otherwise. Single-use by
 * design: a refresh on `/feedback/return` won't re-create the record.
 */
async function consumeFeedbackDraft(
  id: string,
  userId: string,
): Promise<FeedbackDraft | null> {
  const { db } = await import("#/db/index.server");
  const [deleted] = await db
    .delete(feedbackDraft)
    .where(eq(feedbackDraft.id, id))
    .returning();
  if (!deleted) return null;
  if (deleted.userId !== userId) return null;
  if (deleted.expiresAt.getTime() <= Date.now()) return null;
  return deleted;
}

const discussionInput = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(600, "Title is too long (600 characters max)"),
  body: z
    .string()
    .max(20_000, "Body is too long (20000 characters max)")
    .optional(),
  tag: z.enum(["bug", "feature", "question"]),
});

/**
 * Create an `app.userinput.discussion` record in the reader's repo. Throws if
 * not signed in, or the server surfaces a `ScopeMissingError` if the reader's
 * OAuth grant doesn't include `app.userinput.discussion` — the client detects
 * that and triggers the `upgradeToUserinputFeedback` flow.
 *
 * Returns `{ uri, cid }` on success; the client uses the uri to build a link
 * to the discussion on userinput.app.
 */
const createUserinputDiscussion = createServerFn({ method: "POST" })
  .validator(discussionInput)
  .handler(
    observe("userinput.createUserinputDiscussion", async ({ data }, span) => {
      const request = getRequest();
      const session = await getAtprotoSessionForRequest(request);
      if (!session) {
        const reader = await getReaderContextForRequest(request);
        if (reader) {
          throw new Error(
            "ScopeMissingError: app.userinput.discussion (re-authorization required)",
          );
        }
        throw new Error("Sign in to submit feedback.");
      }
      span.set("did", session.did);
      span.set("tag", data.tag);

      const space = await resolveStandardReaderSpaceStrongRef();
      const createdAt = new Date().toISOString();
      const { uri, cid } = await createUserinputDiscussionRecord(
        session.client,
        session.did,
        {
          spaceUri: space.uri,
          spaceCid: space.cid,
          title: data.title,
          body: data.body ?? null,
          tags: [data.tag],
          createdAt,
        },
      );
      span.set("uri", uri);
      return { uri, cid };
    }),
  );

const draftInput = z.object({
  title: z.string().min(1).max(600),
  body: z.string().max(20_000).optional(),
  tag: z.enum(["bug", "feature", "question"]),
});

/**
 * Stash a pending feedback draft before the OAuth round-trip. Returns the
 * draft id (carried through OAuth as `?draft=<id>`); the landing page
 * consumes it once via {@link consumeFeedbackDraft}.
 */
const createFeedbackDraftFn = createServerFn({ method: "POST" })
  .validator(draftInput)
  .handler(async ({ data }) => {
    const reader = await getReaderContextForRequest(getRequest());
    if (!reader) {
      throw new Error("Unauthorized");
    }
    const draft = await createFeedbackDraft({
      userId: reader.userId,
      title: data.title,
      body: data.body ?? null,
      tag: data.tag,
    });
    return draft;
  });

const consumeDraftInput = z.object({
  draftId: z.string().min(1),
});

/**
 * Single-use atomic consume of a stashed draft. Returns the draft fields or
 * `null` if it doesn't exist, doesn't belong to the caller, or has expired.
 * The landing page uses this to recover the draft, then immediately creates
 * the discussion via {@link createUserinputDiscussion}.
 */
const consumeFeedbackDraftFn = createServerFn({ method: "GET" })
  .validator(consumeDraftInput)
  .handler(async ({ data }) => {
    const reader = await getReaderContextForRequest(getRequest());
    if (!reader) {
      return null;
    }
    return consumeFeedbackDraft(data.draftId, reader.userId);
  });

const listInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  cursor: z.string().optional(),
});

/**
 * Discussion author summary. Constellation backlinks don't include author
 * profile data, so we hydrate these via `app.bsky.actor.getProfiles` (batched)
 * after fetching the backlinks. All fields are nullable since profile fetches
 * can fail or the DID may not have a Bluesky profile.
 */
interface UserinputAuthor {
  did: string;
  handle?: string | null;
  displayName?: string | null;
  avatar?: string | null;
}

/**
 * A discussion record, as reconstructed from a constellation backlink +
 * hydrated author. The `uri` is the discussion record's AT-URI; `author.did`
 * is parsed from that uri. `upvoteCount` is fetched via a parallel
 * `getBacklinksCount` call per discussion. `cid` carries the record's CID
 * (when the host returned it) so the upvote write path can build a strongRef
 * without re-fetching the record.
 */
export interface UserinputDiscussion {
  uri: string;
  cid?: string;
  author: UserinputAuthor;
  title: string;
  body?: string | null;
  tags?: Array<string>;
  createdAt: string;
  upvoteCount: number;
  status?: FeedbackStatus;
}

/**
 * A raw backlink reference from `blue.microcosm.links.getBacklinks`. Constellation
 * returns *references* (did + collection + rkey), not full records — the record
 * must be fetched separately from the author's PDS (via Slingshot/fallback).
 */
interface ConstellationBacklink {
  did: string;
  collection: string;
  rkey: string;
}

interface ConstellationBacklinksResponse {
  records?: Array<ConstellationBacklink>;
  cursor?: string;
}

/** Build the AT-URI for a backlink reference. */
function backlinkUri(b: ConstellationBacklink): string {
  return `at://${b.did}/${b.collection}/${b.rkey}`;
}

/**
 * Batch-resolve profile fields (handle, displayName, avatar) for a set of DIDs
 * via the public Bluesky API. Returns a Map keyed by DID. DIDs that fail to
 * resolve are simply absent from the map — the caller falls back to a bare DID.
 */
async function hydrateAuthors(
  dids: Array<string>,
): Promise<Map<string, UserinputAuthor>> {
  const out = new Map<string, UserinputAuthor>();
  if (dids.length === 0) return out;
  try {
    const url = new URL(
      "https://public.api.bsky.app/xrpc/app.bsky.actor.getProfiles",
    );
    for (const did of dids) {
      url.searchParams.append("actors[]", did);
    }
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return out;
    const json = (await res.json()) as {
      profiles?: Array<{
        did: string;
        handle?: string | null;
        displayName?: string | null;
        avatar?: string | null;
      }>;
    };
    for (const p of json.profiles ?? []) {
      out.set(p.did, {
        did: p.did,
        handle: p.handle ?? null,
        displayName: p.displayName ?? null,
        avatar: p.avatar ?? null,
      });
    }
  } catch {
    // Best-effort enrichment; fall back to bare DIDs.
  }
  return out;
}

/** The record value shape we fetch via `com.atproto.repo.getRecord`. */
interface DiscussionRecordValue {
  title: string;
  body?: string;
  tags?: Array<string>;
  createdAt: string;
  space?: { uri: string; cid?: string };
}

/**
 * Fetch the full discussion record for a backlink reference. Uses
 * `fetchRepoRecordWithFallback` (Slingshot cache → PDS fallback) so we don't
 * hammer individual PDSes. Returns null if the record can't be fetched (deleted,
 * migrated, or PDS unreachable) — the caller skips it.
 */
async function fetchDiscussionRecord(b: ConstellationBacklink): Promise<{
  uri: string;
  cid?: string;
  value: DiscussionRecordValue;
} | null> {
  const uri = backlinkUri(b);
  const res = await fetchRepoRecordWithFallback(uri);
  if (!res || !res.value) return null;
  const value = res.value as DiscussionRecordValue;
  if (!value.title || !value.createdAt) return null;
  return { uri, value, ...(res.cid ? { cid: res.cid } : {}) };
}

/**
 * Fetch the upvote count for a single discussion via the constellation
 * `getBacklinksCount` endpoint (upvotes are backlinks to the discussion's URI
 * with source `app.userinput.upvote:subject.uri`). Returns 0 on any failure —
 * counts are best-effort and a missing count shouldn't drop a discussion.
 */
async function fetchUpvoteCount(discussionUri: string): Promise<number> {
  try {
    const url = new URL(
      `${USERINPUT_APPVIEW_BASE}/xrpc/blue.microcosm.links.getBacklinksCount`,
    );
    url.searchParams.set("subject", discussionUri);
    url.searchParams.set("source", USERINPUT_UPVOTE_SOURCE);
    const res = await fetch(url, {
      signal: AbortSignal.timeout(8000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) return 0;
    const json = (await res.json()) as { total?: number };
    return json.total ?? 0;
  } catch {
    return 0;
  }
}

/**
 * Fetch upvote counts for a set of discussion URIs in parallel. Returns a Map
 * keyed by URI. The constellation endpoint has no bulk variant, so this is one
 * request per discussion — acceptable for a feedback board (tens of items, not
 * thousands). Failures default to 0.
 */
async function fetchUpvoteCounts(
  uris: Array<string>,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (uris.length === 0) return out;
  const counts = await Promise.all(uris.map((uri) => fetchUpvoteCount(uri)));
  for (let i = 0; i < uris.length; i++) {
    out.set(uris[i], counts[i]);
  }
  return out;
}

/**
 * The value shape of an `app.userinput.upvote` record. The `subject` is a
 * strongRef (uri + cid) pointing at the discussion the viewer upvoted.
 */
interface UpvoteRecordValue {
  subject?: { uri?: string; cid?: string };
}

/**
 * Fetch the set of discussion URIs the signed-in viewer has already upvoted,
 * by enumerating `app.userinput.upvote` records in their own repo. Returns an
 * empty set for signed-out users, users without a restorable OAuth session, or
 * users who haven't granted the upvote scope — in all those cases the viewer
 * simply has no known upvotes, and the upvote button triggers the upgrade flow
 * on first click.
 */
async function fetchViewerUpvotedUris(
  client: Client,
  did: string,
): Promise<Set<string>> {
  try {
    const records = await listCollectionRecords(
      client,
      did,
      "app.userinput.upvote",
    );
    const uris = new Set<string>();
    for (const record of records) {
      const value = record.value as UpvoteRecordValue;
      if (value?.subject?.uri) {
        uris.add(value.subject.uri);
      }
    }
    return uris;
  } catch {
    // Scope missing, session unrestorable, or PDS unreachable — treat as
    // "no known upvotes"; the button will trigger the upgrade flow on click.
    return new Set();
  }
}

/**
 * List discussions for Standard Reader's feedback space. Constellation is a
 * generic backlinks indexer: we query `blue.microcosm.links.getBacklinks` for
 * references to our space record (source = "app.userinput.discussion:space.uri"),
 * then fetch each discussion record via Slingshot/PDS, and finally hydrate
 * author profiles via the public Bluesky API. All server-side to keep the
 * origins out of the client bundle and allow caching + observation.
 */
const listFeedbackDiscussions = createServerFn({ method: "GET" })
  .validator(listInput)
  .handler(
    observe("userinput.listFeedbackDiscussions", async ({ data }, span) => {
      span.set("limit", data.limit);

      // Resolve the signed-in viewer's OAuth session (best-effort) so we can
      // fetch their existing upvotes alongside the discussions. Signed-out
      // users, or users without a restorable session, get an empty set — the
      // upvote button triggers the upgrade flow on first click.
      const session = await getAtprotoSessionForRequest(getRequest());

      const url = new URL(
        `${USERINPUT_APPVIEW_BASE}/xrpc/${USERINPUT_LIST_DISCUSSIONS_METHOD}`,
      );
      url.searchParams.set("subject", STANDARD_READER_SPACE_URI);
      url.searchParams.set("source", USERINPUT_DISCUSSION_SOURCE);
      url.searchParams.set("limit", String(data.limit));
      if (data.cursor) {
        url.searchParams.set("cursor", data.cursor);
      }

      const res = await fetch(url, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: "application/json" },
      });
      if (!res.ok) {
        span.set("error", `getBacklinks ${res.status}`);
        throw new Error(
          `Could not load feedback (${res.status}). Try again in a moment.`,
        );
      }
      const json = (await res.json()) as ConstellationBacklinksResponse;
      const backlinks = json.records ?? [];
      span.set("backlinks", backlinks.length);

      if (backlinks.length === 0) {
        return {
          discussions: [],
          cursor: json.cursor,
          viewerUpvotedUris: [],
        };
      }

      // Fetch each discussion record in parallel (Slingshot caches these).
      const records = await Promise.all(
        backlinks.map((b) => fetchDiscussionRecord(b)),
      );
      const validRecords = records.filter(
        (
          r,
        ): r is {
          uri: string;
          cid?: string;
          value: DiscussionRecordValue;
        } => r !== null,
      );

      // Collect unique author DIDs for batch profile hydration.
      const authorDids = [
        ...new Set(
          validRecords
            .map((r) => /^at:\/\/([^/]+)/.exec(r.uri)?.[1] ?? "")
            .filter(Boolean),
        ),
      ];
      const discussionUris = validRecords.map((r) => r.uri);

      // Hydrate authors + fetch upvote counts + fetch the viewer's upvotes +
      // fetch discussion statuses, all in parallel (all independent).
      const [authors, upvoteCounts, viewerUpvotedUris, statuses] =
        await Promise.all([
          hydrateAuthors(authorDids),
          fetchUpvoteCounts(discussionUris),
          session
            ? fetchViewerUpvotedUris(session.client, session.did)
            : Promise.resolve(new Set<string>()),
          fetchStandardReaderDiscussionStatuses(),
        ]);

      const discussions: Array<UserinputDiscussion> = validRecords.map((r) => {
        const did = /^at:\/\/([^/]+)/.exec(r.uri)?.[1] ?? "";
        const status = statuses.get(r.uri);
        return {
          uri: r.uri,
          ...(r.cid ? { cid: r.cid } : {}),
          author: authors.get(did) ?? { did },
          title: r.value.title,
          body: r.value.body ?? null,
          tags: r.value.tags,
          createdAt: r.value.createdAt,
          upvoteCount: upvoteCounts.get(r.uri) ?? 0,
          ...(status ? { status } : {}),
        };
      });

      // Sort by upvote count (desc), then by recency (newer first) as a
      // tiebreaker so ties don't shuffle on every fetch.
      discussions.sort((a, b) => {
        if (b.upvoteCount !== a.upvoteCount) {
          return b.upvoteCount - a.upvoteCount;
        }
        return b.createdAt.localeCompare(a.createdAt);
      });

      return {
        discussions,
        cursor: json.cursor,
        viewerUpvotedUris: [...viewerUpvotedUris],
      };
    }),
  );

const upvoteInput = z.object({
  subjectUri: z
    .string()
    .min(1, "Subject is required")
    .startsWith("at://", "Subject must be an AT-URI"),
  /** Optional subject cid. Re-resolved server-side when omitted so the client
   * doesn't have to thread the freshest cid through. */
  subjectCid: z.string().optional(),
});

/**
 * Resolve the subject's cid for an upvote strongRef. The discussion's cid may
 * have changed since the listing was fetched (the author edited the post), so
 * we re-fetch it from Slingshot/PDS at upvote time. Falls back to the
 * client-supplied cid when the record can't be re-fetched (deleted, migrated)
 * so the write can still proceed against a possibly-stale ref.
 */
async function resolveSubjectCid(
  subjectUri: string,
  clientSuppliedCid: string | undefined,
): Promise<string> {
  if (clientSuppliedCid) return clientSuppliedCid;
  const res = await fetchRepoRecordWithFallback(subjectUri);
  if (res?.cid) return res.cid;
  throw new Error(
    "Could not resolve the discussion to upvote. It may have been deleted.",
  );
}

/**
 * Create an `app.userinput.upvote` record in the voter's repo. The upvote
 * lexicon uses `key: "any"` and is written at the SAME rkey as its subject
 * (the discussion's rkey), so each reader holds at most one upvote per
 * discussion — re-upvoting is a no-op replace.
 *
 * Throws `ScopeMissingError` (surfaced by the atproto client) when the reader's
 * OAuth grant doesn't include `app.userinput.upvote`; the client detects that
 * and triggers `upgradeToUserinputFeedback` to add the scope.
 *
 * The subject rkey is parsed from the subject uri; the subject cid is
 * re-resolved server-side via Slingshot/PDS so the strongRef is fresh.
 */
const createUserinputUpvote = createServerFn({ method: "POST" })
  .validator(upvoteInput)
  .handler(
    observe("userinput.createUserinputUpvote", async ({ data }, span) => {
      const request = getRequest();
      const session = await getAtprotoSessionForRequest(request);
      if (!session) {
        // Distinguish "not signed in at all" from "signed in but the OAuth
        // client can't be restored" (revoked/expired PDS session). In the
        // latter case the reader context exists, so we surface a
        // ScopeMissingError-shaped error: the client treats it as "needs
        // re-auth" and kicks off the upgrade flow, which re-establishes a
        // valid OAuth session with the userinput scopes — instead of a
        // confusing "Sign in to upvote." toast for an already-signed-in user.
        const reader = await getReaderContextForRequest(request);
        if (reader) {
          throw new Error(
            "ScopeMissingError: app.userinput.upvote (re-authorization required)",
          );
        }
        throw new Error("Sign in to upvote.");
      }
      span.set("did", session.did);
      span.set("subjectUri", data.subjectUri);

      const parsed = parseAtUri(data.subjectUri);
      if (!parsed) {
        throw new Error("Invalid discussion uri.");
      }
      const subjectCid = await resolveSubjectCid(
        data.subjectUri,
        data.subjectCid,
      );
      const createdAt = new Date().toISOString();
      const { uri, cid } = await createUserinputUpvoteRecord(
        session.client,
        session.did,
        {
          subjectUri: data.subjectUri,
          subjectCid,
          subjectRkey: parsed.rkey,
          createdAt,
        },
      );
      span.set("uri", uri);
      return { uri, cid };
    }),
  );

/**
 * Delete the viewer's `app.userinput.upvote` record for a discussion. The
 * upvote record lives at the same rkey as its subject (the discussion's rkey),
 * so we parse the rkey from the subject uri and delete at that key. Idempotent
 * — deleting a missing record is a no-op at the PDS.
 *
 * Throws `ScopeMissingError` (shaped) when the reader is signed in but the
 * OAuth client can't be restored, matching the create path so the client
 * triggers the re-auth/upgrade flow instead of a confusing "sign in" message.
 */
const deleteUserinputUpvote = createServerFn({ method: "POST" })
  .validator(upvoteInput)
  .handler(
    observe("userinput.deleteUserinputUpvote", async ({ data }, span) => {
      const request = getRequest();
      const session = await getAtprotoSessionForRequest(request);
      if (!session) {
        const reader = await getReaderContextForRequest(request);
        if (reader) {
          throw new Error(
            "ScopeMissingError: app.userinput.upvote (re-authorization required)",
          );
        }
        throw new Error("Sign in to remove your upvote.");
      }
      span.set("did", session.did);
      span.set("subjectUri", data.subjectUri);

      const parsed = parseAtUri(data.subjectUri);
      if (!parsed) {
        throw new Error("Invalid discussion uri.");
      }
      await deleteUserinputUpvoteRecord(
        session.client,
        session.did,
        parsed.rkey,
      );
      return { ok: true };
    }),
  );

const upvoteDraftInput = z.object({
  subjectUri: z
    .string()
    .min(1)
    .startsWith("at://", "Subject must be an AT-URI"),
});

/**
 * Stash a pending upvote before the OAuth round-trip. Returns the draft id
 * (carried through OAuth as `?upvote=<id>`); the landing page consumes it once
 * via {@link consumeUpvoteDraft} and then creates the upvote record.
 */
async function createUpvoteDraft(input: {
  userId: string;
  subjectUri: string;
}): Promise<{ id: string }> {
  const { db } = await import("#/db/index.server");
  const id = crypto.randomUUID();
  await db.insert(upvoteDraft).values({
    id,
    userId: input.userId,
    subjectUri: input.subjectUri,
    expiresAt: new Date(Date.now() + UPVOTE_DRAFT_TTL_MS),
  });
  return { id };
}

/**
 * Atomic delete-and-return. Returns the draft row iff it exists, belongs to
 * `userId`, and hasn't expired; returns `null` otherwise. Single-use by design.
 */
async function consumeUpvoteDraft(
  id: string,
  userId: string,
): Promise<UpvoteDraft | null> {
  const { db } = await import("#/db/index.server");
  const [deleted] = await db
    .delete(upvoteDraft)
    .where(eq(upvoteDraft.id, id))
    .returning();
  if (!deleted) return null;
  if (deleted.userId !== userId) return null;
  if (deleted.expiresAt.getTime() <= Date.now()) return null;
  return deleted;
}

const createUpvoteDraftFn = createServerFn({ method: "POST" })
  .validator(upvoteDraftInput)
  .handler(async ({ data }) => {
    const reader = await getReaderContextForRequest(getRequest());
    if (!reader) {
      throw new Error("Unauthorized");
    }
    const draft = await createUpvoteDraft({
      userId: reader.userId,
      subjectUri: data.subjectUri,
    });
    return draft;
  });

const consumeUpvoteDraftInput = z.object({
  draftId: z.string().min(1),
});

/**
 * Single-use atomic consume of a stashed upvote draft. Returns the subject uri
 * or `null` if it doesn't exist, doesn't belong to the caller, or has expired.
 */
const consumeUpvoteDraftFn = createServerFn({ method: "GET" })
  .validator(consumeUpvoteDraftInput)
  .handler(async ({ data }) => {
    const reader = await getReaderContextForRequest(getRequest());
    if (!reader) {
      return null;
    }
    return consumeUpvoteDraft(data.draftId, reader.userId);
  });

export const userinputApi = {
  createUserinputDiscussion,
  createFeedbackDraft: createFeedbackDraftFn,
  consumeFeedbackDraft: consumeFeedbackDraftFn,
  listFeedbackDiscussions,
  createUserinputUpvote,
  deleteUserinputUpvote,
  createUpvoteDraft: createUpvoteDraftFn,
  consumeUpvoteDraft: consumeUpvoteDraftFn,
  getFeedbackDiscussionsQueryOptions: ({
    limit = 50,
    cursor,
  }: { limit?: number; cursor?: string } = {}) =>
    queryOptions({
      queryKey: ["userinput", "discussions", limit, cursor ?? ""] as const,
      queryFn: async () =>
        listFeedbackDiscussions({
          data: { limit, ...(cursor ? { cursor } : {}) },
        }),
      staleTime: 60_000,
    }),
};

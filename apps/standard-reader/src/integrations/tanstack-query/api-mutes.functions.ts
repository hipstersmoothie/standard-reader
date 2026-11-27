import { ClientResponseError } from "@atcute/client";
import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { hasMuteWriteScope } from "#/integrations/auth/scope";
import { MAX_MUTED_WORD_LENGTH } from "#/lib/muted-words";
import { classifyMuteSubject } from "#/lib/mutes";
import {
  getAtprotoSessionForRequest,
  getReaderContextForRequest,
} from "#/middleware/auth-session.server";
import { cdnImageUrl } from "#/server/atproto/blob";
import {
  deleteMuteRecords,
  putMuteRecord,
  subjectRkey,
} from "#/server/atproto/repo-records";
import { upsertMute } from "#/server/ingest/handlers";
import { ensureTracked } from "#/server/ingest/tracked-repos";
import type {
  MutedPublicationRow,
  MutedUserRow,
  MutedWordRow,
} from "#/server/mutes/mutes";
import {
  addMutedWord,
  countReaderMutes,
  invalidateMuteCache,
  isMutedForViewer,
  readerMutedPublications,
  readerMutedUsers,
  readerMutedWords,
  removeMutedWord,
} from "#/server/mutes/mutes";
import { observe } from "#/server/observability/log";

import { dbMiddleware } from "./db-middleware";

export type { MutedUserRow, MutedWordRow };

/** {@link MutedPublicationRow} with the icon blob resolved to a browser URL. */
export interface MutedPublicationItem extends Omit<
  MutedPublicationRow,
  "iconCid"
> {
  iconUrl: string | null;
}

/**
 * Mutes — reading and writing the reader's `app.standard-reader.graph.mute`
 * records.
 *
 * Writes go to the reader's repo, never to our tables directly: the record is
 * the mute, and the read-model is a mirror. Unlike blocks (arbitrary repos,
 * refreshed by re-reading the PDS), a mute is our own record with a
 * deterministic rkey, so every write here eagerly mirrors the row it just
 * wrote — the mute takes effect on the very next page, and the firehose upsert
 * that follows is a no-op.
 */

const muteInput = z.object({
  /** A user DID (`did:...`) or a publication AT-URI (`at://...`). */
  subject: z
    .string()
    .min(1)
    .max(2048)
    .refine((value) => classifyMuteSubject(value) !== null, {
      message: "Subject must be a user DID or a publication AT-URI.",
    }),
});

const mutedSettingsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
});

/** The reader's mutes, as the settings page renders them. */
export interface MutedSettings {
  /** Users the reader mutes, newest first. */
  users: Array<MutedUserRow>;
  /** Publications the reader mutes, newest first. */
  publications: Array<MutedPublicationItem>;
  /** Words the reader mutes, alphabetical. Private — never a repo record. */
  words: Array<MutedWordRow>;
  /** Total mutes across users, publications, and words. */
  count: number;
  /**
   * Whether the reader has granted write access to their mute records. When
   * false the user/publication lists are read-only: their mutes are still
   * enforced, they just can't add or remove one without re-authorizing.
   * Muted words are app-private, so they never need this.
   */
  canWrite: boolean;
}

const getMutedSettings = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(mutedSettingsInput)
  .handler(
    observe(
      "mutes.getSettings",
      async ({ data, context }, span): Promise<MutedSettings | null> => {
        const { db, schema } = context;
        const reader = await getReaderContextForRequest(getRequest());
        if (!reader) return null;
        span.set("did", reader.did);

        const [users, publications, words, count, account] = await Promise.all([
          readerMutedUsers(db, schema, reader.did, { limit: data.limit }),
          readerMutedPublications(db, schema, reader.did, {
            limit: data.limit,
          }),
          readerMutedWords(db, schema, reader.did),
          countReaderMutes(db, schema, reader.did),
          db.query.account.findFirst({
            where: and(
              eq(schema.account.userId, reader.userId),
              eq(schema.account.providerId, "atproto"),
            ),
            columns: { scope: true },
          }),
        ]);

        span.set("count", count);
        return {
          users,
          publications: publications.map(
            ({ iconCid, ...row }): MutedPublicationItem => ({
              ...row,
              iconUrl:
                iconCid && row.ownerDid
                  ? cdnImageUrl(row.ownerDid, iconCid, "png")
                  : null,
            }),
          ),
          words,
          count,
          canWrite: hasMuteWriteScope(account?.scope),
        };
      },
    ),
  );

/**
 * The two facts surfaces outside `/settings/muted` want: whether a Mute button
 * would work, and the headline count for the settings row. Mirrors
 * `getBlockCapability`.
 */
export interface MuteCapability {
  canWrite: boolean;
  count: number;
}

const getMuteCapability = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .handler(
    observe(
      "mutes.getCapability",
      async ({ context }, span): Promise<MuteCapability | null> => {
        const { db, schema } = context;
        const reader = await getReaderContextForRequest(getRequest());
        if (!reader) return null;

        const [account, count] = await Promise.all([
          db.query.account.findFirst({
            where: and(
              eq(schema.account.userId, reader.userId),
              eq(schema.account.providerId, "atproto"),
            ),
            columns: { scope: true },
          }),
          countReaderMutes(db, schema, reader.did),
        ]);
        span.set("count", count);
        return { canWrite: hasMuteWriteScope(account?.scope), count };
      },
    ),
  );

/** Whether one subject is muted by the reader, for the menu items. */
const getMuteState = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(muteInput)
  .handler(
    observe(
      "mutes.getMuteState",
      async ({ data, context }, span): Promise<{ muted: boolean }> => {
        const reader = await getReaderContextForRequest(getRequest());
        if (!reader) return { muted: false };
        const muted = await isMutedForViewer(
          context.db,
          context.schema,
          reader.did,
          data.subject,
        );
        span.set("muted", muted);
        return { muted };
      },
    ),
  );

/**
 * Thrown when the reader hasn't granted mute-write access yet, so the UI can
 * offer the re-authorize flow instead of surfacing a raw PDS rejection.
 *
 * Two paths throw it: the optimistic scope-string check below, and a 401/403
 * from the PDS on the write itself — the latter catches sessions whose
 * `include:authBasicFeatures` grant predates the set being republished with
 * the mute collection and wasn't re-expanded (PDS-dependent behavior).
 */
const NEEDS_MUTE_SCOPE = "needs-mute-scope";

/** The reader's authenticated PDS client, once we know they can write mutes. */
async function requireMuteWriter() {
  const session = await getAtprotoSessionForRequest(getRequest());
  if (!session) {
    throw new Error("Unauthorized");
  }
  const [{ db }, schema] = await Promise.all([
    import("#/db/index.server"),
    import("#/db/schema"),
  ]);
  const account = await db.query.account.findFirst({
    where: and(
      eq(schema.account.userId, session.session.user.id),
      eq(schema.account.providerId, "atproto"),
    ),
    columns: { scope: true },
  });
  if (!hasMuteWriteScope(account?.scope)) {
    throw new Error(NEEDS_MUTE_SCOPE);
  }
  return session;
}

/**
 * Re-throw a PDS rejection of a mute write as {@link NEEDS_MUTE_SCOPE} when it
 * looks like a scope problem. After a successful session resume, a 401/403 on
 * a write to the reader's *own* repo means the token doesn't cover the
 * collection — the pre-republish-grant case the optimistic check can't see.
 */
function rethrowMuteScopeRejection(error: unknown): never {
  if (
    error instanceof ClientResponseError &&
    (error.status === 401 || error.status === 403)
  ) {
    throw new Error(NEEDS_MUTE_SCOPE);
  }
  throw error;
}

const muteSubject = createServerFn({ method: "POST" })
  .validator(muteInput)
  .handler(
    observe("mutes.mute", async ({ data }, span) => {
      const session = await requireMuteWriter();
      span.set("did", session.did);
      const classified = classifyMuteSubject(data.subject);
      if (!classified) {
        throw new Error("Subject must be a user DID or a publication AT-URI.");
      }
      if (classified.kind === "user" && classified.did === session.did) {
        throw new Error("You can't mute yourself.");
      }

      const createdAt = new Date().toISOString();
      let written: { uri: string; cid: string };
      try {
        written = await putMuteRecord(
          session.client,
          session.did,
          data.subject,
          createdAt,
        );
      } catch (error) {
        rethrowMuteScopeRejection(error);
      }
      // Eagerly mirror the record we just wrote so the mute takes effect on
      // the next page instead of at firehose latency.
      await upsertMute(
        written.uri,
        session.did,
        subjectRkey(data.subject),
        written.cid,
        { subject: data.subject, createdAt },
      );
      invalidateMuteCache(session.did);
      await trackReaderRepo(session.did);
      return { muted: true as const };
    }),
  );

const unmuteSubject = createServerFn({ method: "POST" })
  .validator(muteInput)
  .handler(
    observe("mutes.unmute", async ({ data }, span) => {
      const session = await requireMuteWriter();
      span.set("did", session.did);

      // Other clients may have written TID-rkey mute records for the same
      // subject; the mirror's rkeys make unmuting cover those too.
      const [{ db }, schema] = await Promise.all([
        import("#/db/index.server"),
        import("#/db/schema"),
      ]);
      const rows = await db
        .select({ rkey: schema.mutes.rkey, uri: schema.mutes.uri })
        .from(schema.mutes)
        .where(
          and(
            eq(schema.mutes.muterDid, session.did),
            eq(schema.mutes.subject, data.subject),
            eq(schema.mutes.deleted, false),
          ),
        );

      try {
        await deleteMuteRecords(
          session.client,
          session.did,
          data.subject,
          rows.map((row) => row.rkey),
        );
      } catch (error) {
        rethrowMuteScopeRejection(error);
      }
      // Eagerly drop the mirror rows; the firehose delete that follows is a
      // no-op. Hard delete to match the ingest delete path.
      const uris = rows.map((row) => row.uri);
      if (uris.length > 0) {
        const { inArray } = await import("drizzle-orm");
        await db.delete(schema.mutes).where(inArray(schema.mutes.uri, uris));
      }
      invalidateMuteCache(session.did);
      return { muted: false as const };
    }),
  );

// ── Muted words ─────────────────────────────────────────────────────────────
//
// Unlike user/publication mutes these never touch the PDS: a muted-word list is
// app-private state (see `db/schema/mutes.ts#mutedWords`), so writes go
// straight to our table and need no mute-write scope — only a signed-in
// reader.

const mutedWordInput = z.object({
  // Generous on raw length: normalization (whitespace collapse) runs server
  // side and enforces the real cap.
  word: z
    .string()
    .min(1)
    .max(MAX_MUTED_WORD_LENGTH * 4),
});

/** Thrown when a word normalizes to nothing matchable (e.g. `***`). */
const INVALID_MUTED_WORD = "invalid-muted-word";
/** Thrown when the reader is already at `MAX_MUTED_WORDS`. */
const MUTED_WORD_LIMIT = "muted-word-limit";

const muteWord = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(mutedWordInput)
  .handler(
    observe("mutes.muteWord", async ({ data, context }, span) => {
      const reader = await getReaderContextForRequest(getRequest());
      if (!reader) throw new Error("Unauthorized");
      span.set("did", reader.did);
      const result = await addMutedWord(
        context.db,
        context.schema,
        reader.did,
        data.word,
      );
      if (!result.ok) {
        span.set("rejected", result.reason);
        throw new Error(
          result.reason === "limit" ? MUTED_WORD_LIMIT : INVALID_MUTED_WORD,
        );
      }
      return { word: result.word };
    }),
  );

const unmuteWord = createServerFn({ method: "POST" })
  .middleware([dbMiddleware])
  .validator(mutedWordInput)
  .handler(
    observe("mutes.unmuteWord", async ({ data, context }, span) => {
      const reader = await getReaderContextForRequest(getRequest());
      if (!reader) throw new Error("Unauthorized");
      span.set("did", reader.did);
      await removeMutedWord(context.db, context.schema, reader.did, data.word);
      return { word: data.word };
    }),
  );

/**
 * Register the reader's own repo with tap (best-effort) so their mute records
 * flow back into the read-model. Idempotent; never fails the request.
 */
async function trackReaderRepo(did: string): Promise<void> {
  try {
    await ensureTracked(did, "reader");
  } catch (error) {
    console.warn("[mutes] failed to track reader repo", did, error);
  }
}

function getMutedSettingsQueryOptions({ limit = 50 }: { limit?: number } = {}) {
  return queryOptions({
    queryKey: ["mutes", "settings", limit] as const,
    queryFn: async () => getMutedSettings({ data: { limit } }),
    staleTime: 30_000,
  });
}

function getMuteCapabilityQueryOptions() {
  return queryOptions({
    queryKey: ["mutes", "capability"] as const,
    queryFn: async () => getMuteCapability(),
    staleTime: 30_000,
  });
}

function getMuteStateQueryOptions(subject: string) {
  return queryOptions({
    queryKey: ["mutes", "state", subject] as const,
    queryFn: async () => getMuteState({ data: { subject } }),
    staleTime: 30_000,
  });
}

export { INVALID_MUTED_WORD, MUTED_WORD_LIMIT, NEEDS_MUTE_SCOPE };

export const mutesApi = {
  getMutedSettings,
  getMutedSettingsQueryOptions,
  getMuteCapability,
  getMuteCapabilityQueryOptions,
  getMuteState,
  getMuteStateQueryOptions,
  muteSubject,
  muteWord,
  unmuteSubject,
  unmuteWord,
};

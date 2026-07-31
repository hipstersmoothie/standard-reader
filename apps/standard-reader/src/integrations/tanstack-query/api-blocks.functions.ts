import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { hasBskyBlockWriteScope } from "#/integrations/auth/scope";
import type { BlockEdge } from "#/lib/blocks";
import {
  getAtprotoSessionForRequest,
  getReaderContextForRequest,
} from "#/middleware/auth-session.server";
import {
  deleteBskyBlockRecords,
  deleteBskyListBlockRecords,
  putBskyBlockRecord,
  putBskyListBlockRecord,
} from "#/server/atproto/repo-records";
import type { BlockListRow, BlockedAccountRow } from "#/server/blocks/blocks";
import {
  blockEdgeFor,
  countReaderBlockedAccounts,
  readerBlockLists,
  readerBlockedAccounts,
} from "#/server/blocks/blocks";
import {
  refreshOutgoingBlocks,
  syncBlockedList,
  syncReaderBlocks,
} from "#/server/blocks/sync.server";
import { observe } from "#/server/observability/log";

import { dbMiddleware } from "./db-middleware";

export type { BlockListRow, BlockedAccountRow };
export type { BlockDirection, BlockEdge } from "#/lib/blocks";

/**
 * Blocks — reading and writing the reader's `app.bsky.graph.block` records.
 *
 * Writes go to the reader's repo, never to our tables: the record is the block,
 * and the read-model is a mirror the ingest refreshes afterwards. Every write
 * here re-syncs the mirror inline (see `refreshOutgoingBlocks`) so the block
 * takes effect on the very next page rather than at the end of the sweep
 * cadence — blocking someone and still seeing them would read as a failure.
 */

const blockInput = z.object({
  did: z.string().min(1),
});

const blockListInput = z.object({
  listUri: z.string().min(1),
});

const blockedAccountsInput = z.object({
  limit: z.number().int().min(1).max(100).default(50),
  offset: z.number().int().min(0).default(0),
});

/** The reader's moderation state, as the settings page renders it. */
export interface BlocksSettings {
  /** Accounts the reader blocks directly, newest first. */
  accounts: Array<BlockedAccountRow>;
  accountsNextOffset: number | null;
  /** Total direct blocks, so the page can head the list with a count. */
  accountCount: number;
  /** Moderation lists the reader blocks, with mirror state for each. */
  lists: Array<BlockListRow>;
  /**
   * Whether the reader has granted write access to their block records. When
   * false the page is read-only: their blocks are still enforced, they just
   * can't add or remove one without re-authorizing.
   */
  canWrite: boolean;
  /** When their blocks were last mirrored, and what went wrong if anything. */
  syncedAt: string | null;
  syncError: string | null;
}

const getBlocksSettings = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(blockedAccountsInput)
  .handler(
    observe(
      "blocks.getSettings",
      async ({ data, context }, span): Promise<BlocksSettings | null> => {
        const { db, schema } = context;
        const reader = await getReaderContextForRequest(getRequest());
        if (!reader) return null;
        span.set("did", reader.did);

        const [accounts, accountCount, lists, account, syncRow] =
          await Promise.all([
            readerBlockedAccounts(db, schema, reader.did, {
              limit: data.limit,
              offset: data.offset,
            }),
            countReaderBlockedAccounts(db, schema, reader.did),
            readerBlockLists(db, schema, reader.did),
            db.query.account.findFirst({
              where: and(
                eq(schema.account.userId, reader.userId),
                eq(schema.account.providerId, "atproto"),
              ),
              columns: { scope: true },
            }),
            db.query.blockSyncState.findFirst({
              where: eq(schema.blockSyncState.did, reader.did),
            }),
          ]);

        span.set("accounts", accountCount);
        span.set("lists", lists.length);

        return {
          accounts,
          accountsNextOffset:
            accounts.length === data.limit ? data.offset + data.limit : null,
          accountCount,
          lists,
          canWrite: hasBskyBlockWriteScope(account?.scope),
          syncedAt: syncRow?.syncedAt?.toISOString() ?? null,
          syncError: syncRow?.lastError ?? null,
        };
      },
    ),
  );

/** The block between the reader and one account, for the profile block button. */
const getBlockState = createServerFn({ method: "GET" })
  .middleware([dbMiddleware])
  .validator(blockInput)
  .handler(
    observe(
      "blocks.getBlockState",
      async ({ data, context }, span): Promise<BlockEdge | null> => {
        const reader = await getReaderContextForRequest(getRequest());
        if (!reader) return null;
        const edge = await blockEdgeFor(
          context.db,
          context.schema,
          reader.did,
          data.did,
        );
        span.set("blocked", edge?.direction ?? "none");
        return edge;
      },
    ),
  );

/**
 * Thrown when the reader hasn't granted block-write access yet, so the UI can
 * offer the re-authorize flow instead of surfacing a raw PDS rejection.
 */
const NEEDS_BLOCK_SCOPE = "needs-block-scope";

/**
 * The reader's authenticated PDS client, once we know they can write blocks.
 *
 * Resolves the full ATProto session (a `manager.resume()` round trip) rather
 * than the cheap DB-only reader context — a write needs the client, and this
 * only ever runs on a write.
 */
async function requireBlockWriter() {
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
  if (!hasBskyBlockWriteScope(account?.scope)) {
    throw new Error(NEEDS_BLOCK_SCOPE);
  }
  return session;
}

const blockAccount = createServerFn({ method: "POST" })
  .validator(blockInput)
  .handler(async ({ data }) => {
    const session = await requireBlockWriter();
    if (data.did === session.did) {
      throw new Error("You can't block yourself");
    }

    await putBskyBlockRecord(
      session.client,
      session.did,
      data.did,
      new Date().toISOString(),
    );
    // Re-read the reader's own records rather than inserting the row we just
    // wrote: the PDS is the source of truth, and this also picks up blocks made
    // elsewhere since the last sweep.
    await refreshOutgoingBlocks(session.did);
    return { blocked: true };
  });

const unblockAccount = createServerFn({ method: "POST" })
  .validator(blockInput)
  .handler(async ({ data }) => {
    const session = await requireBlockWriter();

    // The reader's existing blocks were almost certainly written by Bluesky
    // under TID rkeys, which the deterministic rkey can't derive — so the
    // mirror's rkeys are what make unblocking work on a block made anywhere.
    const [{ db }, schema] = await Promise.all([
      import("#/db/index.server"),
      import("#/db/schema"),
    ]);
    const rows = await db
      .select({ rkey: schema.blocks.rkey })
      .from(schema.blocks)
      .where(
        and(
          eq(schema.blocks.blockerDid, session.did),
          eq(schema.blocks.subjectDid, data.did),
          eq(schema.blocks.deleted, false),
        ),
      );

    await deleteBskyBlockRecords(
      session.client,
      session.did,
      data.did,
      rows.map((row) => row.rkey),
    );
    await refreshOutgoingBlocks(session.did);
    return { blocked: false };
  });

const blockList = createServerFn({ method: "POST" })
  .validator(blockListInput)
  .handler(async ({ data }) => {
    const session = await requireBlockWriter();
    await putBskyListBlockRecord(
      session.client,
      session.did,
      data.listUri,
      new Date().toISOString(),
    );
    // Full sweep rather than the outgoing-blocks refresh: subscribing to a list
    // is only meaningful once its membership is mirrored, and that is what the
    // sweep does. Awaited so the block is in force when this returns.
    await syncReaderBlocks(session.did);
    await syncBlockedList(data.listUri);
    return { blocked: true };
  });

const unblockList = createServerFn({ method: "POST" })
  .validator(blockListInput)
  .handler(async ({ data }) => {
    const session = await requireBlockWriter();

    const [{ db }, schema] = await Promise.all([
      import("#/db/index.server"),
      import("#/db/schema"),
    ]);
    const rows = await db
      .select({ rkey: schema.blockLists.rkey })
      .from(schema.blockLists)
      .where(
        and(
          eq(schema.blockLists.blockerDid, session.did),
          eq(schema.blockLists.listUri, data.listUri),
          eq(schema.blockLists.deleted, false),
        ),
      );

    await deleteBskyListBlockRecords(
      session.client,
      session.did,
      data.listUri,
      rows.map((row) => row.rkey),
    );
    await syncReaderBlocks(session.did);
    return { blocked: false };
  });

/** Force a block sweep now — the settings page's "refresh" affordance. */
const refreshBlocks = createServerFn({ method: "POST" }).handler(async () => {
  const reader = await getReaderContextForRequest(getRequest());
  if (!reader) {
    throw new Error("Unauthorized");
  }
  return syncReaderBlocks(reader.did);
});

function getBlocksSettingsQueryOptions({
  limit = 50,
  offset = 0,
}: { limit?: number; offset?: number } = {}) {
  return queryOptions({
    queryKey: ["blocks", "settings", limit, offset] as const,
    queryFn: async () => getBlocksSettings({ data: { limit, offset } }),
    staleTime: 30_000,
  });
}

function getBlockStateQueryOptions(did: string) {
  return queryOptions({
    queryKey: ["blocks", "state", did] as const,
    queryFn: async () => getBlockState({ data: { did } }),
    staleTime: 30_000,
  });
}

export { NEEDS_BLOCK_SCOPE };

export const blocksApi = {
  getBlocksSettings,
  getBlocksSettingsQueryOptions,
  getBlockState,
  getBlockStateQueryOptions,
  blockAccount,
  unblockAccount,
  blockList,
  unblockList,
  refreshBlocks,
};

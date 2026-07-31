/**
 * Mirror a reader's Bluesky blocks into the read-model.
 *
 * This is the **only** place that talks to the network about blocks; every
 * request path reads them from Postgres (see `blocks.server.ts`).
 *
 * Blocks can't ride the firehose tap the way documents and subscriptions do.
 * The tap tracks the repos we index — publishers, and readers who have signed
 * in — but a block against one of our readers can be written by *any* repo on
 * the network, and there are far too many to track. So blocks are pulled per
 * reader, on a cadence, from four sources:
 *
 * 1. **Outgoing blocks** — `app.bsky.graph.block` in the reader's own repo.
 *    Read unauthenticated: `com.atproto.repo.listRecords` is a public endpoint,
 *    so honouring someone's blocks costs no OAuth scope at all. Only *writing*
 *    a block needs one (see `scope.ts`).
 * 2. **Outgoing list blocks** — `app.bsky.graph.listblock` in the reader's repo,
 *    expanded to the list's membership via the public AppView.
 * 3. **Incoming blocks** — block records elsewhere on the network whose
 *    `subject` is the reader, found through Constellation's backlink index.
 * 4. **Incoming list blocks** — moderation lists the reader is *on*, and who
 *    blocks those lists. This is Bluesky's `blockedByList`, and it is why a
 *    reader can be blocked by someone who never named them.
 *
 * **Never on a path anyone waits for.** A full sync is dozens of round trips.
 * Callers use {@link scheduleReaderBlockSync}, which returns immediately and
 * lets the work land in the DB for the reader's next load.
 */

import { and, eq, inArray, notInArray, sql } from "drizzle-orm";

import { db } from "#/db/index.server";
import * as schema from "#/db/schema";
import { getBacklinks } from "#/server/atproto/constellation";
import {
  fetchRepoRecordWithFallback,
  listRepoRecords,
} from "#/server/atproto/fetch-record";
import { resolveIdentity } from "#/server/atproto/identity";

/** Collections we mirror. Third-party (Bluesky) namespace — not ours. */
export const BSKY_BLOCK_NSID = "app.bsky.graph.block";
export const BSKY_LISTBLOCK_NSID = "app.bsky.graph.listblock";
export const BSKY_LISTITEM_NSID = "app.bsky.graph.listitem";
export const BSKY_LIST_NSID = "app.bsky.graph.list";

/** Constellation backlink sources for the two incoming directions. */
const BLOCK_SUBJECT_SOURCE = `${BSKY_BLOCK_NSID}:.subject` as const;
const LISTBLOCK_SUBJECT_SOURCE = `${BSKY_LISTBLOCK_NSID}:.subject` as const;
const LISTITEM_SUBJECT_SOURCE = `${BSKY_LISTITEM_NSID}:.subject` as const;

const PUBLIC_APPVIEW = "https://public.api.bsky.app";
const FETCH_TIMEOUT_MS = 8000;

/**
 * How long a mirrored list's membership is trusted before it is re-fetched.
 *
 * Moderation lists change slowly and cost up to {@link MAX_LIST_PAGES} requests
 * to walk, so re-reading one on every reader sync would spend the entire budget
 * on lists that hadn't moved. A block added to a list today takes at most this
 * long to take effect here.
 */
const LIST_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Cap on how much of a moderation list we mirror (100 members per page).
 *
 * The largest public blocklists run to six figures. Mirroring one in full would
 * dwarf the rest of the read-model, so a list past this cap is stored truncated
 * and flagged — the settings surface says the block is partial rather than
 * quietly under-enforcing it.
 */
const MAX_LIST_PAGES = 100;
const LIST_PAGE_SIZE = 100;

/**
 * Cap on how many lists a reader's *incoming* sweep will chase.
 *
 * Being on a list is not rare — some are auto-generated and hold thousands of
 * accounts — and each one costs a record fetch plus a Constellation query. The
 * direct incoming blocks in step 3 are the common case by a wide margin; this
 * bounds the tail.
 */
const MAX_INCOMING_LISTS = 25;

export interface BlockSyncResult {
  outgoing: number;
  incoming: number;
  lists: number;
  error?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `at://did/…` authority of an AT-URI, or null if it isn't a DID. */
function didFromAtUri(uri: string): string | null {
  if (!uri.startsWith("at://")) return null;
  const rest = uri.slice("at://".length);
  const slash = rest.indexOf("/");
  const authority = slash === -1 ? rest : rest.slice(0, slash);
  return authority.startsWith("did:") ? authority : null;
}

function rkeyFromAtUri(uri: string): string {
  return uri.slice(uri.lastIndexOf("/") + 1);
}

function parseDate(value: unknown): Date | null {
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * Pages of Constellation backlinks for one target, up to `maxPages`.
 *
 * A popular account can be blocked by thousands, and a single page would mirror
 * an arbitrary hundred of them — which is worse than a bounded sweep, because
 * it looks complete. The cap is stated rather than silent: past it, the reader
 * is enforcing the blocks we know about, not every block that exists.
 */
async function allBacklinks(
  target: string,
  source: string,
  maxPages: number,
): Promise<Array<{ did: string; collection: string; rkey: string }>> {
  const merged: Array<{ did: string; collection: string; rkey: string }> = [];
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await getBacklinks({ target, source, cursor, limit: 100 });
    merged.push(...page.records);
    cursor = page.cursor ?? undefined;
    pages++;
  } while (cursor && pages < maxPages);
  return merged;
}

/** Cap on Constellation pages per backlink sweep (100 records per page). */
const MAX_BACKLINK_PAGES = 20;

// ── Outgoing: the reader's own records ──────────────────────────────────────

interface ParsedBlock {
  uri: string;
  cid: string | null;
  blockerDid: string;
  rkey: string;
  subjectDid: string;
  createdAt: Date | null;
}

/**
 * Replace the mirrored blocks authored by `blockerDid` with `rows`.
 *
 * A full replace, not an upsert: unblocking deletes the record, and the only
 * way to notice a record that is no longer there is to compare the whole set.
 * Rows are soft-deleted rather than removed so a re-block reuses the row and
 * the mirror keeps the same shape as every other table here.
 */
async function replaceOutgoingBlocks(
  blockerDid: string,
  rows: Array<ParsedBlock>,
): Promise<void> {
  const b = schema.blocks;
  if (rows.length > 0) {
    const values = rows.map((row) => ({
      uri: row.uri,
      cid: row.cid,
      blockerDid: row.blockerDid,
      rkey: row.rkey,
      subjectDid: row.subjectDid,
      createdAt: row.createdAt,
      deleted: false,
      updatedAt: sql`now()`,
    }));
    await db
      .insert(b)
      .values(values)
      .onConflictDoUpdate({
        target: b.uri,
        set: {
          cid: sql`excluded.cid`,
          subjectDid: sql`excluded.subject_did`,
          createdAt: sql`excluded.created_at`,
          deleted: false,
          updatedAt: sql`now()`,
        },
      });
  }

  const keep = rows.map((row) => row.uri);
  await db
    .update(b)
    .set({ deleted: true, updatedAt: sql`now()` })
    .where(
      and(
        eq(b.blockerDid, blockerDid),
        eq(b.deleted, false),
        ...(keep.length > 0 ? [notInArray(b.uri, keep)] : []),
      ),
    );
}

interface ParsedListBlock {
  uri: string;
  cid: string | null;
  blockerDid: string;
  rkey: string;
  listUri: string;
  createdAt: Date | null;
}

/** {@link replaceOutgoingBlocks} for `app.bsky.graph.listblock` records. */
async function replaceOutgoingListBlocks(
  blockerDid: string,
  rows: Array<ParsedListBlock>,
): Promise<void> {
  const bl = schema.blockLists;
  if (rows.length > 0) {
    await db
      .insert(bl)
      .values(
        rows.map((row) => ({
          uri: row.uri,
          cid: row.cid,
          blockerDid: row.blockerDid,
          rkey: row.rkey,
          listUri: row.listUri,
          createdAt: row.createdAt,
          deleted: false,
          updatedAt: sql`now()`,
        })),
      )
      .onConflictDoUpdate({
        target: bl.uri,
        set: {
          cid: sql`excluded.cid`,
          listUri: sql`excluded.list_uri`,
          createdAt: sql`excluded.created_at`,
          deleted: false,
          updatedAt: sql`now()`,
        },
      });
  }

  const keep = rows.map((row) => row.uri);
  await db
    .update(bl)
    .set({ deleted: true, updatedAt: sql`now()` })
    .where(
      and(
        eq(bl.blockerDid, blockerDid),
        eq(bl.deleted, false),
        ...(keep.length > 0 ? [notInArray(bl.uri, keep)] : []),
      ),
    );
}

/** The reader's own `app.bsky.graph.block` records, parsed. */
async function readOutgoingBlocks(
  did: string,
  pds: string | null,
): Promise<Array<ParsedBlock>> {
  const { records } = await listRepoRecords(did, BSKY_BLOCK_NSID, pds);
  const rows: Array<ParsedBlock> = [];
  for (const record of records) {
    const value = record.value;
    const subject = isRecord(value) ? value.subject : null;
    if (typeof subject !== "string" || !subject.startsWith("did:")) continue;
    if (subject === did) continue;
    rows.push({
      uri: record.uri,
      cid: record.cid ?? null,
      blockerDid: did,
      rkey: rkeyFromAtUri(record.uri),
      subjectDid: subject,
      createdAt: parseDate(isRecord(value) ? value.createdAt : null),
    });
  }
  return rows;
}

/** The reader's own `app.bsky.graph.listblock` records, parsed. */
async function readOutgoingListBlocks(
  did: string,
  pds: string | null,
): Promise<Array<ParsedListBlock>> {
  const { records } = await listRepoRecords(did, BSKY_LISTBLOCK_NSID, pds);
  const rows: Array<ParsedListBlock> = [];
  for (const record of records) {
    const value = record.value;
    const subject = isRecord(value) ? value.subject : null;
    if (typeof subject !== "string" || !subject.startsWith("at://")) continue;
    rows.push({
      uri: record.uri,
      cid: record.cid ?? null,
      blockerDid: did,
      rkey: rkeyFromAtUri(record.uri),
      listUri: subject,
      createdAt: parseDate(isRecord(value) ? value.createdAt : null),
    });
  }
  return rows;
}

// ── Moderation lists ────────────────────────────────────────────────────────

interface AppViewListItem {
  uri: string;
  subjectDid: string;
}

interface AppViewList {
  name: string | null;
  description: string | null;
  purpose: string | null;
  items: Array<AppViewListItem>;
  truncated: boolean;
}

/**
 * Walk a moderation list's membership from the public AppView.
 *
 * The AppView rather than the owner's repo: membership is one `listitem` record
 * per member, so reading it from the PDS means paging the owner's entire repo
 * and filtering client-side, while `getList` returns exactly this list already
 * joined to its members.
 */
async function fetchListFromAppView(listUri: string): Promise<AppViewList> {
  const items: Array<AppViewListItem> = [];
  let cursor: string | undefined;
  let name: string | null = null;
  let description: string | null = null;
  let purpose: string | null = null;
  let pages = 0;
  let truncated = false;

  do {
    const url = new URL("/xrpc/app.bsky.graph.getList", PUBLIC_APPVIEW);
    url.searchParams.set("list", listUri);
    url.searchParams.set("limit", String(LIST_PAGE_SIZE));
    if (cursor) url.searchParams.set("cursor", cursor);

    const response = await fetch(url.toString(), {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { Accept: "application/json" },
    });
    if (!response.ok) {
      throw new Error(`AppView returned HTTP ${response.status}`);
    }
    const payload: unknown = await response.json();
    if (!isRecord(payload)) break;

    const list = payload.list;
    if (isRecord(list)) {
      name = typeof list.name === "string" ? list.name : name;
      description =
        typeof list.description === "string" ? list.description : description;
      purpose = typeof list.purpose === "string" ? list.purpose : purpose;
    }

    for (const item of Array.isArray(payload.items) ? payload.items : []) {
      if (!isRecord(item)) continue;
      const subject = item.subject;
      const uri = item.uri;
      if (!isRecord(subject) || typeof uri !== "string") continue;
      if (typeof subject.did !== "string") continue;
      items.push({ uri, subjectDid: subject.did });
    }

    cursor = typeof payload.cursor === "string" ? payload.cursor : undefined;
    pages++;
    if (cursor && pages >= MAX_LIST_PAGES) {
      truncated = true;
      break;
    }
  } while (cursor);

  return { name, description, purpose, items, truncated };
}

/** Whether this list's membership was mirrored recently enough to trust. */
async function listIsFresh(listUri: string): Promise<boolean> {
  const ls = schema.blockListSyncState;
  const rows = await db
    .select({ syncedAt: ls.syncedAt, lastError: ls.lastError })
    .from(ls)
    .where(eq(ls.listUri, listUri))
    .limit(1);
  const row = rows[0];
  if (!row?.syncedAt || row.lastError) return false;
  return Date.now() - row.syncedAt.getTime() < LIST_TTL_MS;
}

/**
 * Mirror one moderation list's membership in full, replacing what we had.
 *
 * Best-effort: a list that can't be fetched records the error and keeps its
 * previous membership rather than dropping them, so a transient AppView failure
 * can't briefly un-block everyone on somebody's blocklist.
 */
async function syncListMembership(
  listUri: string,
  force = false,
): Promise<void> {
  if (!force && (await listIsFresh(listUri))) return;

  const ownerDid = didFromAtUri(listUri);
  if (!ownerDid) return;
  const ls = schema.blockListSyncState;

  let list: AppViewList;
  try {
    list = await fetchListFromAppView(listUri);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    await db
      .insert(ls)
      .values({ listUri, ownerDid, lastError: message, syncedAt: new Date() })
      .onConflictDoUpdate({
        target: ls.listUri,
        set: { lastError: message, syncedAt: sql`now()` },
      });
    return;
  }

  const bli = schema.blockListItems;
  if (list.items.length > 0) {
    await db
      .insert(bli)
      .values(
        list.items.map((item) => ({
          uri: item.uri,
          listUri,
          subjectDid: item.subjectDid,
        })),
      )
      .onConflictDoUpdate({
        target: bli.uri,
        set: {
          listUri: sql`excluded.list_uri`,
          subjectDid: sql`excluded.subject_did`,
          indexedAt: sql`now()`,
        },
      });
  }

  // Drop members removed from the list upstream. Rows are deleted rather than
  // soft-deleted: a listitem has no identity worth preserving, and membership
  // is re-derived in full on every refresh.
  const keep = list.items.map((item) => item.uri);
  await db
    .delete(bli)
    .where(
      and(
        eq(bli.listUri, listUri),
        ...(keep.length > 0 ? [notInArray(bli.uri, keep)] : []),
      ),
    );

  await db
    .insert(ls)
    .values({
      listUri,
      ownerDid,
      name: list.name,
      description: list.description,
      purpose: list.purpose,
      itemCount: list.items.length,
      truncated: list.truncated,
      lastError: null,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: ls.listUri,
      set: {
        name: list.name,
        description: list.description,
        purpose: list.purpose,
        itemCount: list.items.length,
        truncated: list.truncated,
        lastError: null,
        syncedAt: sql`now()`,
      },
    });
}

// ── Incoming: blocks against the reader ─────────────────────────────────────

/**
 * Block records elsewhere on the network whose `subject` is this reader.
 *
 * Constellation's backlink index answers this in one query and returns the
 * blocker DID and rkey directly, so the block row can be built without fetching
 * a single record.
 *
 * Additive, not a replace: these rows describe other people's repos, and this
 * index is best-effort. A sweep that came back short (Constellation down, a
 * partial page) must not be read as "nobody blocks you any more" — that would
 * un-hide content the moment the index hiccuped. Rows do go away, just on the
 * slower path: the blocker's own record read, if they are also a reader here.
 */
async function syncIncomingBlocks(did: string): Promise<number> {
  const records = await allBacklinks(
    did,
    BLOCK_SUBJECT_SOURCE,
    MAX_BACKLINK_PAGES,
  );
  const rows = records
    .filter((record) => record.collection === BSKY_BLOCK_NSID)
    .filter((record) => record.did !== did)
    .map((record) => ({
      uri: `at://${record.did}/${BSKY_BLOCK_NSID}/${record.rkey}`,
      cid: null,
      blockerDid: record.did,
      rkey: record.rkey,
      subjectDid: did,
      createdAt: null,
      deleted: false,
      updatedAt: sql`now()`,
    }));
  if (rows.length === 0) return 0;

  const b = schema.blocks;
  await db
    .insert(b)
    .values(rows)
    .onConflictDoUpdate({
      target: b.uri,
      set: { deleted: false, updatedAt: sql`now()` },
    });
  return rows.length;
}

/**
 * Moderation lists this reader is on, and who blocks those lists.
 *
 * Two hops, both through Constellation: `listitem` records naming the reader
 * give the lists they are on, and `listblock` records naming those lists give
 * the accounts blocking them. Only the reader's *own* membership row is stored
 * for these lists — enough for the `list-blocked-by` branch to resolve, without
 * mirroring a list nobody here has actually subscribed to.
 */
async function syncIncomingListBlocks(
  did: string,
  pds: string | null,
): Promise<number> {
  const records = await allBacklinks(did, LISTITEM_SUBJECT_SOURCE, 1);
  const listItems = records
    .filter((record) => record.collection === BSKY_LISTITEM_NSID)
    .slice(0, MAX_INCOMING_LISTS);
  if (listItems.length === 0) return 0;

  let blockers = 0;
  for (const item of listItems) {
    const itemUri = `at://${item.did}/${BSKY_LISTITEM_NSID}/${item.rkey}`;
    const record = await fetchRepoRecordWithFallback(itemUri, pds);
    const value = record?.value;
    const listUri = isRecord(value) ? value.list : null;
    if (typeof listUri !== "string" || !listUri.startsWith("at://")) continue;

    const listBlocks = await allBacklinks(
      listUri,
      LISTBLOCK_SUBJECT_SOURCE,
      MAX_BACKLINK_PAGES,
    );
    const blockRows = listBlocks
      .filter((row) => row.collection === BSKY_LISTBLOCK_NSID)
      .filter((row) => row.did !== did)
      .map((row) => ({
        uri: `at://${row.did}/${BSKY_LISTBLOCK_NSID}/${row.rkey}`,
        cid: null,
        blockerDid: row.did,
        rkey: row.rkey,
        listUri,
        createdAt: null,
        deleted: false,
        updatedAt: sql`now()`,
      }));
    if (blockRows.length === 0) continue;

    // Store the reader's membership so the `list-blocked-by` branch can join
    // through it. The rest of the list is deliberately not mirrored.
    await db
      .insert(schema.blockListItems)
      .values({ uri: itemUri, listUri, subjectDid: did })
      .onConflictDoUpdate({
        target: schema.blockListItems.uri,
        set: { listUri, subjectDid: did, indexedAt: sql`now()` },
      });

    const bl = schema.blockLists;
    await db
      .insert(bl)
      .values(blockRows)
      .onConflictDoUpdate({
        target: bl.uri,
        set: { deleted: false, updatedAt: sql`now()` },
      });
    blockers += blockRows.length;
  }
  return blockers;
}

// ── Entry points ────────────────────────────────────────────────────────────

/**
 * Mirror everything blocking-related for one reader.
 *
 * Best-effort per source: a Constellation outage or an unreachable list must
 * not throw away the sources that did answer, and must never leave the reader
 * with *fewer* blocks enforced than before. The outgoing halves — the reader's
 * own decisions, read from their own repo — are the ones that replace state;
 * the incoming halves only ever add.
 */
export async function syncReaderBlocks(did: string): Promise<BlockSyncResult> {
  const result: BlockSyncResult = { outgoing: 0, incoming: 0, lists: 0 };
  const errors: Array<string> = [];

  const { pds } = await resolveIdentity(did);

  try {
    const outgoing = await readOutgoingBlocks(did, pds);
    await replaceOutgoingBlocks(did, outgoing);
    result.outgoing = outgoing.length;
  } catch (error) {
    errors.push(`outgoing blocks: ${errorMessage(error)}`);
  }

  try {
    const listBlocks = await readOutgoingListBlocks(did, pds);
    await replaceOutgoingListBlocks(did, listBlocks);
    result.lists = listBlocks.length;
    for (const listBlock of listBlocks) {
      await syncListMembership(listBlock.listUri);
    }
  } catch (error) {
    errors.push(`block lists: ${errorMessage(error)}`);
  }

  try {
    result.incoming = await syncIncomingBlocks(did);
  } catch (error) {
    errors.push(`incoming blocks: ${errorMessage(error)}`);
  }

  try {
    await syncIncomingListBlocks(did, pds);
  } catch (error) {
    errors.push(`incoming list blocks: ${errorMessage(error)}`);
  }

  const error = errors.length > 0 ? errors.join("; ") : null;
  if (error) result.error = error;

  const state = schema.blockSyncState;
  await db
    .insert(state)
    .values({
      did,
      outgoingCount: result.outgoing,
      incomingCount: result.incoming,
      listCount: result.lists,
      lastError: error,
      syncedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: state.did,
      set: {
        outgoingCount: result.outgoing,
        incomingCount: result.incoming,
        listCount: result.lists,
        lastError: error,
        syncedAt: sql`now()`,
      },
    });

  return result;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "unknown error";
}

/**
 * Re-read just the reader's own block records, right now.
 *
 * Called straight after a block/unblock write so the change is enforced on the
 * very next page rather than at the end of the sync cadence — blocking someone
 * and still seeing them would read as the block having failed.
 */
export async function refreshOutgoingBlocks(did: string): Promise<void> {
  const { pds } = await resolveIdentity(did);
  const outgoing = await readOutgoingBlocks(did, pds);
  await replaceOutgoingBlocks(did, outgoing);
}

/**
 * How long a reader's mirrored blocks are trusted before the next sweep.
 *
 * Short enough that a block made on Bluesky takes effect here within the same
 * session, long enough that an active reader isn't re-walking their repo and
 * two Constellation indexes on every page load.
 */
const SYNC_TTL_MS = 15 * 60 * 1000;

/** Readers whose sync is running in this process, so requests can't stampede. */
const inFlight = new Set<string>();

/**
 * Readers checked recently, so the common case ("synced eight minutes ago")
 * costs nothing. Separate from the DB stamp because it is consulted on every
 * request for every signed-in reader.
 */
const checkedUntil = new Map<string, number>();

/**
 * Start this reader's block sync in the background, if it's due.
 *
 * Returns immediately — **nothing awaits the sync**. It is called from request
 * paths (the OAuth callback and the signed-in shell read), and a reader should
 * never wait on a block sweep to see a page. Safe to call on every request: the
 * in-process guards and the DB stamp make the common case free.
 */
export function scheduleReaderBlockSync(did: string): void {
  const checked = checkedUntil.get(did);
  if (checked !== undefined && checked > Date.now()) return;
  if (inFlight.has(did)) return;
  inFlight.add(did);

  void (async () => {
    try {
      const rows = await db
        .select({ syncedAt: schema.blockSyncState.syncedAt })
        .from(schema.blockSyncState)
        .where(eq(schema.blockSyncState.did, did))
        .limit(1);
      const syncedAt = rows[0]?.syncedAt;
      if (syncedAt && Date.now() - syncedAt.getTime() < SYNC_TTL_MS) {
        checkedUntil.set(did, syncedAt.getTime() + SYNC_TTL_MS);
        return;
      }

      const result = await syncReaderBlocks(did);
      checkedUntil.set(did, Date.now() + SYNC_TTL_MS);
      if (result.error) {
        console.warn(`Block sync for ${did} partially failed:`, result.error);
      }
    } catch (error) {
      console.warn("Background block sync failed:", error);
      // Back off on failure too, so a persistently failing sweep doesn't retry
      // on every request the reader makes.
      checkedUntil.set(did, Date.now() + SYNC_TTL_MS);
    } finally {
      inFlight.delete(did);
    }
  })();
}

/**
 * Mirror the membership of a list the reader just blocked, without waiting for
 * the next sweep. Forced past the TTL: they blocked it *now*.
 */
export async function syncBlockedList(listUri: string): Promise<void> {
  await syncListMembership(listUri, true);
}

/** DIDs on a mirrored list, for surfaces that explain a list block. */
export async function listMemberDids(
  listUri: string,
  limit: number,
): Promise<Array<string>> {
  const bli = schema.blockListItems;
  const rows = await db
    .select({ subjectDid: bli.subjectDid })
    .from(bli)
    .where(eq(bli.listUri, listUri))
    .limit(limit);
  return rows.map((row) => row.subjectDid);
}

/** Whether any of `dids` sits on a mirrored list (diagnostics + tests). */
export async function listsContaining(
  dids: Array<string>,
): Promise<Array<{ listUri: string; subjectDid: string }>> {
  if (dids.length === 0) return [];
  const bli = schema.blockListItems;
  return db
    .select({ listUri: bli.listUri, subjectDid: bli.subjectDid })
    .from(bli)
    .where(inArray(bli.subjectDid, dids));
}

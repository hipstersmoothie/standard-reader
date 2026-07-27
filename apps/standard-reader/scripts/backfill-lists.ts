import { and, eq } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { listSaves, lists } from "../src/db/schema/lists.ts";
import {
  RepoGoneError,
  listRepoRecords,
} from "../src/server/atproto/fetch-record.ts";
import { resolveIdentity } from "../src/server/atproto/identity.ts";
import { Collections } from "../src/server/atproto/uri.ts";

/**
 * Scan `lists` and `list_saves` for ghost rows: rows marked `deleted = false`
 * whose AT-URI no longer exists on the owner/saver's PDS. These accumulate
 * when tap misses a delete-record event (e.g. a repo error-state window) —
 * `backfillListsFromRepo` only upserts records it finds live and never
 * reconciles rows that vanished from the repo, so a dropped delete leaves a
 * duplicate list in the sidebar forever. Surfaced by investigating
 * did:plc:5amsebbtpuqieuxuqadmmvcv's duplicate "My Blogs" list.
 *
 * Read-only — reports ghosts, makes no writes.
 *
 *   pnpm backfill:lists
 *   pnpm backfill:lists did:plc:xxx [did:plc:yyy ...]   # scope to specific DIDs
 */

const SCAN_CONCURRENCY = 8;

interface GhostList {
  did: string;
  uri: string;
  name: string;
  createdAt: Date | null;
  updatedAt: Date;
}

interface GhostListSave {
  did: string;
  uri: string;
  listUri: string;
  createdAt: Date | null;
  updatedAt: Date;
}

interface ScanResult<T> {
  ghosts: Array<T>;
  gone: Array<string>;
  checked: number;
}

async function scanOwnedLists(
  onlyDids: Array<string> | null,
): Promise<ScanResult<GhostList>> {
  const owners = onlyDids
    ? onlyDids.map((did) => ({ did }))
    : await db
        .selectDistinct({ did: lists.ownerDid })
        .from(lists)
        .where(eq(lists.deleted, false));

  const ghosts: Array<GhostList> = [];
  const gone: Array<string> = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < owners.length) {
      const { did } = owners[cursor++];
      const identity = await resolveIdentity(did);
      if (!identity.pds) {
        console.warn(`[lists] ${did}: could not resolve PDS, skipping`);
        continue;
      }

      const rows = await db
        .select({
          uri: lists.uri,
          name: lists.name,
          createdAt: lists.createdAt,
          updatedAt: lists.updatedAt,
        })
        .from(lists)
        .where(and(eq(lists.ownerDid, did), eq(lists.deleted, false)));
      if (rows.length === 0) continue;

      let liveUris: Set<string>;
      try {
        const result = await listRepoRecords(
          did,
          Collections.list,
          identity.pds,
        );
        liveUris = new Set(result.records.map((record) => record.uri));
      } catch (error: unknown) {
        if (error instanceof RepoGoneError) {
          gone.push(did);
          continue;
        }
        console.warn(
          `[lists] ${did}: fetch failed, skipping (${(error as Error).message})`,
        );
        continue;
      }

      for (const row of rows) {
        if (!liveUris.has(row.uri)) {
          ghosts.push({ did, ...row });
        }
      }
    }
  }

  const concurrency = Math.min(SCAN_CONCURRENCY, owners.length || 1);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return { checked: owners.length, ghosts, gone };
}

async function scanSavedLists(
  onlyDids: Array<string> | null,
): Promise<ScanResult<GhostListSave>> {
  const savers = onlyDids
    ? onlyDids.map((did) => ({ did }))
    : await db
        .selectDistinct({ did: listSaves.saverDid })
        .from(listSaves)
        .where(eq(listSaves.deleted, false));

  const ghosts: Array<GhostListSave> = [];
  const gone: Array<string> = [];
  let cursor = 0;

  async function worker(): Promise<void> {
    while (cursor < savers.length) {
      const { did } = savers[cursor++];
      const identity = await resolveIdentity(did);
      if (!identity.pds) {
        console.warn(`[list_saves] ${did}: could not resolve PDS, skipping`);
        continue;
      }

      const rows = await db
        .select({
          uri: listSaves.uri,
          listUri: listSaves.listUri,
          createdAt: listSaves.createdAt,
          updatedAt: listSaves.updatedAt,
        })
        .from(listSaves)
        .where(and(eq(listSaves.saverDid, did), eq(listSaves.deleted, false)));
      if (rows.length === 0) continue;

      let liveUris: Set<string>;
      try {
        const result = await listRepoRecords(
          did,
          Collections.listSave,
          identity.pds,
        );
        liveUris = new Set(result.records.map((record) => record.uri));
      } catch (error: unknown) {
        if (error instanceof RepoGoneError) {
          gone.push(did);
          continue;
        }
        console.warn(
          `[list_saves] ${did}: fetch failed, skipping (${(error as Error).message})`,
        );
        continue;
      }

      for (const row of rows) {
        if (!liveUris.has(row.uri)) {
          ghosts.push({ did, ...row });
        }
      }
    }
  }

  const concurrency = Math.min(SCAN_CONCURRENCY, savers.length || 1);
  await Promise.all(Array.from({ length: concurrency }, () => worker()));

  return { checked: savers.length, ghosts, gone };
}

const args = process.argv.slice(2);
const onlyDids = args.filter((arg) => arg.startsWith("did:"));
const scope = onlyDids.length > 0 ? onlyDids : null;

const ownedResult = await scanOwnedLists(scope);
const savedResult = await scanSavedLists(scope);

console.log(
  `\nChecked ${ownedResult.checked} list owner(s), ${savedResult.checked} list saver(s).`,
);

if (ownedResult.gone.length > 0) {
  console.log(
    `\nRepos reported gone (owned lists), ${ownedResult.gone.length}:`,
  );
  for (const did of ownedResult.gone) console.log(`  ${did}`);
}
if (savedResult.gone.length > 0) {
  console.log(
    `\nRepos reported gone (list saves), ${savedResult.gone.length}:`,
  );
  for (const did of savedResult.gone) console.log(`  ${did}`);
}

console.log(`\nGhost owned-list rows: ${ownedResult.ghosts.length}`);
for (const g of ownedResult.ghosts) {
  console.log(
    `  ${g.did}  ${g.uri}  "${g.name}"  created=${g.createdAt?.toISOString() ?? "?"}  updated=${g.updatedAt.toISOString()}`,
  );
}

console.log(`\nGhost list-save rows: ${savedResult.ghosts.length}`);
for (const g of savedResult.ghosts) {
  console.log(
    `  ${g.did}  ${g.uri} -> ${g.listUri}  created=${g.createdAt?.toISOString() ?? "?"}  updated=${g.updatedAt.toISOString()}`,
  );
}

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);

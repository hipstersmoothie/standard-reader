/**
 * Gated integration test for the block allowlist against a real Postgres.
 *
 * NOT run by `pnpm test` or CI. Opt in with `BLOCKS_DB_TEST_URL` pointed at a
 * **scratch** database (a local `initdb` cluster is ideal): the suite creates
 * its own throwaway schema, the few tables it needs, and drops it all again.
 * Never point it at prod or a shared Neon branch.
 *
 * It exists because the allowlist lives entirely in hand-written SQL — the
 * union-and-exclude in `blockEdgeSql` and the `or exists(...)` tail on
 * `notBlockedByViewer` — and the drizzle-template pitfalls that bite there
 * (arrays binding as one scalar, column refs rendering against the wrong
 * relation) pass typecheck and unit tests alike. Only running the query shows
 * whether an allowlisted account actually comes back.
 */
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import * as schema from "#/db/schema";
import type { Db } from "#/integrations/tanstack-query/api-shapes";

import {
  addToBlockAllowlist,
  blockEdgesAmong,
  blockStateFor,
  invalidateBlockCache,
  notBlockedByViewer,
  readerBlockAllowlist,
  removeFromBlockAllowlist,
} from "./blocks";

const URL = process.env.BLOCKS_DB_TEST_URL;
const SCHEMA = `allowlist_test_${process.pid}`;

const VIEWER = "did:plc:viewer";
const BLOCKED = "did:plc:blocked"; // the viewer blocks them
const BLOCKER = "did:plc:blocker"; // they block the viewer
const LISTED = "did:plc:listed"; // on a modlist the viewer subscribes to
const LIST_BLOCKER = "did:plc:listblocker"; // blocks a list the viewer is on
const FINE = "did:plc:fine"; // no block at all
const MODLIST = "at://did:plc:mod/app.bsky.graph.list/mod";
const VIEWER_LIST = "at://did:plc:other/app.bsky.graph.list/has-viewer";

const ALL = [BLOCKED, BLOCKER, LISTED, LIST_BLOCKER, FINE];

describe.skipIf(!URL)("block allowlist (real Postgres)", () => {
  let pool: Pool;
  let db: Db;

  beforeAll(async () => {
    pool = new Pool({
      connectionString: URL,
      options: `-c search_path=${SCHEMA}`,
    });
    db = drizzle(pool, { schema });
    // Only the columns the helpers under test touch — this is not the real
    // migration, which needs the whole schema to apply.
    await pool.query(`
      create schema ${SCHEMA};
      set search_path = ${SCHEMA};
      create table "user" (id text primary key, did text, respect_blocks boolean);
      create table profiles (did text primary key, handle text, display_name text, avatar_url text);
      create table blocks (
        uri text primary key, cid text, blocker_did text not null, rkey text not null,
        subject_did text not null, created_at timestamptz, deleted boolean not null default false,
        indexed_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table block_lists (
        uri text primary key, cid text, blocker_did text not null, rkey text not null,
        list_uri text not null, created_at timestamptz, deleted boolean not null default false,
        indexed_at timestamptz not null default now(), updated_at timestamptz not null default now()
      );
      create table block_list_items (
        uri text primary key, list_uri text not null, subject_did text not null,
        indexed_at timestamptz not null default now()
      );
      create table block_allowlist (
        owner_did text not null, subject_did text not null,
        created_at timestamptz not null default now(),
        primary key (owner_did, subject_did)
      );
    `);
    await pool.query(`insert into "user" (id, did) values ('u1', $1)`, [
      VIEWER,
    ]);
    await pool.query(`
      insert into profiles (did, handle) values
        ('${BLOCKED}', 'blocked.test'), ('${BLOCKER}', 'blocker.test'),
        ('${LISTED}', 'listed.test'), ('${LIST_BLOCKER}', 'listblocker.test'),
        ('${FINE}', 'fine.test');
      insert into blocks (uri, blocker_did, rkey, subject_did) values
        ('at://${VIEWER}/app.bsky.graph.block/1', '${VIEWER}', '1', '${BLOCKED}'),
        ('at://${BLOCKER}/app.bsky.graph.block/2', '${BLOCKER}', '2', '${VIEWER}');
      insert into block_lists (uri, blocker_did, rkey, list_uri) values
        ('at://${VIEWER}/app.bsky.graph.listblock/1', '${VIEWER}', '1', '${MODLIST}'),
        ('at://${LIST_BLOCKER}/app.bsky.graph.listblock/2', '${LIST_BLOCKER}', '2', '${VIEWER_LIST}');
      insert into block_list_items (uri, list_uri, subject_did) values
        ('at://did:plc:mod/app.bsky.graph.listitem/1', '${MODLIST}', '${LISTED}'),
        ('at://did:plc:other/app.bsky.graph.listitem/2', '${VIEWER_LIST}', '${VIEWER}');
      create table authors (did text primary key);
      insert into authors (did) values
        ('${BLOCKED}'), ('${BLOCKER}'), ('${LISTED}'), ('${LIST_BLOCKER}'), ('${FINE}');
    `);
  });

  afterAll(async () => {
    await pool?.query(`drop schema if exists ${SCHEMA} cascade`);
    await pool?.end();
  });

  /** The authors a feed query filtered through `notBlockedByViewer` returns. */
  async function visibleThroughPredicate(): Promise<Array<string>> {
    const result = await db.execute(sql`
      select did from authors
      where ${notBlockedByViewer(schema, VIEWER, sql`authors.did`)}
      order by did
    `);
    return (result.rows as Array<{ did: string }>).map((row) => row.did);
  }

  async function blockedThroughEdges(): Promise<Array<string>> {
    invalidateBlockCache(VIEWER);
    const edges = await blockEdgesAmong(db, schema, VIEWER, ALL);
    return [...edges.keys()].toSorted();
  }

  test("without an allowlist, all four directions are blocked", async () => {
    expect(await visibleThroughPredicate()).toEqual([FINE]);
    expect(await blockedThroughEdges()).toEqual(
      [BLOCKED, BLOCKER, LISTED, LIST_BLOCKER].toSorted(),
    );
  });

  test("allowlisting exempts each direction in both the predicate and the edge query", async () => {
    for (const did of [BLOCKED, BLOCKER, LISTED, LIST_BLOCKER]) {
      expect(await addToBlockAllowlist(db, schema, VIEWER, did)).toEqual({
        ok: true,
      });
    }
    expect(await visibleThroughPredicate()).toEqual(ALL.toSorted());
    expect(await blockedThroughEdges()).toEqual([]);

    // Taking one back off restores exactly that one.
    await removeFromBlockAllowlist(db, schema, VIEWER, LISTED);
    expect(await blockedThroughEdges()).toEqual([LISTED]);
    expect(await visibleThroughPredicate()).not.toContain(LISTED);
  });

  test("the owner branch is checked independently of the author's exemption", async () => {
    // A guest post by an allowlisted author in a publication owned by an
    // account that is still blocked must stay hidden.
    const result = await db.execute(sql`
      select ${notBlockedByViewer(
        schema,
        VIEWER,
        sql`${BLOCKED}::text`,
        sql`${LISTED}::text`,
      )} as visible
    `);
    expect((result.rows[0] as { visible: boolean }).visible).toBe(false);
  });

  test("blockStateFor splits enforced from overridden blocks", async () => {
    invalidateBlockCache(VIEWER);
    expect(await blockStateFor(db, schema, VIEWER, BLOCKED)).toEqual({
      block: null,
      overridden: { did: BLOCKED, direction: "blocking", listUri: null },
    });
    expect(await blockStateFor(db, schema, VIEWER, LISTED)).toEqual({
      block: { did: LISTED, direction: "list-blocking", listUri: MODLIST },
      overridden: null,
    });
    expect(await blockStateFor(db, schema, VIEWER, FINE)).toEqual({
      block: null,
      overridden: null,
    });
  });

  test("the settings listing names the block each entry overrides", async () => {
    await addToBlockAllowlist(db, schema, VIEWER, FINE);
    const rows = await readerBlockAllowlist(db, schema, VIEWER);
    const byDid = new Map(rows.map((row) => [row.did, row]));
    expect(byDid.get(BLOCKED)?.block?.direction).toBe("blocking");
    expect(byDid.get(BLOCKER)?.block?.direction).toBe("blocked-by");
    expect(byDid.get(LIST_BLOCKER)?.block?.direction).toBe("list-blocked-by");
    expect(byDid.get(FINE)?.block).toBeNull();
    expect(byDid.get(BLOCKED)?.handle).toBe("blocked.test");
    expect(byDid.has(LISTED)).toBe(false);
  });

  test("adding is idempotent and refuses the reader themselves", async () => {
    expect(await addToBlockAllowlist(db, schema, VIEWER, BLOCKED)).toEqual({
      ok: true,
    });
    const count = await pool.query(
      `select count(*)::int as n from ${SCHEMA}.block_allowlist where subject_did = '${BLOCKED}'`,
    );
    expect(count.rows[0].n).toBe(1);
    expect(await addToBlockAllowlist(db, schema, VIEWER, VIEWER)).toEqual({
      ok: false,
      reason: "self",
    });
  });
});

import { fileURLToPath } from "node:url";

import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";

import {
  diffMigrationLedger,
  findOutOfOrderMigrations,
  ledgerInsertSql,
  readJournalMigrations,
} from "./migration-ledger.ts";
import type { JournalMigration } from "./migration-ledger.ts";

const MIGRATIONS_FOLDER = fileURLToPath(
  new URL("../../drizzle", import.meta.url),
);

/**
 * Entries that already sort out of order on `main`. PR #158 renumbered its
 * 0038/0039 to 0040/0041 in a rebase but kept the original timestamps, which
 * fall before 0039's. Prod skipped both and got the columns by hand (see
 * scripts/check-migration-ledger.ts). The timestamps can't be changed now
 * without changing what every existing database thinks it has run, so they're
 * grandfathered. Nothing may be added to this list.
 */
const GRANDFATHERED_OUT_OF_ORDER = [
  "0040_pale_jackal",
  "0041_tidy_last_seen_seq",
];

function migration(
  idx: number,
  when: number,
  hash = `hash-${idx}`,
): JournalMigration {
  return { hash, idx, tag: `${String(idx).padStart(4, "0")}_m`, when };
}

describe("readJournalMigrations", () => {
  it("hashes every file exactly as drizzle's migrator does", () => {
    const ours = readJournalMigrations(MIGRATIONS_FOLDER);
    const drizzles = readMigrationFiles({
      migrationsFolder: MIGRATIONS_FOLDER,
    });
    expect(ours.map((m) => [m.hash, m.when])).toEqual(
      drizzles.map((m) => [m.hash, m.folderMillis]),
    );
  });
});

describe("the repo's journal", () => {
  it("only gets new migrations timestamped after every earlier one", () => {
    // A rebased migration that keeps the `when` it was generated with sorts
    // below main's newer entries, and drizzle-kit migrate silently skips it on
    // prod. Regenerate it with `pnpm db:generate` after rebasing instead of
    // renumbering the file by hand.
    const outOfOrder = findOutOfOrderMigrations(
      readJournalMigrations(MIGRATIONS_FOLDER),
    ).map((m) => m.tag);
    expect(outOfOrder).toEqual(GRANDFATHERED_OUT_OF_ORDER);
  });
});

describe("findOutOfOrderMigrations", () => {
  it("flags an entry timestamped at or before any earlier entry", () => {
    const migrations = [
      migration(0, 100),
      migration(1, 300),
      migration(2, 200),
      migration(3, 300),
      migration(4, 400),
    ];
    expect(findOutOfOrderMigrations(migrations).map((m) => m.idx)).toEqual([
      2, 3,
    ]);
  });
});

describe("diffMigrationLedger", () => {
  it("reports nothing when every migration ran as written", () => {
    const migrations = [migration(0, 100), migration(1, 200)];
    const diff = diffMigrationLedger(migrations, [
      { createdAt: 100, hash: "hash-0", id: 1 },
      { createdAt: 200, hash: "hash-1", id: 2 },
    ]);
    expect(diff).toEqual({
      edited: [],
      latestCreatedAt: 200,
      orphans: [],
      timestampDrift: [],
      unrecorded: [],
    });
  });

  it("separates pending migrations from ones drizzle will never run", () => {
    // Prod's shape: 0038, 0039 ran; 0040/0041 were renumbered from a branch and
    // kept timestamps below 0039's; 0042 is genuinely new.
    const migrations = [
      migration(38, 1000),
      migration(39, 3000),
      migration(40, 1000),
      migration(41, 2000),
      migration(42, 4000),
    ];
    const diff = diffMigrationLedger(migrations, [
      { createdAt: 1000, hash: "hash-38", id: 44 },
      { createdAt: 3000, hash: "hash-39", id: 45 },
    ]);
    expect(diff.unrecorded.map((m) => [m.idx, m.pending])).toEqual([
      [40, false],
      [41, false],
      [42, true],
    ]);
    // 0040 shares 0038's `when`, but 0038's row is 0038's by hash, so it does
    // not count as 0040 having run in an earlier form.
    expect(diff.edited).toEqual([]);
    expect(diff.orphans).toEqual([]);
  });

  it("treats every migration as pending against an empty ledger", () => {
    const diff = diffMigrationLedger([migration(0, 100)], []);
    expect(diff.latestCreatedAt).toBeNull();
    expect(diff.unrecorded.map((m) => m.pending)).toEqual([true]);
  });

  it("recognises a file edited after it ran, and a row matching nothing", () => {
    const migrations = [
      migration(0, 100),
      migration(1, 200),
      migration(2, 400),
    ];
    const diff = diffMigrationLedger(migrations, [
      { createdAt: 100, hash: "hash-0", id: 1 },
      { createdAt: 200, hash: "old-hash-1", id: 2 },
      { createdAt: 300, hash: "pre-renumber-draft", id: 3 },
      { createdAt: 400, hash: "hash-2", id: 4 },
    ]);
    expect(diff.edited).toEqual([
      {
        migration: migrations[1],
        row: { createdAt: 200, hash: "old-hash-1", id: 2 },
      },
    ]);
    expect(diff.orphans).toEqual([
      { createdAt: 300, hash: "pre-renumber-draft", id: 3 },
    ]);
    expect(diff.unrecorded).toEqual([]);
  });

  it("notes a row whose hash matches but whose created_at moved", () => {
    const migrations = [migration(0, 100)];
    const diff = diffMigrationLedger(migrations, [
      { createdAt: 150, hash: "hash-0", id: 1 },
    ]);
    expect(diff.timestampDrift).toEqual([
      {
        migration: migrations[0],
        row: { createdAt: 150, hash: "hash-0", id: 1 },
      },
    ]);
    expect(diff.unrecorded).toEqual([]);
  });
});

describe("ledgerInsertSql", () => {
  it("writes the row drizzle would have written", () => {
    expect(ledgerInsertSql(migration(40, 1_786_724_326_958, "abc"))).toBe(
      "insert into drizzle.__drizzle_migrations (hash, created_at) values ('abc', 1786724326958); -- 0040_m",
    );
  });
});

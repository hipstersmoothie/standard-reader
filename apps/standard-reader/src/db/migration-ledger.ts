/**
 * Compare `drizzle/meta/_journal.json` against a database's
 * `drizzle.__drizzle_migrations` ledger.
 *
 * Drizzle's migrator does not check migrations one by one. It reads the single
 * ledger row with the highest `created_at` and runs every journal entry whose
 * `when` is greater. So an entry whose `when` sorts below an earlier entry's
 * (which happens when a branch's migration is renumbered during a rebase but
 * keeps the timestamp it was generated with) is skipped silently, everywhere
 * the earlier entry has already run. `drizzle-kit check` and the CI apply step
 * both pass. That is how 0040/0041 (PR #158) reached prod without a ledger row.
 *
 * Hashes are computed exactly as `drizzle-orm/migrator`'s `readMigrationFiles`
 * does: sha256 of the whole `.sql` file, unmodified.
 */
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

export interface JournalMigration {
  hash: string;
  idx: number;
  tag: string;
  /** The journal entry's `when`, which Drizzle records as `created_at`. */
  when: number;
}

export interface LedgerRow {
  createdAt: number;
  hash: string;
  id: number;
}

export interface UnrecordedMigration extends JournalMigration {
  /**
   * `true`: `when` is past the ledger's latest `created_at`, so the next
   * `drizzle-kit migrate` runs it (an ordinary pending migration).
   * `false`: it sorts below the latest row, so Drizzle never runs it. Its
   * schema change either got applied some other way or is missing.
   */
  pending: boolean;
}

export interface LedgerDiff {
  /**
   * The file no longer matches what ran: a row carries this entry's `when`,
   * but a hash that matches no current file.
   */
  edited: Array<{ migration: JournalMigration; row: LedgerRow }>;
  latestCreatedAt: number | null;
  /** Rows matching no journal entry by hash or by `when` (e.g. a pre-renumber draft). */
  orphans: Array<LedgerRow>;
  /** The hash matches, but the row's `created_at` differs from the journal's `when`. */
  timestampDrift: Array<{ migration: JournalMigration; row: LedgerRow }>;
  unrecorded: Array<UnrecordedMigration>;
}

interface JournalFile {
  entries: Array<{ idx: number; tag: string; when: number }>;
}

export function hashMigrationSql(sql: string): string {
  return createHash("sha256").update(sql).digest("hex");
}

export function readJournalMigrations(folder: string): Array<JournalMigration> {
  const journal = JSON.parse(
    readFileSync(path.join(folder, "meta", "_journal.json"), "utf8"),
  ) as JournalFile;
  return journal.entries.map((entry) => ({
    hash: hashMigrationSql(
      readFileSync(path.join(folder, `${entry.tag}.sql`), "utf8"),
    ),
    idx: entry.idx,
    tag: entry.tag,
    when: entry.when,
  }));
}

/**
 * Journal entries whose `when` is not strictly greater than every entry before
 * them. Any database that has already run the earlier entry skips these.
 */
export function findOutOfOrderMigrations(
  migrations: Array<JournalMigration>,
): Array<JournalMigration> {
  const outOfOrder: Array<JournalMigration> = [];
  let maxWhen = Number.NEGATIVE_INFINITY;
  for (const migration of migrations) {
    if (migration.when <= maxWhen) outOfOrder.push(migration);
    maxWhen = Math.max(maxWhen, migration.when);
  }
  return outOfOrder;
}

export function diffMigrationLedger(
  migrations: Array<JournalMigration>,
  rows: Array<LedgerRow>,
): LedgerDiff {
  const knownHashes = new Set(migrations.map((m) => m.hash));
  const rowsByHash = new Map<string, LedgerRow>();
  for (const row of rows) {
    if (!rowsByHash.has(row.hash)) rowsByHash.set(row.hash, row);
  }
  // Only rows whose hash matches no file can explain an edited migration;
  // a row that matches another file by hash belongs to that file.
  const strayRows = rows.filter((row) => !knownHashes.has(row.hash));
  const claimed = new Set<number>();

  const latestCreatedAt =
    rows.length === 0 ? null : Math.max(...rows.map((row) => row.createdAt));

  const diff: LedgerDiff = {
    edited: [],
    latestCreatedAt,
    orphans: [],
    timestampDrift: [],
    unrecorded: [],
  };

  for (const migration of migrations) {
    const byHash = rowsByHash.get(migration.hash);
    if (byHash) {
      if (byHash.createdAt !== migration.when) {
        diff.timestampDrift.push({ migration, row: byHash });
      }
      continue;
    }
    const byWhen = strayRows.find(
      (row) => row.createdAt === migration.when && !claimed.has(row.id),
    );
    if (byWhen) {
      claimed.add(byWhen.id);
      diff.edited.push({ migration, row: byWhen });
      continue;
    }
    diff.unrecorded.push({
      ...migration,
      pending: latestCreatedAt === null || migration.when > latestCreatedAt,
    });
  }

  diff.orphans = strayRows.filter((row) => !claimed.has(row.id));
  return diff;
}

/** The ledger row Drizzle would have written had it run this migration. */
export function ledgerInsertSql(migration: JournalMigration): string {
  return `insert into drizzle.__drizzle_migrations (hash, created_at) values ('${migration.hash}', ${migration.when}); -- ${migration.tag}`;
}

/**
 * Diff `drizzle/meta/_journal.json` against a database's migration ledger,
 * read-only.
 *
 *   pnpm db:check-ledger                 # DATABASE_URL from .env
 *
 * Exits 1 if any journal entry has no ledger row and sorts below the ledger's
 * latest `created_at`. Drizzle will never run such a migration, so its schema
 * change is either already on the database by some other route (record it with
 * the printed INSERT once you've confirmed that) or missing (apply it by hand,
 * then record it). Edited files, orphan rows and timestamp drift are printed as
 * warnings: they're history, not something the next migrate trips on.
 */
import { fileURLToPath } from "node:url";

import { Client } from "pg";

import {
  diffMigrationLedger,
  findOutOfOrderMigrations,
  ledgerInsertSql,
  readJournalMigrations,
} from "../src/db/migration-ledger.ts";
import type { LedgerRow } from "../src/db/migration-ledger.ts";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(2);
}

const migrations = readJournalMigrations(
  fileURLToPath(new URL("../drizzle", import.meta.url)),
);

const client = new Client({ connectionString: url });
await client.connect();
let rows: Array<LedgerRow>;
try {
  await client.query("begin read only");
  const result = await client.query<{
    created_at: string;
    hash: string;
    id: number;
  }>(
    "select id, hash, created_at from drizzle.__drizzle_migrations order by id",
  );
  await client.query("rollback");
  rows = result.rows.map((row) => ({
    createdAt: Number(row.created_at),
    hash: row.hash,
    id: row.id,
  }));
} finally {
  await client.end();
}

const diff = diffMigrationLedger(migrations, rows);
const skipped = diff.unrecorded.filter((m) => !m.pending);
const pending = diff.unrecorded.filter((m) => m.pending);

console.log(
  `${migrations.length} journal entries, ${rows.length} ledger rows, latest created_at ${diff.latestCreatedAt ?? "none"}`,
);

const outOfOrder = findOutOfOrderMigrations(migrations);
if (outOfOrder.length > 0) {
  console.log(
    `\nJournal entries timestamped before an earlier entry: ${outOfOrder.map((m) => m.tag).join(", ")}`,
  );
}

if (pending.length > 0) {
  console.log(
    `\nPending (the next migrate runs these): ${pending.map((m) => m.tag).join(", ")}`,
  );
}

for (const { migration, row } of diff.edited) {
  console.log(
    `\nwarning: ${migration.tag} was edited after it ran (ledger row ${row.id} has hash ${row.hash.slice(0, 12)}…)`,
  );
}
for (const row of diff.orphans) {
  console.log(
    `\nwarning: ledger row ${row.id} (created_at ${row.createdAt}, hash ${row.hash.slice(0, 12)}…) matches no journal entry`,
  );
}
for (const { migration, row } of diff.timestampDrift) {
  console.log(
    `\nwarning: ${migration.tag} ran, but ledger row ${row.id} has created_at ${row.createdAt}, not ${migration.when}`,
  );
}

if (skipped.length > 0) {
  console.log(
    `\nNever applied by drizzle (no ledger row, sorts below ${diff.latestCreatedAt}):`,
  );
  for (const m of skipped) console.log(`  ${m.tag}`);
  console.log(
    "\nConfirm each one's schema change is on the database, then record it:\n",
  );
  for (const m of skipped) console.log(ledgerInsertSql(m));
  process.exitCode = 1;
} else {
  console.log("\nEvery migration drizzle can no longer run is recorded.");
}

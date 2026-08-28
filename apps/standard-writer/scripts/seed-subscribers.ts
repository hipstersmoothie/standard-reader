/**
 * Local dev harness: give a publication a confirmed subscriber list so the send
 * pipeline and analytics screens have real recipients to work with.
 *
 *   pnpm --filter standard-writer exec tsx --env-file=.env \
 *     scripts/seed-subscribers.ts [publicationUri] [count]
 *
 * With no publicationUri it prints the publications in the DB so you can pick
 * one. Idempotent — re-running tops the list up without duplicating emails.
 * Needs DATABASE_URL pointed at a database that already has publications (e.g.
 * the shared Standard Reader dev DB / a Neon branch).
 */

import { randomUUID } from "node:crypto";

import {
  newsletterSubscribers,
  publications,
} from "@standard-reader/db/schema";
import { desc } from "drizzle-orm";

import { getDb } from "../src/db/index.server";

const db = getDb();
if (!db) {
  console.error("DATABASE_URL is not set — nothing to seed.");
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

const [pubUriArg, countArg] = process.argv.slice(2);
const count = Math.max(1, Number(countArg) || 8);

if (!pubUriArg) {
  const rows = await db
    .select({ uri: publications.uri, name: publications.name })
    .from(publications)
    .orderBy(desc(publications.indexedAt))
    .limit(20);

  if (rows.length === 0) {
    console.error(
      "No publications in the DB. Point DATABASE_URL at a database that has some.",
    );
  } else {
    console.log("Pass one of these publication URIs as the first argument:\n");
    for (const r of rows) console.log(`  ${r.uri}  —  ${r.name}`);
  }
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(rows.length === 0 ? 1 : 0);
}

const now = new Date();
const values = Array.from({ length: count }, (_, i) => ({
  id: randomUUID(),
  publicationUri: pubUriArg,
  email: `subscriber+${i + 1}@example.test`,
  status: "confirmed" as const,
  token: randomUUID(),
  createdAt: now,
  confirmedAt: now,
}));

const inserted = await db
  .insert(newsletterSubscribers)
  .values(values)
  .onConflictDoNothing({
    target: [newsletterSubscribers.publicationUri, newsletterSubscribers.email],
  })
  .returning({ email: newsletterSubscribers.email });

console.log(
  `Seeded ${inserted.length} new confirmed subscriber(s) for ${pubUriArg} ` +
    `(${count - inserted.length} already present).`,
);

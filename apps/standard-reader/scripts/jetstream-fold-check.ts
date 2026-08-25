/**
 * Fold one repo out of Jetstream's archive and report what it holds, without
 * writing anything.
 *
 *   pnpm exec tsx --env-file=.env scripts/jetstream-fold-check.ts <did> [...]
 *
 * The reconcile sweep prunes read-model rows that the fold's live set does not
 * contain, so "does the fold see everything the repo actually has" is the one
 * question worth being able to ask directly before trusting it.
 */
import { eq } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import { documents, publications } from "../src/db/schema.ts";
import { Collections } from "../src/server/atproto/uri.ts";
import { foldRepoFromArchive } from "../src/server/ingest/archive-replay.ts";

const dids = process.argv.slice(2).filter((arg) => arg.startsWith("did:"));
if (dids.length === 0) {
  console.error(
    "usage: pnpm exec tsx --env-file=.env scripts/jetstream-fold-check.ts <did> [...]",
  );
  // eslint-disable-next-line unicorn/no-process-exit
  process.exit(1);
}

for (const did of dids) {
  const startedAt = performance.now();
  const fold = await foldRepoFromArchive(did, { afterSeq: 0, skipApply: true });
  const ms = Math.round(performance.now() - startedAt);

  console.log(`\n${did}  (${ms}ms)`);
  console.log(
    `  empty=${fold.empty} gone=${fold.gone} lastSeq=${fold.lastSeq}`,
  );
  if (fold.live.size === 0) {
    console.log("  (no live records)");
    continue;
  }
  for (const [collection, uris] of [...fold.live].toSorted(
    (a, b) => b[1].size - a[1].size,
  )) {
    console.log(`  ${String(uris.size).padStart(7)}  ${collection}`);
  }

  // The number that decides whether reconcile is safe: rows we hold that the
  // fold did NOT see are exactly what `pruneStaleRepoRecords` would delete.
  for (const [table, collection, label] of [
    [documents, Collections.document, "documents"],
    [publications, Collections.publication, "publications"],
  ] as const) {
    const rows = await db
      .select({ uri: table.uri })
      .from(table)
      .where(eq(table.did, did));
    const live = fold.live.get(collection) ?? new Set<string>();
    const wouldPrune = rows.filter((row) => !live.has(row.uri));
    console.log(
      `  ${label}: ${rows.length} mirrored, ${wouldPrune.length} WOULD BE PRUNED`,
    );
    for (const row of wouldPrune.slice(0, 3)) console.log(`      ${row.uri}`);
  }
}
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);

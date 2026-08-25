/* eslint-disable no-console -- this script's whole output is its console report */
/**
 * Republish topics that were unlisted before the sweep learned to carry them.
 *
 *   pnpm topics:repair            # dry run — prints the plan, writes nothing
 *   pnpm topics:repair --apply    # republishes
 *
 * A one-off. The sweep's carry-forward fix is forward-only (it looks at what
 * is currently published), so the topics already lost need this deliberate
 * pass. See `src/server/ingest/repair-topics.ts` for what is recoverable and
 * what is not.
 */
import type { RepairRejection } from "../src/server/ingest/repair-topics.ts";
import {
  applyTopicRepair,
  planTopicRepair,
} from "../src/server/ingest/repair-topics.ts";

const apply = process.argv.includes("--apply");

const started = Date.now();
const plan = await planTopicRepair();

const REASONS: Array<[RepairRejection, string]> = [
  ["no-live-tags", "every tag has left the vocabulary"],
  ["below-entry-bar", "does not clear the entry bar today"],
  ["duplicate-of-live-topic", "tags already covered by a published topic"],
  [
    "duplicate-of-repaired-topic",
    "tags covered by another topic being restored",
  ],
  ["duplicate-name-of-live-topic", "same name as a published topic"],
  [
    "duplicate-name-of-repaired-topic",
    "same name as another topic being restored",
  ],
];

console.log(`\nConsidered ${plan.considered} unlisted topics.\n`);
console.log(`WOULD RESTORE: ${plan.restore.length}\n`);
for (const [index, topic] of plan.restore.entries()) {
  console.log(
    `${String(index + 1).padStart(3)}. ${topic.slug}` +
      `\n     ${topic.name} — ${topic.publications.length} publications, ` +
      `${topic.authorCount} authors, ${topic.tags.length} tags` +
      `\n     ${topic.tags.slice(0, 8).join(", ")}`,
  );
}

console.log("\nLEFT DEAD:");
for (const [reason, label] of REASONS) {
  const rows = plan.rejected.filter((row) => row.reason === reason);
  console.log(`  ${rows.length.toString().padStart(4)}  ${label}`);
}

// The near-misses are the interesting rejections: everything else is either
// obviously gone or an obvious duplicate.
const nearMiss = plan.rejected
  .filter((row) => row.reason === "below-entry-bar" && row.authorCount >= 3)
  .toSorted((left, right) => right.authorCount - left.authorCount)
  .slice(0, 10);
if (nearMiss.length > 0) {
  console.log("\n  closest below the bar:");
  for (const row of nearMiss) {
    console.log(
      `    ${row.slug} — ${row.publicationCount} pubs, ${row.authorCount} authors`,
    );
  }
}

const duplicates = plan.rejected
  .filter((row) => row.reason.startsWith("duplicate"))
  .toSorted((left, right) => right.authorCount - left.authorCount)
  .slice(0, 10);
if (duplicates.length > 0) {
  console.log("\n  largest skipped as duplicates:");
  for (const row of duplicates) {
    console.log(`    ${row.slug} -> covered by ${row.coveredBy}`);
  }
}

if (apply) {
  const restored = await applyTopicRepair(plan);
  console.log(`\nAPPLIED: republished ${restored} topics.`);
} else {
  console.log("\nDry run — nothing written. Re-run with --apply to restore.");
}

console.log(`Elapsed ${Date.now() - started}ms\n`);

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
/* eslint-enable no-console */

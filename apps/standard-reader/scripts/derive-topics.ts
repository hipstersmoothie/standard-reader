/* eslint-disable no-console -- this script's whole output is its console report */
/**
 * Inspect the topic derivation without writing anything.
 *
 * Runs the clustering and the quality bar against the live read-model and
 * prints what *would* be published, so the bar can be tuned against real data
 * (and regressions like a single-operator publication fleet forming the biggest
 * "topic" can be spotted) before the sweep persists anything.
 *
 * Read-only: naming and persistence are skipped entirely, so this makes no API
 * calls and no writes.
 *
 *   pnpm topics:derive           # published topics only
 *   pnpm topics:derive --all     # include the clusters that missed the bar
 */
import { deriveTopics } from "../src/server/ingest/recompute-topics.ts";

const showAll = process.argv.includes("--all");

const started = Date.now();
const derivation = await deriveTopics();
const elapsed = Date.now() - started;

const published = derivation.candidates.filter(
  (candidate) => candidate.published,
);
const rejected = derivation.candidates.filter(
  (candidate) => !candidate.published,
);

console.log(
  [
    `graph      ${derivation.tags} tags, ${derivation.edges} edges`,
    `clusters   ${derivation.clusters} total`,
    `dropped    ${derivation.droppedByTags} too few tags, ` +
      `${derivation.droppedByPublications} too few publications, ` +
      `${derivation.droppedByAuthors} too few authors, ` +
      `${derivation.droppedByConcentration} one-operator fleets`,
    `published  ${published.length}`,
    `elapsed    ${(elapsed / 1000).toFixed(1)}s`,
  ].join("\n"),
);

function describe(candidate: (typeof derivation.candidates)[number]): string {
  const head = candidate.signature.slice(0, 10).join(", ");
  const share = `${Math.round(candidate.topAuthorShare * 100)}% top author`;
  return (
    `\n[${candidate.tags.length} tags · ${candidate.publications.length} pubs · ` +
    `${candidate.authorCount} authors · ${share} · ${candidate.documentCount} docs]\n  ${head}`
  );
}

console.log("\n=== published ===");
for (const candidate of [...published].toSorted(
  (a, b) => b.authorCount - a.authorCount,
)) {
  console.log(describe(candidate));
}

if (showAll) {
  console.log("\n=== rejected: too few publications or authors ===");
  for (const candidate of rejected) console.log(describe(candidate));

  console.log("\n=== rejected: too few tags ===");
  for (const tags of derivation.belowTagBar) {
    console.log(`\n[${tags.length} tags]\n  ${tags.slice(0, 10).join(", ")}`);
  }
}

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
/* eslint-enable no-console */

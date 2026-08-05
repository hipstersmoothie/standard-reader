/* eslint-disable no-console -- this script's whole output is its console report */
/**
 * Tune the reach waiver against real clusters, writing nothing.
 *
 *   pnpm topics:analyze-tag-floor
 *
 * `MIN_CLUSTER_TAGS` measures vocabulary breadth as a proxy for substance, and
 * that proxy fails for subjects the network writes about with one dominant tag
 * (see `ABSOLUTE_MIN_CLUSTER_TAGS`). The waiver lets author reach stand in for
 * breadth down to a hard floor; this sweeps both knobs over one derivation so
 * the settings are chosen from what they actually admit, not from taste.
 *
 * Read-only — it runs the same derivation `pnpm topics:derive` does.
 */
import {
  MAX_TOP_AUTHOR_SHARE,
  MIN_CLUSTER_AUTHORS,
  MIN_CLUSTER_PUBLICATIONS,
  MIN_CLUSTER_TAGS,
  deriveTopics,
} from "../src/server/ingest/recompute-topics.ts";

const started = Date.now();
const derivation = await deriveTopics();

/** Everything except the tag rule, which is the knob being swept. */
const eligible = derivation.candidates.filter(
  (candidate) =>
    candidate.publications.length >= MIN_CLUSTER_PUBLICATIONS &&
    candidate.authorCount >= MIN_CLUSTER_AUTHORS &&
    candidate.topAuthorShare <= MAX_TOP_AUTHOR_SHARE,
);

const baseline = eligible.filter(
  (candidate) => candidate.tags.length >= MIN_CLUSTER_TAGS,
);
const short = eligible
  .filter((candidate) => candidate.tags.length < MIN_CLUSTER_TAGS)
  .toSorted((a, b) => b.authorCount - a.authorCount);

console.log(
  `\nderivation: ${derivation.clusters} clusters, ` +
    `${baseline.length} publish at the current bar (>= ${MIN_CLUSTER_TAGS} tags)\n` +
    `${short.length} clusters clear publications/authors/concentration but not the tag floor\n`,
);

console.log("knob sweep — topics ADDED by the waiver:\n");
console.log(
  "  minTags |" +
    [10, 20, 30, 40, 50, 75].map((a) => ` >=${a}a`.padStart(7)).join(""),
);
for (const minTags of [6, 8, 10, 12]) {
  const row = [10, 20, 30, 40, 50, 75].map((minAuthors) => {
    const n = short.filter(
      (candidate) =>
        candidate.tags.length >= minTags && candidate.authorCount >= minAuthors,
    ).length;
    return String(n).padStart(7);
  });
  console.log(`  ${String(minTags).padStart(7)} |${row.join("")}`);
}

console.log("\nwhat the short clusters actually are (top 25 by authors):\n");
for (const candidate of short.slice(0, 25)) {
  console.log(
    `  ${String(candidate.tags.length).padStart(2)} tags · ` +
      `${String(candidate.publications.length).padStart(4)} pubs · ` +
      `${String(candidate.authorCount).padStart(4)} authors · ` +
      `${String(Math.round(candidate.topAuthorShare * 100)).padStart(3)}% top\n` +
      `      ${candidate.signature.slice(0, 9).join(", ")}`,
  );
}

console.log(
  `\nFor reference, published topics at the current bar have a median of ` +
    `${median(baseline.map((c) => c.authorCount))} authors ` +
    `and ${median(baseline.map((c) => c.tags.length))} tags.`,
);
console.log(`\nElapsed ${((Date.now() - started) / 1000).toFixed(1)}s\n`);

function median(values: Array<number>): number {
  const sorted = values.toSorted((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);
/* eslint-enable no-console */

/**
 * Topic derivation — the daily rebuild of `/topics`.
 *
 * **Why this is its own process.** Derivation used to sit inside the hourly
 * recompute sweep, which was the wrong home twice over. It is minutes of work
 * — clustering the whole tag graph, embedding tag contexts, and calling the
 * naming model — so running it hourly put a long, bursty job in front of the
 * aggregate refresh that feeds every article card. And it is work whose output
 * barely moves: the tag graph is built from the whole corpus, so an hour of new
 * documents shifts almost no edge weights and re-derives the same clusters.
 *
 * Daily is the natural cadence. Nothing downstream needs topics to be fresher
 * than that, and the sweep's own caching means a run that finds no drift makes
 * no naming calls at all.
 *
 * Reads `discover_topic_counts` for its vocabulary, which the hourly sweep
 * rebuilds — so this only needs the counts to exist, not to have just run.
 *
 * Env:
 *   ANTHROPIC_API_KEY       enables naming; without it clusters fall back to a
 *                           deterministic name and the next run retries
 *   TOPIC_NAMING_MODEL      naming model (default `claude-opus-5`)
 *   TOPIC_EMBEDDINGS        `1` to add semantic edges from tag context
 *   TOPIC_EMBEDDING_MODEL   embedding model (default `Xenova/all-MiniLM-L6-v2`)
 */

import { recomputeTopics } from "../src/server/ingest/recompute-topics.ts";
import { logEvent } from "../src/server/observability/log.ts";

const startedAt = Date.now();

try {
  const summary = await recomputeTopics();
  const durationMs = Date.now() - startedAt;

  logEvent("topics.cron", { durationMs, ...summary });
  console.info(
    `[topics-cron] ${summary.published} published from ${summary.clusters} clusters ` +
      `(${summary.tags} tags, ${summary.edges} edges, ${summary.semanticEdges} semantic), ` +
      `${summary.named} named, in ${Math.round(durationMs / 1000)}s`,
  );
} catch (error) {
  // Topics are a discovery surface, not core data: the previously published
  // set stays live and tomorrow's run retries. Exit non-zero so the failure is
  // visible in Railway rather than silently skipped.
  logEvent("topics.cron.failed", {
    durationMs: Date.now() - startedAt,
    error: error instanceof Error ? error.message : String(error),
  });
  console.error("[topics-cron] derivation failed:", error);
  process.exitCode = 1;
}

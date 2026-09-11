/**
 * Backfill `documents.lang` across the existing corpus.
 *
 * `upsertDocument` tags documents as they are written and the hourly sweep
 * (`backfillDocumentLanguages` in `recompute.ts`) mops up stragglers, but the
 * sweep is capped at a couple of thousand documents so it never competes with
 * the live tap. That cap would take weeks to cover ~3.4M existing rows, so the
 * first pass runs here instead, where it can take as long as it needs.
 *
 * Idempotent and resumable: the work queue is `lang_detected_at IS NULL`, so
 * interrupting this and re-running it picks up exactly where it stopped. Safe
 * to run while ingest is running.
 *
 *   pnpm backfill:languages
 */
import { backfillDocumentLanguages } from "../src/server/ingest/recompute.ts";

const startedAt = Date.now();
let lastLoggedAt = 0;

const examined = await backfillDocumentLanguages({
  limit: Number.POSITIVE_INFINITY,
  onProgress: (count) => {
    // Roughly every ten seconds — a line per 500-document batch would be
    // thousands of lines on a full corpus.
    const now = Date.now();
    if (now - lastLoggedAt < 10_000) return;
    lastLoggedAt = now;
    const elapsed = (now - startedAt) / 1000;
    // eslint-disable-next-line no-console
    console.log(
      `[backfill:languages] ${count} examined (${Math.round(count / elapsed)}/s)`,
    );
  },
});

// eslint-disable-next-line no-console
console.log(
  `[backfill:languages] done: ${examined} document(s) examined in ${Math.round(
    (Date.now() - startedAt) / 1000,
  )}s`,
);
// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);

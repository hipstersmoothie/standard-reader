/**
 * Backfill `documents.lang` across the existing corpus.
 *
 * `upsertDocument` tags documents as they are written and the hourly sweep
 * (`backfillDocumentLanguages` in `recompute.ts`) mops up stragglers, but the
 * sweep is capped at a couple of thousand documents so it never competes with
 * the live stream. That cap would take weeks to cover ~3M existing rows, so the
 * first pass runs here instead, where it can take as long as it needs.
 *
 * Two passes: GlotLID over every untagged document (~2-3 hours, bounded by
 * database round trips, not the model), then the Jev tiebreak over the ~2% it
 * wasn't sure of (~60k calls, ~$4 at Jev's published $0.042/Mtok; skipped when
 * `JEV_API_KEY` is unset, and `--no-tiebreak` skips it deliberately — the
 * hourly sweep works the queue down either way).
 *
 * Idempotent and resumable: the work queues are `lang_detected_at IS NULL` and
 * `lang_source = 'glotlid-unsure'`, so interrupting this and re-running it picks
 * up exactly where it stopped. Safe to run while ingest is running.
 *
 *   pnpm backfill:languages [--no-tiebreak]
 */
import { sql } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import {
  backfillDocumentLanguages,
  tiebreakDocumentLanguages,
} from "../src/server/ingest/recompute.ts";

function progress(label: string) {
  const startedAt = Date.now();
  let lastLoggedAt = 0;
  return {
    onProgress: (count: number) => {
      // Roughly every ten seconds — a line per batch would be thousands of
      // lines on a full corpus.
      const now = Date.now();
      if (now - lastLoggedAt < 10_000) return;
      lastLoggedAt = now;
      const elapsed = (now - startedAt) / 1000;
      // eslint-disable-next-line no-console
      console.log(
        `[backfill:languages] ${label}: ${count} (${Math.round(count / elapsed)}/s)`,
      );
    },
    seconds: () => Math.round((Date.now() - startedAt) / 1000),
  };
}

const detect = progress("detected");
const examined = await backfillDocumentLanguages({
  limit: Number.POSITIVE_INFINITY,
  onProgress: detect.onProgress,
});
// eslint-disable-next-line no-console
console.log(
  `[backfill:languages] GlotLID: ${examined} document(s) examined in ${detect.seconds()}s`,
);

// The backfill moves `lang IS NULL` from ~100% of rows to its real share, which
// the planner's statistics still describe as the former until autovacuum gets
// round to it. Language-filtered pages plan on those numbers, so refresh them
// now rather than whenever. Seconds; blocks neither reads nor writes.
await db.execute(sql`analyze documents`);

if (!process.argv.includes("--no-tiebreak")) {
  const tiebreak = progress("tiebroken");
  const settled = await tiebreakDocumentLanguages({
    limit: Number.POSITIVE_INFINITY,
    onProgress: tiebreak.onProgress,
  });
  // eslint-disable-next-line no-console
  console.log(
    `[backfill:languages] Jev: ${settled} document(s) settled in ${tiebreak.seconds()}s`,
  );
}

// eslint-disable-next-line unicorn/no-process-exit
process.exit(0);

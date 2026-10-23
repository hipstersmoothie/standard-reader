/**
 * Backfill `document_languages` across the existing corpus.
 *
 * `upsertDocument` tags documents as they are written and the hourly sweep
 * (`backfillDocumentLanguages` in `recompute.ts`) works the `pending` queue the
 * web server leaves, but neither touches the corpus from before language
 * tagging — documents with no `document_languages` row at all. This does.
 *
 * Two passes: GlotLID over every untagged document, newest first
 * (`tagUntaggedDocuments`; bounded by reading the bodies, not the model), then
 * the Jev tiebreak over the ~2% it
 * wasn't sure of (~60k calls, ~$4 at Jev's published $0.042/Mtok; skipped when
 * `JEV_API_KEY` is unset, and `--no-tiebreak` skips it deliberately — the
 * hourly sweep works the queue down either way).
 *
 * Idempotent and resumable: the work is "no row yet" and
 * `source = 'glotlid-unsure'`, so interrupting this and re-running it picks up
 * where it stopped. Safe to run while ingest is running.
 *
 *   pnpm backfill:languages [--no-tiebreak]
 */
import { sql } from "drizzle-orm";

import { db } from "../src/db/index.ts";
import {
  backfillDocumentLanguages,
  tagUntaggedDocuments,
  tiebreakDocumentLanguages,
} from "../src/server/ingest/recompute.ts";

function progress(label: string) {
  const startedAt = Date.now();
  let lastLoggedAt = 0;
  return {
    onProgress: (count: number, reached?: Date) => {
      // Roughly every ten seconds — a line per batch would be thousands of
      // lines on a full corpus.
      const now = Date.now();
      if (now - lastLoggedAt < 10_000) return;
      lastLoggedAt = now;
      const elapsed = (now - startedAt) / 1000;
      // eslint-disable-next-line no-console
      console.log(
        `[backfill:languages] ${label}: ${count} (${Math.round(count / elapsed)}/s)${reached ? `, back to ${reached.toISOString().slice(0, 10)}` : ""}`,
      );
    },
    seconds: () => Math.round((Date.now() - startedAt) / 1000),
  };
}

// Whatever the web server queued while no worker was tagging.
await backfillDocumentLanguages({ limit: Number.POSITIVE_INFINITY });

const detect = progress("detected");
const examined = await tagUntaggedDocuments({ onProgress: detect.onProgress });
// eslint-disable-next-line no-console
console.log(
  `[backfill:languages] GlotLID: ${examined} document(s) examined in ${detect.seconds()}s`,
);

// The table went from empty to the whole corpus in one run; refresh the
// planner's statistics now rather than whenever autovacuum gets round to it.
// Seconds; blocks neither reads nor writes.
await db.execute(sql`analyze document_languages`);

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

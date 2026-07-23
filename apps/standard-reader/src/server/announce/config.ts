/**
 * Configuration + small text helpers for the weekly "hottest articles" Bluesky
 * thread. Kept transport-free so the runner, thread builder, and tests can share
 * it. See {@link ../../../scripts/post-weekly-thread.ts} for the cron entrypoint.
 */

/** How far back "over the week" reaches when ranking the hottest articles. */
export const HOT_WINDOW_DAYS = 7;

/** Number of article posts in the thread (the CTA post is extra). */
export const HOT_ARTICLE_LIMIT = 5;

/** Bluesky's per-post limit is 300 graphemes. */
export const BSKY_POST_MAX_GRAPHEMES = 300;

/** Collection NSID for a Bluesky post record. */
export const BSKY_FEED_POST = "app.bsky.feed.post";

/** External-embed thumbnails must fit the PDS blob ceiling (~1 MB). */
export const MAX_THUMB_BYTES = 976_560;

/** Resolved bot credentials for the posting account. */
export interface ReaderBotCredentials {
  identifier: string;
  password: string;
  service: string;
}

/**
 * Read the posting account's app-password credentials. Dedicated `READER_BOT_*`
 * vars are what Railway/CI sets; they fall back to the `PERF_TEST_*` names so
 * local `pnpm thread:post:dev` works against the same account without extra
 * config.
 */
export function readerBotCredentials(): ReaderBotCredentials {
  const identifier =
    process.env.READER_BOT_IDENTIFIER ?? process.env.PERF_TEST_IDENTIFIER;
  const password =
    process.env.READER_BOT_APP_PASSWORD ?? process.env.PERF_TEST_APP_PASSWORD;
  const service =
    process.env.READER_BOT_PDS_URL ??
    process.env.PERF_TEST_PDS_URL ??
    "https://bsky.social";

  if (!identifier || !password) {
    throw new Error(
      "Missing bot credentials: set READER_BOT_IDENTIFIER + READER_BOT_APP_PASSWORD (or PERF_TEST_* for local dev).",
    );
  }
  return { identifier, password, service };
}

/** When true, compose + log the thread but never write records to the PDS. */
export function isDryRun(): boolean {
  return Boolean(process.env.THREAD_DRY_RUN?.trim());
}

function graphemeSegmenter(): Intl.Segmenter | null {
  if (globalThis.Intl?.Segmenter === undefined) return null;
  return new Intl.Segmenter(undefined, { granularity: "grapheme" });
}

/** Count graphemes (what Bluesky's 300-char limit measures). */
export function graphemeCount(text: string): number {
  const segmenter = graphemeSegmenter();
  if (!segmenter) return text.length;
  let n = 0;
  for (const _ of segmenter.segment(text)) n++;
  return n;
}

/** Truncate to at most `max` graphemes, appending an ellipsis when shortened. */
export function capGraphemes(
  text: string,
  max: number = BSKY_POST_MAX_GRAPHEMES,
): string {
  const segmenter = graphemeSegmenter();
  if (!segmenter) {
    return text.length <= max
      ? text
      : `${text.slice(0, Math.max(0, max - 1))}…`;
  }
  const segments = [...segmenter.segment(text)];
  if (segments.length <= max) return text;
  return `${segments
    .slice(0, max - 1)
    .map((s) => s.segment)
    .join("")}…`;
}

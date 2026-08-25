/**
 * Tracks DIDs whose stored OAuth session atcute just reported as deleted.
 *
 * A failed session restore is ambiguous on its own: `restoreAtprotoSession`
 * swallows every error and returns `null`, so "the session is gone" and "the
 * PDS was briefly unreachable" look identical to callers. atcute's `deleted`
 * event is the one signal that separates them.
 *
 * The OAuth client records deletions here; the request path consumes them (see
 * `endSessionIfOauthSessionDeleted` in `src/middleware/auth-session.server.ts`)
 * so a reader's app session is only torn down when their OAuth session is
 * genuinely gone, never on a transient blip.
 *
 * Kept in its own dependency-free module so the request path can read the
 * signal without importing the OAuth client, and so this is testable without
 * standing up OAuth config.
 */

/** DID -> epoch ms of the most recently observed deletion. */
const recentSessionDeletions = new Map<string, number>();

/**
 * How long a recorded deletion stays relevant. Comfortably longer than the
 * restore it belongs to, short enough that a stale record can't sign out a
 * reader who has since signed back in.
 */
export const SESSION_DELETION_TTL_MS = 30_000;

/** Drop expired entries so the map can't grow unbounded if nothing consumes. */
function prune(now: number): void {
  for (const [did, at] of recentSessionDeletions) {
    if (now - at > SESSION_DELETION_TTL_MS) {
      recentSessionDeletions.delete(did);
    }
  }
}

/** Record that atcute dropped this DID's stored session. */
export function recordSessionDeletion(did: string, now = Date.now()): void {
  prune(now);
  recentSessionDeletions.set(did, now);
}

/**
 * True when a deletion was recorded for this DID within
 * {@link SESSION_DELETION_TTL_MS} — i.e. the restore that just failed did so
 * because the session is gone, not because the PDS was unreachable.
 *
 * Consumes the record either way, so one deletion drives at most one sign-out
 * and a stale entry can't linger into a later request.
 */
export function consumeRecentSessionDeletion(
  did: string,
  now = Date.now(),
): boolean {
  const at = recentSessionDeletions.get(did);
  if (at === undefined) {
    return false;
  }
  recentSessionDeletions.delete(did);
  return now - at <= SESSION_DELETION_TTL_MS;
}

/** Test seam. */
export function resetSessionDeletionsForTest(): void {
  recentSessionDeletions.clear();
}

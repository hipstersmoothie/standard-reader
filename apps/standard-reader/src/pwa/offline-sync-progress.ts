/**
 * Observable progress for the offline sync pass, for the troubleshooting panel
 * in settings (`/settings?debug`).
 *
 * Sync is invisible by design — it runs in the background of an installed app
 * and its only user-facing product is pages that happen to work later. That
 * also makes it undebuggable from a phone: when a surface is missing offline,
 * nothing says whether sync never ran, ran and was killed mid-pass, stopped on
 * the storage guard, or finished and the surface was simply never warmed. This
 * store exists so a device can answer that.
 *
 * Kept separate from `offline-sync.ts` so the settings panel can subscribe
 * without importing the sync machinery (and everything it warms) into its
 * chunk.
 */

export interface OfflineSyncCounts {
  /** `/latest` pages fetched across both tabs. */
  feedPages: number;
  /** Unread document URIs enumerated (the list, not the bodies). */
  unreadListed: number;
  /** Publications whose pages were warmed. */
  publications: number;
  /** Publication back-catalog pages fetched beyond each one's first. */
  backCatalogPages: number;
  /** Followed authors whose pages were warmed. */
  authors: number;
  /** Lists (own + saved) whose pages were warmed. */
  lists: number;
  /** Article bodies queued for this pass, after ledger dedup. */
  bodiesQueued: number;
  /** Article bodies actually fetched this pass. */
  bodiesCached: number;
  /** Body images warmed this pass. */
  imagesWarmed: number;
}

export type OfflineSyncStopReason =
  /** The pass ran out of work. */
  | "completed"
  /** The connection dropped mid-pass. */
  | "offline"
  /** The storage-pressure guard ended the body walk. */
  | "storage"
  /** `stopOfflineSync()` — sign-out, toggle off, or the app going offline. */
  | "stopped"
  /** The pass threw; see `error`. */
  | "error"
  /** A gate said no before any work happened; see `error` for which. */
  | "not-eligible";

export interface OfflineSyncProgress {
  running: boolean;
  /** Full passes fan out to every followed surface; top-ups only re-walk feeds. */
  pass: "full" | "top-up" | null;
  /** Human-readable name of the stage currently running. */
  step: string | null;
  startedAt: number | null;
  finishedAt: number | null;
  stopReason: OfflineSyncStopReason | null;
  /** Which gate refused, or what threw — for the panel, not for code. */
  error: string | null;
  counts: OfflineSyncCounts;
}

const INITIAL_COUNTS: OfflineSyncCounts = {
  authors: 0,
  backCatalogPages: 0,
  bodiesCached: 0,
  bodiesQueued: 0,
  feedPages: 0,
  imagesWarmed: 0,
  lists: 0,
  publications: 0,
  unreadListed: 0,
};

const INITIAL: OfflineSyncProgress = {
  counts: INITIAL_COUNTS,
  error: null,
  finishedAt: null,
  pass: null,
  running: false,
  startedAt: null,
  step: null,
  stopReason: null,
};

let snapshot: OfflineSyncProgress = INITIAL;
const listeners = new Set<() => void>();

function emit(next: OfflineSyncProgress): void {
  snapshot = next;
  for (const listener of listeners) listener();
}

/** For `useSyncExternalStore`. The snapshot is replaced, never mutated. */
export function subscribeOfflineSyncProgress(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getOfflineSyncProgress(): OfflineSyncProgress {
  return snapshot;
}

/** SSR snapshot — progress is per-device state and the server has none. */
export function getOfflineSyncProgressServer(): OfflineSyncProgress {
  return INITIAL;
}

// ── Mutators, used only by offline-sync.ts ───────────────────────────────────

/**
 * Which pass currently owns the snapshot. A stopped pass takes a moment to
 * wind down, and a new one can begin inside that window — without the token,
 * the old pass's `progressEnd` would mark the new one finished.
 */
let currentPass = 0;

export function progressBegin(pass: "full" | "top-up"): number {
  currentPass += 1;
  emit({
    ...INITIAL,
    counts: { ...INITIAL_COUNTS },
    pass,
    running: true,
    startedAt: Date.now(),
  });
  return currentPass;
}

export function progressStep(step: string): void {
  if (!snapshot.running) return;
  emit({ ...snapshot, step });
}

export function progressCount(key: keyof OfflineSyncCounts, by = 1): void {
  if (!snapshot.running) return;
  emit({
    ...snapshot,
    counts: { ...snapshot.counts, [key]: snapshot.counts[key] + by },
  });
}

export function progressEnd(
  token: number,
  stopReason: OfflineSyncStopReason,
  error: string | null = null,
): void {
  if (token !== currentPass) return;
  emit({
    ...snapshot,
    error,
    finishedAt: Date.now(),
    running: false,
    step: null,
    stopReason,
  });
}

/** A gate refused before the pass started; record why so the panel can say. */
export function progressIneligible(reason: string): void {
  // Don't clobber a finished pass's summary with gate noise from the interval
  // re-firing — only record it when there is nothing better to show.
  if (snapshot.running || snapshot.startedAt !== null) return;
  emit({ ...snapshot, error: reason, stopReason: "not-eligible" });
}

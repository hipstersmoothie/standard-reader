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
  /** `/history` pages fetched. */
  historyPages: number;
  /** Partly-read articles found for the "Continue reading" shelf. */
  unfinishedListed: number;
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
  /**
   * `initial` is the first deep fill, which resumes across launches until it
   * finishes; `top-up` is the cheap pass that follows it forever after.
   */
  pass: "initial" | "top-up" | null;
  /** Whether the initial deep fill has ever finished. */
  initialComplete: boolean;
  /** Articles stored on the device right now. */
  stored: number;
  /** Articles discovered and still waiting to be stored. */
  pending: number;
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
  historyPages: 0,
  imagesWarmed: 0,
  lists: 0,
  publications: 0,
  unfinishedListed: 0,
  unreadListed: 0,
};

const INITIAL: OfflineSyncProgress = {
  counts: INITIAL_COUNTS,
  error: null,
  finishedAt: null,
  initialComplete: false,
  pass: null,
  pending: 0,
  running: false,
  startedAt: null,
  step: null,
  stored: 0,
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

export function progressBegin(pass: "initial" | "top-up"): number {
  currentPass += 1;
  emit({
    ...INITIAL,
    counts: { ...INITIAL_COUNTS },
    // Totals carry across passes: they describe the device, not this run, and
    // blanking them would flash "0 stored" every time a pass starts.
    initialComplete: snapshot.initialComplete,
    pass,
    pending: snapshot.pending,
    running: true,
    startedAt: Date.now(),
    stored: snapshot.stored,
  });
  return currentPass;
}

/**
 * The device totals. Published outside a running pass too, so the panel can
 * answer "what do I have?" on a cold open before anything has started.
 */
export function progressTotals(totals: {
  stored: number;
  pending: number;
  initialComplete: boolean;
}): void {
  emit({ ...snapshot, ...totals });
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

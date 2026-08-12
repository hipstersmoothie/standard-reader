/**
 * Sync state that outlives the app being closed.
 *
 * Everything here exists because an installed PWA is killed constantly — iOS
 * reclaims backgrounded web apps within seconds — and a pass that starts from
 * scratch each launch never gets past its first minute of work.
 *
 * The article ledger (`offline-cache.ts`) already makes *bodies* durable: a
 * document fetched last week is skipped this week. What it cannot express is
 * how far the walk got. Two things were lost on every restart, and together
 * they made the deep fill unreachable:
 *
 *   - **The walk position.** A top-up walk stops once it reaches pages it
 *     already has. After a restart the head of the feed is stored, so the walk
 *     stopped after two pages — never resuming the depth the killed session was
 *     working through. The backlog could only ever be as deep as the longest
 *     single uninterrupted session.
 *   - **The queue.** Documents discovered but not yet fetched were held in
 *     memory. If the app died between discovering them and storing them, they
 *     were simply forgotten until some later walk happened to see them again.
 *
 * So the plan is persisted, and a pass resumes it. The initial fill runs to
 * completion across as many launches as it takes; only once it has genuinely
 * finished does sync switch to cheap top-ups.
 */

const STATE_KEY = "sr:offline-sync-state";

/**
 * Cap on the persisted queue. At ~80 bytes per AT-URI this is a few hundred KB
 * — comfortable in a ~5 MB budget, and far past what the walk caps can produce.
 * Truncation drops the tail, which is the oldest and least wanted.
 */
const MAX_PENDING = 5000;

/** Re-warm the followed-surface fan-out about once a day. */
export const SURFACES_MAX_AGE_MS = 24 * 60 * 60 * 1000;

export type LatestFilterKey = "unread" | "subscriptions";

export interface OfflineSyncState {
  v: 1;
  /**
   * When the initial deep fill genuinely finished — every feed page walked and
   * every discovered body stored. `null` means it is still in progress, which
   * is what keeps the walk from taking its early exit.
   */
  initialCompletedAt: number | null;
  /** Body URIs discovered but not yet stored, in priority order. */
  pending: Array<string>;
  /** Where the deep walk got to, per feed tab. */
  feedOffsets: Record<LatestFilterKey, number>;
  /** Feed tabs whose walk has reached the end (or the page cap). */
  feedDone: Record<LatestFilterKey, boolean>;
  /** When the publications / authors / lists fan-out last completed. */
  surfacesWarmedAt: number | null;
}

const EMPTY: OfflineSyncState = {
  feedDone: { subscriptions: false, unread: false },
  feedOffsets: { subscriptions: 0, unread: 0 },
  initialCompletedAt: null,
  pending: [],
  surfacesWarmedAt: null,
  v: 1,
};

export function emptyOfflineSyncState(): OfflineSyncState {
  return {
    ...EMPTY,
    feedDone: { ...EMPTY.feedDone },
    feedOffsets: { ...EMPTY.feedOffsets },
    pending: [],
  };
}

export function readOfflineSyncState(): OfflineSyncState {
  if (globalThis.localStorage === undefined) return emptyOfflineSyncState();
  try {
    const raw = globalThis.localStorage.getItem(STATE_KEY);
    if (!raw) return emptyOfflineSyncState();
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return emptyOfflineSyncState();
    const state = parsed as Partial<OfflineSyncState>;
    // A shape from an older build is not worth migrating — starting the fill
    // over costs one deep walk, and the ledger still skips stored bodies.
    if (state.v !== 1) return emptyOfflineSyncState();
    return {
      feedDone: { ...EMPTY.feedDone, ...state.feedDone },
      feedOffsets: { ...EMPTY.feedOffsets, ...state.feedOffsets },
      initialCompletedAt: state.initialCompletedAt ?? null,
      pending: Array.isArray(state.pending) ? state.pending : [],
      surfacesWarmedAt: state.surfacesWarmedAt ?? null,
      v: 1,
    };
  } catch {
    return emptyOfflineSyncState();
  }
}

export function writeOfflineSyncState(state: OfflineSyncState): void {
  try {
    globalThis.localStorage?.setItem(
      STATE_KEY,
      JSON.stringify({
        ...state,
        pending: state.pending.slice(0, MAX_PENDING),
      }),
    );
  } catch {
    // Quota or private browsing. Sync still works, it just restarts its walk
    // on the next launch — the behaviour this module exists to avoid, but not
    // a reason to fail the pass.
  }
}

export function clearOfflineSyncState(): void {
  try {
    globalThis.localStorage?.removeItem(STATE_KEY);
  } catch {
    // Nothing to do — see `writeOfflineSyncState`.
  }
}

/** Whether the followed-surface fan-out is due again. */
export function surfacesAreStale(
  state: OfflineSyncState,
  now: number,
): boolean {
  return (
    state.surfacesWarmedAt === null ||
    now - state.surfacesWarmedAt > SURFACES_MAX_AGE_MS
  );
}

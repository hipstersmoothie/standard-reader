/**
 * Where a reader stopped in an article, and the rules for when that is worth
 * remembering.
 *
 * Two stores back this, and they answer different questions. The server
 * (`reading_progress`) is the one that follows a reader from phone to laptop.
 * `localStorage` is the one that can answer *before the first paint* — restoring
 * position has to happen in a layout effect, and a round trip to Neon is an
 * order of magnitude too slow for that, so the local copy drives the scroll and
 * the server copy corrects it if the reader's other device got further.
 *
 * The local copy is also what keeps this working in the installed PWA with no
 * network: the write is best-effort against the server, always durable locally.
 */

/**
 * Below this the reader has barely started — a glance at the top, a bounce.
 * Resuming there would scroll them roughly nowhere, and listing it under
 * "Continue reading" would fill the shelf with articles nobody started.
 */
export const READING_PROGRESS_MIN = 0.02;

/**
 * At or above this, treat the article as finished. The tail of an article is
 * footnotes and author bio, and holding someone at 97% forever means the shelf
 * never empties — which is the failure that makes people stop trusting it.
 */
export const READING_PROGRESS_DONE = 0.95;

/** Whether a stored position is worth restoring / listing. */
export function isResumableProgress(progress: number): boolean {
  return progress >= READING_PROGRESS_MIN && progress < READING_PROGRESS_DONE;
}

/** How much scrolling has to happen before another write is worth it. */
export const READING_PROGRESS_EPSILON = 0.01;

const STORAGE_KEY = "standard-reader:reading-progress";

/**
 * Cap on remembered articles. Position is only interesting for what a reader is
 * currently in the middle of, and an unbounded map in `localStorage` is a slow
 * leak in a store the whole app shares.
 */
const LOCAL_LIMIT = 100;

export interface LocalReadingProgress {
  progress: number;
  /** ISO timestamp, used to decide whether the server knows something newer. */
  updatedAt: string;
}

type LocalMap = Map<string, LocalReadingProgress>;

function readMap(): LocalMap {
  if (globalThis.localStorage === undefined) return new Map();
  try {
    const raw = globalThis.localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Map();
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return new Map();
    return new Map(
      Object.entries(parsed as Record<string, LocalReadingProgress>),
    );
  } catch {
    // Private browsing, disabled storage, or a value from an older shape.
    return new Map();
  }
}

function writeMap(map: LocalMap): void {
  if (globalThis.localStorage === undefined) return;
  try {
    globalThis.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(Object.fromEntries(map)),
    );
  } catch {
    // Quota or private browsing — position is a convenience, never a failure.
  }
}

/** The locally-remembered position for an article, if any. */
export function readLocalProgress(
  documentUri: string,
): LocalReadingProgress | null {
  const entry = readMap().get(documentUri);
  if (!entry || typeof entry.progress !== "number") return null;
  return entry;
}

/**
 * Remember (or forget) a position locally. Writing a finished / barely-started
 * value forgets it instead, so the local map holds exactly the articles that
 * would show under "Continue reading".
 */
export function writeLocalProgress(
  documentUri: string,
  progress: number,
  updatedAt: string = new Date().toISOString(),
): void {
  const map = readMap();

  if (isResumableProgress(progress)) {
    map.set(documentUri, { progress, updatedAt });
  } else if (!map.delete(documentUri)) {
    // Nothing stored and nothing worth storing — don't rewrite the store.
    return;
  }

  if (map.size > LOCAL_LIMIT) {
    const kept = [...map.entries()]
      .toSorted((a, b) => b[1].updatedAt.localeCompare(a[1].updatedAt))
      .slice(0, LOCAL_LIMIT);
    writeMap(new Map(kept));
    return;
  }

  writeMap(map);
}

/** Forget an article's position locally (finished, or reset to the top). */
export function clearLocalProgress(documentUri: string): void {
  const map = readMap();
  if (!map.delete(documentUri)) return;
  writeMap(map);
}

/**
 * Forget every position on this device. Pairs with clearing reading history:
 * the server rows go with it, and leaving the local copy behind would resurrect
 * positions the reader just asked us to drop.
 */
export function clearAllLocalProgress(): void {
  if (globalThis.localStorage === undefined) return;
  try {
    globalThis.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do — the store is unavailable, so nothing is stored.
  }
}

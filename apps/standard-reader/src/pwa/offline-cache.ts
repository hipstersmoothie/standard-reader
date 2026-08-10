/**
 * Storage primitives shared by offline sync, the settings panel, and sign-out.
 *
 * Two things live on the device once offline reading is on:
 *
 *   1. The service worker's Cache Storage buckets, named in `vite.config.ts`
 *      (`data` for `/_serverFn` responses, `images` for bodies' images, `pages`
 *      for boot documents). Workbox owns them; this module only deletes.
 *   2. A `localStorage` **ledger** of which documents have been pulled through.
 *      The `data` rule is NetworkFirst, so without a record of prior work every
 *      sync pass would re-download the reader's whole unread set from the
 *      network — the ledger is what makes the pass incremental.
 *
 * The ledger is not the source of truth for what is *actually* cached: Workbox
 * expiration can evict an entry behind our back. It is a "don't bother asking
 * again yet" record, which is why entries age out on their own
 * ({@link LEDGER_ENTRY_MAX_AGE_MS}) and get re-fetched.
 */

/** Cache Storage buckets holding reader-specific bytes (see `vite.config.ts`). */
const PERSONAL_CACHE_NAMES = ["data", "pages"] as const;

/** Cache Storage buckets that are merely expensive, not personal. */
const IMPERSONAL_CACHE_NAMES = ["images"] as const;

const LEDGER_KEY = "sr:offline-synced";

/**
 * Re-pull a document after a week even if the ledger says it is stored.
 *
 * Covers two drifts at once: Workbox may have evicted the entry, and the
 * article itself may have been edited since (`site.standard.document` records
 * are mutable).
 */
const LEDGER_ENTRY_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type Ledger = Record<string, number>;

function readLedger(): Ledger {
  if (globalThis.localStorage === undefined) return {};
  try {
    const raw = globalThis.localStorage.getItem(LEDGER_KEY);
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    return parsed as Ledger;
  } catch {
    return {};
  }
}

function writeLedger(ledger: Ledger): void {
  try {
    globalThis.localStorage?.setItem(LEDGER_KEY, JSON.stringify(ledger));
  } catch {
    // Quota or private browsing. Sync still works; it just re-checks documents
    // it already has, which the NetworkFirst rule makes cheap-ish when online
    // and irrelevant when offline.
  }
}

/** Document URIs pulled through recently enough to skip this pass. */
export function ledgerFreshUris(now: number): Set<string> {
  const ledger = readLedger();
  const fresh = new Set<string>();
  for (const [uri, storedAt] of Object.entries(ledger)) {
    if (now - storedAt < LEDGER_ENTRY_MAX_AGE_MS) fresh.add(uri);
  }
  return fresh;
}

/** Record that `uri` has been fetched into the `data` cache. */
export function ledgerRecord(uri: string, now: number): void {
  const ledger = readLedger();
  ledger[uri] = now;
  writeLedger(ledger);
}

/**
 * Drop ledger entries for documents that are no longer unread, so the file
 * doesn't grow without bound as a reader works through a backlog. Called with
 * the full unread set at the end of each completed pass.
 */
export function ledgerRetainOnly(uris: Set<string>): void {
  const ledger = readLedger();
  const next: Ledger = {};
  for (const [uri, storedAt] of Object.entries(ledger)) {
    if (uris.has(uri)) next[uri] = storedAt;
  }
  writeLedger(next);
}

export function ledgerClear(): void {
  try {
    globalThis.localStorage?.removeItem(LEDGER_KEY);
  } catch {
    // Nothing to do — see `writeLedger`.
  }
}

async function deleteCaches(names: ReadonlyArray<string>): Promise<void> {
  if (globalThis.caches === undefined) return;
  await Promise.all(
    names.map(async (name) => {
      try {
        await globalThis.caches.delete(name);
      } catch {
        // A cache that cannot be deleted is not worth failing sign-out over.
      }
    }),
  );
}

/**
 * Everything downloaded for offline reading. Used by the settings panel's
 * "Remove downloaded articles".
 */
export async function clearOfflineData(): Promise<void> {
  ledgerClear();
  await deleteCaches([...PERSONAL_CACHE_NAMES, ...IMPERSONAL_CACHE_NAMES]);
}

/**
 * Drop caches whose contents belong to the reader who is signing out.
 *
 * `/_serverFn` responses carry no DID in their URL — the server reads it from
 * the session cookie — so a second account signing in on the same device would
 * otherwise be served the first account's feed, saved queue, and read state
 * from cache. Same for `pages`, which holds rendered SSR documents.
 *
 * `images` is left alone deliberately: it is public CDN bytes, keyed by URL,
 * and re-downloading a shared cache of article images on every sign-out is a
 * real cost for no privacy gain.
 */
export async function clearPersonalOfflineData(): Promise<void> {
  ledgerClear();
  await deleteCaches(PERSONAL_CACHE_NAMES);
}

export interface OfflineStorageUsage {
  /** Bytes this origin is using, across all caches — not just ours. */
  usage: number;
  /** Bytes the browser is willing to grant, when it will say. */
  quota: number | null;
  /** Whether storage is exempt from eviction under pressure. */
  persisted: boolean;
}

/** Best-effort storage report for the settings panel. */
export async function offlineStorageUsage(): Promise<OfflineStorageUsage | null> {
  const storage = globalThis.navigator?.storage;
  if (!storage?.estimate) return null;
  try {
    const estimate = await storage.estimate();
    return {
      persisted: (await storage.persisted?.()) ?? false,
      quota: estimate.quota ?? null,
      usage: estimate.usage ?? 0,
    };
  } catch {
    return null;
  }
}

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

import { clearOfflineSyncState } from "./offline-sync-state";

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

/** How long one scan of the `data` cache is reused across rows and renders. */
const AVAILABILITY_MEMO_MS = 5000;
let availability: { at: number; uris: Promise<ReadonlySet<string>> } | null =
  null;

/**
 * AT-URIs as they appear inside a decoded request payload, where they are
 * ordinary JSON strings (`"s":"at://did:plc:…/site.standard.document/…"`) and
 * so run to the closing quote.
 *
 * Matches *any* AT-URI rather than trying to recognise document collections:
 * callers only ever ask whether one specific article's URI is present, so a
 * publication URI in the set is inert, while a document collection this pattern
 * failed to anticipate — `pub.leaflet.document`, a future renderer's NSID —
 * would wrongly dim a row that works.
 */
const AT_URI_PATTERN = /at:\/\/[^"\\]+/g;

/**
 * Which documents can actually be opened with no connection.
 *
 * Read from the `data` cache itself, not from the sync ledger. The ledger
 * records what *sync* stored, which is a much smaller set than what is cached —
 * an article opened by hand, or one seeded by browsing, is in the cache and not
 * in the ledger. Trusting the ledger meant a reader whose sync had not run
 * (signed out, toggle off, or simply not finished) saw every row dimmed while
 * every one of them opened fine.
 *
 * A GET server function serialises its arguments into its URL, so an article
 * whose body is cached has its AT-URI sitting in plain text in that request's
 * query string. Scanning the cache keys for document URIs therefore answers the
 * real question — "is this one stored?" — rather than a proxy for it.
 *
 * Includes the ledger as well, for the window where sync has recorded a
 * document whose response has not been written back yet.
 */
export async function offlineAvailableUris(): Promise<ReadonlySet<string>> {
  const now = Date.now();
  if (!availability || now - availability.at > AVAILABILITY_MEMO_MS) {
    availability = { at: now, uris: scanAvailableUris(now) };
  }
  return availability.uris;
}

async function scanAvailableUris(now: number): Promise<ReadonlySet<string>> {
  const uris = ledgerFreshUris(now);
  if (globalThis.caches === undefined) return uris;
  try {
    const cache = await globalThis.caches.open("data");
    for (const request of await cache.keys()) {
      const query = decodeURIComponent(new URL(request.url).search);
      for (const match of query.matchAll(AT_URI_PATTERN)) {
        uris.add(match[0]);
      }
    }
  } catch {
    // Cache Storage unavailable (private browsing). Fall back to the ledger.
  }
  return uris;
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
  // The plan too, or the next pass would resume a walk whose results have just
  // been deleted — and report the initial fill as long since complete.
  clearOfflineSyncState();
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
  // The plan describes the signed-out reader's backlog; the next account must
  // start its own fill rather than resume theirs.
  clearOfflineSyncState();
  await deleteCaches(PERSONAL_CACHE_NAMES);
}

/** Entries held in each Workbox bucket, or `null` where the bucket is absent. */
export interface OfflineCacheCounts {
  /** `/_serverFn` responses — feeds, article bodies, publication pages. */
  data: number | null;
  /** Article and avatar images. */
  images: number | null;
  /** Rendered documents, which is what a cold offline launch boots from. */
  pages: number | null;
  /** Hashed JS/CSS, including the code-split route chunks. */
  assets: number | null;
}

/**
 * How much is on the device, counted from Cache Storage itself.
 *
 * The per-pass counters answer "what did the last run do", which is zero for
 * every category once a reader is fully synced — a top-up that finds nothing
 * new is a success that looks identical to sync never having worked. These
 * numbers answer "what do I have", so they stay meaningful when there is
 * nothing left to fetch.
 */
export async function offlineCacheCounts(): Promise<OfflineCacheCounts> {
  const empty: OfflineCacheCounts = {
    assets: null,
    data: null,
    images: null,
    pages: null,
  };
  if (globalThis.caches === undefined) return empty;

  const names = ["data", "images", "pages", "assets"] as const;
  const counted = await Promise.all(
    names.map(async (name) => {
      try {
        if (!(await globalThis.caches.has(name))) return null;
        const cache = await globalThis.caches.open(name);
        const keys = await cache.keys();
        return keys.length;
      } catch {
        return null;
      }
    }),
  );

  return {
    assets: counted[3] ?? null,
    data: counted[0] ?? null,
    images: counted[1] ?? null,
    pages: counted[2] ?? null,
  };
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

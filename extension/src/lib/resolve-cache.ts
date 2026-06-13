import type { ExtensionResolveResult } from "./types";

import { fetchResolve, fetchResolveBatch } from "./api";
import { clearTabSnapshots } from "./popup-state";

const CACHE_KEY = "resolveCache";
const TTL_MS = 5 * 60 * 1000;

type CacheEntry = {
  result: ExtensionResolveResult;
  expiresAt: number;
};

type CacheStore = Record<string, CacheEntry>;

async function readCache(): Promise<CacheStore> {
  const stored = await browser.storage.session.get(CACHE_KEY);
  return (stored[CACHE_KEY] as CacheStore | undefined) ?? {};
}

async function writeCache(cache: CacheStore): Promise<void> {
  await browser.storage.session.set({ [CACHE_KEY]: cache });
}

export async function getCachedResolve(
  url: string,
): Promise<ExtensionResolveResult | null> {
  const cache = await readCache();
  const entry = cache[url];
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    const { [url]: _removed, ...rest } = cache;
    void _removed;
    await writeCache(rest);
    return null;
  }
  return entry.result;
}

export async function resolveWithCache(
  url: string,
  hints?: { documentUri?: string | null; publicationUri?: string | null },
  options?: { force?: boolean },
): Promise<ExtensionResolveResult> {
  if (!options?.force) {
    const cached = await getCachedResolve(url);
    if (cached && cached.kind !== "unknown") return cached;
  }

  try {
    const result = await fetchResolve(url, hints);
    const cache = await readCache();
    cache[url] = { result, expiresAt: Date.now() + TTL_MS };
    await writeCache(cache);
    return result;
  } catch {
    // API unreachable (dev server down, wrong origin) — treat as unindexed.
    return { kind: "unknown" };
  }
}

export async function resolveBatchWithCache(
  urls: Array<string>,
): Promise<Record<string, ExtensionResolveResult>> {
  const cache = await readCache();
  const now = Date.now();
  const results: Record<string, ExtensionResolveResult> = {};
  const missing: Array<string> = [];

  for (const url of urls) {
    const entry = cache[url];
    if (entry && entry.expiresAt > now) {
      results[url] = entry.result;
    } else {
      missing.push(url);
    }
  }

  if (missing.length > 0) {
    try {
      for (const batch of chunkUrls(missing)) {
        const fetched = await fetchResolveBatch(batch);
        for (const [url, result] of Object.entries(fetched)) {
          results[url] = result;
          cache[url] = { result, expiresAt: now + TTL_MS };
        }
      }
      await writeCache(cache);
    } catch {
      for (const url of missing) {
        results[url] = { kind: "unknown" };
      }
    }
  }

  return results;
}

const BATCH_MAX = 20;

function chunkUrls(urls: Array<string>): Array<Array<string>> {
  const batches: Array<Array<string>> = [];
  for (let index = 0; index < urls.length; index += BATCH_MAX) {
    batches.push(urls.slice(index, index + BATCH_MAX));
  }
  return batches;
}

export async function clearResolveCache(): Promise<void> {
  await clearTabSnapshots();
  await browser.storage.session.remove(CACHE_KEY);
}

export async function invalidateResolveCache(url: string): Promise<void> {
  const cache = await readCache();
  const { [url]: _removed, ...rest } = cache;
  void _removed;
  await writeCache(rest);
}

export async function patchResolveCacheBookmark(
  url: string,
  isBookmarked: boolean,
): Promise<void> {
  const cache = await readCache();
  const entry = cache[url];
  if (!entry || entry.expiresAt <= Date.now()) return;
  if (entry.result.kind !== "article") return;

  cache[url] = {
    ...entry,
    result: {
      ...entry.result,
      isBookmarked,
    },
  };
  await writeCache(cache);
}

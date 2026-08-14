/**
 * Pre-downloads the reader's unread articles so the installed app works with no
 * connection.
 *
 * The service worker caches `/_serverFn` GETs (`vite.config.ts`), which makes
 * *revisiting* things work offline. That is not enough on its own: the point of
 * an installed reader is opening it on a plane and finding the backlog already
 * there. So this walks the unread set and pulls each body through the network
 * once, on purpose, while there is still a connection.
 *
 * Two details make it work rather than merely look like it works:
 *
 *   - Bodies are fetched by calling **the same `getArticle` server function the
 *     article route's loader calls**, so the response lands in the `data` cache
 *     under the exact URL that loader will later ask for. Anything cleverer
 *     (a bespoke bulk endpoint, a hand-built URL) caches under a key nothing
 *     reads back.
 *   - Images are warmed with real `Image` elements, not `fetch`. The Workbox
 *     rule matches on `request.destination === "image"`, which a `fetch()` does
 *     not set — warming that way would download every image and cache none.
 *
 * Results are deliberately **not** written into the React Query cache: several
 * hundred article bodies held in memory is a real cost, and the service worker
 * is where they need to be anyway.
 */

import type { AnyRouter } from "@tanstack/react-router";

import {
  AUTHOR_ACTIVITY_PAGE_SIZE,
  authorApi,
} from "#/integrations/tanstack-query/api-author.functions";
import {
  feedApi,
  latestFeedPageSize,
} from "#/integrations/tanstack-query/api-feed.functions";
import { listApi } from "#/integrations/tanstack-query/api-lists.functions";
import { notesApi } from "#/integrations/tanstack-query/api-notes.functions";
import { publicationApi } from "#/integrations/tanstack-query/api-publication.functions";
import {
  READER_QUEUE_PAGE_SIZE,
  readerApi,
  UNFINISHED_SHELF_SIZE,
} from "#/integrations/tanstack-query/api-reader.functions";
import { user } from "#/integrations/tanstack-query/api-user.functions";
import { documentImages } from "#/lib/document/images";
// Never `navigator.onLine` directly: browsers that misreport the flag (Android
// WebView without `ACCESS_NETWORK_STATE`) would otherwise refuse to sync
// forever on a perfectly good connection — the one place that lie costs a
// reader their whole offline library rather than a bit of chrome.
import { isOffline, subscribeToOnlineStatus } from "#/lib/online-status";
import { parseAtUri } from "#/server/atproto/uri";
import { listRefFromUri } from "#/server/reader/saved-lists";

import {
  ledgerFreshUris,
  ledgerRecord,
  ledgerRetainOnly,
  offlineStorageUsage,
} from "./offline-cache";
import {
  progressBegin,
  progressCount,
  progressEnd,
  progressIneligible,
  progressStep,
  progressTotals,
} from "./offline-sync-progress";
import type { LatestFilterKey, OfflineSyncState } from "./offline-sync-state";
import {
  readOfflineSyncState,
  surfacesAreStale,
  writeOfflineSyncState,
} from "./offline-sync-state";
import { isStandalone } from "./standalone";

/**
 * Whether to keep unread articles on this device. Device-scoped rather than a
 * synced account preference: it is a statement about *this* phone's storage and
 * data plan, not about the reader.
 */
export const OFFLINE_READING_STORAGE_KEY = "sr:offline-reading";

/** Bodies in flight at once. Enough to hide the round trip, few enough to stay
 * out of the way of whatever the reader is actually doing. */
const BODY_CONCURRENCY = 5;

/** Images in flight at once, across all articles. */
const IMAGE_CONCURRENCY = 4;

/** Give up on an image rather than hold a slot forever on a dead CDN URL. */
const IMAGE_TIMEOUT_MS = 15_000;

/**
 * Stop syncing once the origin is using this share of its quota.
 *
 * The unread set is uncapped by design, but the browser's patience is not: past
 * roughly this point browsers start evicting the whole origin under pressure,
 * which would take the already-downloaded backlog with it. Stopping early keeps
 * what is already stored — and since the walk is newest-first, what is kept is
 * the most recent unread.
 */
const STORAGE_PRESSURE_LIMIT = 0.8;

/** Re-check the storage estimate every N documents rather than per document. */
const STORAGE_CHECK_INTERVAL = 25;

/**
 * How deep to walk each `/latest` tab.
 *
 * Pages use the route's own size, so every page fetched is one the list asks
 * for verbatim when the reader scrolls. Unlike the unread set this has no
 * natural end — a reader with 200 subscriptions has an effectively infinite
 * history — but the real limit is meant to be the storage guard on bodies, not
 * this. 150 pages is ~3,000 rows per tab; deep enough that scrolling back
 * rarely runs out, and bounded so a bug can't walk forever.
 */
const LATEST_WARM_MAX_PAGES = 150;

/**
 * Always re-walk at least this many pages, even when nothing on them is new.
 * The head of the list is what a reader sees first, so it stays fresh.
 */
const MIN_LATEST_WARM_PAGES = 2;

/** Wait for the first paint and its data before competing for bandwidth. */
const INITIAL_SYNC_DELAY_MS = 5000;

/**
 * How often to top up while the app stays open. Frequent enough to pick up new
 * posts during a session, and affordable because a caught-up pass is a couple
 * of feed requests (see `warmLatestPages`).
 */
const RESYNC_INTERVAL_MS = 5 * 60_000;

/**
 * How many subscribed publications and followed authors to store pages for.
 *
 * A bound on request count, not storage — these pages are small next to article
 * bodies. Set well past what most readers follow so the cap is a backstop
 * rather than something people actually hit; the fan-out is timestamped on disk
 * and repeats about daily, so it isn't paid on every launch.
 */
const MAX_WARMED_PUBLICATIONS = 250;

/**
 * Must match `/p/$did/$rkey`'s loader. These values reach the server, so a
 * drift here is not a type error — it is a cache entry stored under a URL the
 * publication page never requests, and an offline page that silently fails.
 */
const PUBLICATION_RECENT_LIMIT = 12;
const PUBLICATION_RECENT_FILTER = "all";

/** Must match the publication page's "load more" (`PUBLICATION_PAGE_SIZE`). */
const PUBLICATION_PAGE_SIZE = 20;

/**
 * Back-catalog pages fetched per followed publication, beyond its first.
 * Three pages of 20 plus the first 12 keeps ~72 posts per publication
 * scrollable offline; bodies beyond the feed walk queue behind everything
 * newer, so the storage guard — not this — decides how many actually land.
 */
const PUBLICATION_BACK_CATALOG_PAGES = 3;

/** Must match `/u/$did`'s loader (`AUTHOR_PAGE_SIZE`), same caveat as above. */
const AUTHOR_PAGE_SIZE = 24;

/** Must match `/l/$did/$rkey`'s loader (`PAGE_SIZE`), same caveat as above. */
const LIST_PAGE_SIZE = 20;

/**
 * How deep to walk the reader's own queues (`/history`, `/recommended`).
 *
 * Five pages is 100 rows — far enough back that the offline list scrolls like
 * the online one for anything recent, and cheap enough (five requests) to redo
 * on every pass. It has to be every pass: the head of these lists moves every
 * time the reader opens or recommends an article, so unlike the
 * followed-publication fan-out they can't hide behind the daily surface
 * timestamp.
 */
const READER_QUEUE_WARM_MAX_PAGES = 5;

let running = false;
let controller: AbortController | null = null;

export function isOfflineReadingEnabled(): boolean {
  if (globalThis.localStorage === undefined) return true;
  try {
    // Default on: absent key means the reader has never expressed a preference.
    return globalThis.localStorage.getItem(OFFLINE_READING_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/** True when the reader has asked the OS to conserve data. */
function saveDataRequested(): boolean {
  const connection = (
    globalThis.navigator as Navigator & {
      connection?: { saveData?: boolean };
    }
  ).connection;
  return connection?.saveData === true;
}

function whenIdle(signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve();
      return;
    }
    const idle = (
      globalThis as typeof globalThis & {
        requestIdleCallback?: (
          cb: () => void,
          opts?: { timeout: number },
        ) => void;
      }
    ).requestIdleCallback;
    if (idle) {
      idle(() => resolve(), { timeout: 2000 });
    } else {
      globalThis.setTimeout(resolve, 200);
    }
  });
}

/**
 * Run `worker` over `items` with at most `limit` in flight. Rejections are
 * swallowed per item — one unreachable document must not end the pass.
 */
async function pool<T>(
  items: Array<T>,
  limit: number,
  signal: AbortSignal,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const runners = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (index < items.length && !signal.aborted) {
        const item = items[index++];
        if (item === undefined) return;
        try {
          await worker(item);
        } catch {
          // Skip and continue — see the doc comment.
        }
      }
    },
  );
  await Promise.all(runners);
}

/**
 * Fetch an image the way the article view will, so it lands under the same
 * cache key. Resolves on success *and* failure — a broken image is not an error
 * worth propagating.
 */
function warmImage(url: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted || globalThis.Image === undefined) {
      resolve();
      return;
    }
    const image = new globalThis.Image();
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      globalThis.clearTimeout(timer);
      image.src = "";
      resolve();
    };
    const timer = globalThis.setTimeout(done, IMAGE_TIMEOUT_MS);
    image.addEventListener("load", done);
    image.addEventListener("error", done);
    image.src = url;
  });
}

/** True when the origin is close enough to its quota that we should stop. */
async function underStoragePressure(): Promise<boolean> {
  const usage = await offlineStorageUsage();
  if (!usage?.quota) return false;
  return usage.usage / usage.quota > STORAGE_PRESSURE_LIMIT;
}

/**
 * Keep a document available for an offline cold start.
 *
 * An installed app is launched by icon, so the very first request after going
 * offline is a navigation to `start_url`. That is served by the `pages`
 * NetworkFirst rule, which only ever fills from real navigations — and inside
 * the app every navigation is client-side, so it would otherwise only hold
 * whatever document happened to boot the session. A plain `fetch("/")` cannot
 * fill it either (no `navigate` request mode), hence the explicit put.
 */
async function warmShell(signal: AbortSignal): Promise<void> {
  if (globalThis.caches === undefined) return;
  try {
    const response = await fetch("/", {
      credentials: "include",
      signal,
    });
    if (!response.ok) return;
    const cache = await globalThis.caches.open("pages");
    await cache.put("/", response);
  } catch {
    // Offline mid-pass, or Cache Storage unavailable (private browsing).
  }
}

/** Pull one article body — and its images — into the service worker caches. */
async function syncDocument(
  documentUri: string,
  signal: AbortSignal,
): Promise<void> {
  const article = await publicationApi.getArticle({ data: { documentUri } });
  if (!article || signal.aborted) return;

  const images = documentImages(article);
  if (images.length > 0) {
    await pool(
      images.map((image) => image.url),
      IMAGE_CONCURRENCY,
      signal,
      (url) => warmImage(url, signal),
    );
    progressCount("imagesWarmed", images.length);
  }

  ledgerRecord(documentUri, Date.now());
  progressCount("bodiesCached");
}

/**
 * Warm the article route's JS chunk.
 *
 * Hashed chunks are runtime-cached, not precached (`vite.config.ts`), so a
 * reader who installs the app and syncs a backlog without opening anything
 * would have every body on device and no code to render them with. Preloading
 * one article route pulls the chunk into the `assets` cache; it also runs that
 * route's loader, which is work we wanted done anyway.
 */
async function warmArticleRoute(
  router: AnyRouter,
  documentUri: string,
  to: "/a/$did/$rkey" | "/collection/$did/$rkey" = "/a/$did/$rkey",
): Promise<void> {
  const parsed = parseAtUri(documentUri);
  if (!parsed) return;
  await preloadRouteChunk(router, to, {
    did: parsed.did,
    rkey: parsed.rkey,
  });
}

/**
 * The routes that must work with no connection, warmed by running their real
 * loaders.
 *
 * This is the fix for pages that flashed their content and then dropped to the
 * offline state. A route loader `await`s `ensureQueryData`, which **rejects**
 * when a query has no cached data and the fetch fails — and one rejection in a
 * `Promise.all` throws the whole loader into the error component, even when the
 * article or feed it was really after is sitting in the cache. Caching bodies
 * alone was never enough; what a loader awaits includes preferences, shell
 * bootstrap, tab counts, and rail data.
 *
 * Preloading runs exactly those loaders, so whatever each one awaits is cached
 * under exactly the URL it will ask for. Guessing that list by hand would go
 * stale the first time a loader changed.
 */
const OFFLINE_ROUTES = [
  "/",
  "/latest",
  "/saved",
  "/subscriptions",
  "/history",
  "/recommended",
] as const;

async function warmRouteChunks(
  router: AnyRouter,
  signal: AbortSignal,
): Promise<void> {
  for (const to of OFFLINE_ROUTES) {
    if (signal.aborted || isOffline()) return;
    try {
      await router.preloadRoute({ to });
    } catch {
      // Signed-out readers have no /saved, /subscriptions or /history, and the
      // redirect to /login throws here. Not a reason to stop warming the rest.
    }
  }
}

/**
 * Pull one parameterised route's JS into the `assets` cache.
 *
 * Every route is code-split, and a chunk is fetched only when someone visits
 * that route — measuring the cache after a visit to `/` finds exactly one
 * route chunk in it. Caching a page's *data* without its code produces the
 * worst kind of failure: the loader has everything it needs and the thing that
 * renders it 404s. Any surface reachable offline needs both, so it goes through
 * here.
 *
 * One representative page per route is enough; the chunk is shared by all of
 * them.
 */
async function preloadRouteChunk(
  router: AnyRouter,
  to: string,
  params: Record<string, string>,
): Promise<void> {
  try {
    await router.preloadRoute({ params, to });
  } catch {
    // Preload runs the loader's prefetch branch and can reject or redirect.
    // The chunk load is the point and has already happened.
  }
}

/**
 * Fetch the server functions the offline routes' loaders await, by calling them
 * exactly as those loaders do.
 *
 * Explicit rather than inferred. `preloadRoute` cannot be trusted to cache
 * anything (see {@link warmRouteChunks}), so the surfaces that must survive
 * offline are named here; each call's response lands in the `data` cache under
 * the URL its loader will later ask for.
 */
async function warmFeedData(signal: AbortSignal): Promise<void> {
  // These argument objects are cache keys, not just arguments: a GET server
  // function serialises them into its URL, so an extra or missing property
  // caches under a URL nothing ever requests. Each call below mirrors the
  // shape its loader/queryFn sends, key for key.
  const warmers: Array<() => Promise<unknown>> = [
    // `_layout.index.tsx`: `getHomePage({ data: { scope: deps.scope } })`,
    // with `deps.scope` undefined for a plain `/`.
    () => feedApi.getHomePage({ data: { scope: undefined } }),
    () => feedApi.getSidebar(),
    () => feedApi.getLatestFeedCounts(),
  ];

  for (const warm of warmers) {
    if (signal.aborted || isOffline()) return;
    try {
      await warm();
    } catch {
      // Signed out, or a surface this reader does not have. Keep going.
    }
  }
}

/**
 * Cache `/history` — the reading list and the "Continue reading" shelf above
 * it.
 *
 * Both halves are warmed by calling the same server functions the route's
 * loader calls, in the exact argument shape its query options send, so each
 * response lands in the `data` cache under the URL that loader will ask for.
 *
 * The shelf gets special treatment on bodies. Everything else offline sync
 * stores is *unread* — but a half-read article is by definition already marked
 * read, so it appears in no unread walk and its body would be the one thing
 * missing from the surface built to send readers back to it. Six URIs is a
 * rounding error against the backlog, and they are queued here, ahead of it,
 * because "what I was in the middle of" outranks "what I have not started".
 *
 * The history rows themselves are deliberately **not** queued: those bodies
 * are already-read articles, they are unbounded, and the storage budget is
 * meant for the backlog. A row whose body isn't on device dims itself, which
 * is the honest answer.
 */
async function warmReadingHistory(
  signal: AbortSignal,
  enqueueBody: (documentUri: string) => void,
): Promise<void> {
  try {
    // `getUnfinishedReadingQueryOptions()` with its default limit.
    const unfinished = await readerApi.getUnfinishedReading({
      data: { limit: UNFINISHED_SHELF_SIZE },
    });
    for (const item of unfinished) enqueueBody(item.documentUri);
    progressCount("unfinishedListed", unfinished.length);
  } catch {
    // Signed out, or the reader has reading history turned off. The list walk
    // below is worth attempting either way.
  }

  // Mirrors `getReadingHistoryInfiniteQueryOptions()`' queryFn: the first page
  // is `offset: 0` and every "load more" after it uses the previous page's
  // `nextOffset` at the same limit.
  await warmQueuePages(signal, "historyPages", (offset) =>
    readerApi.getReadingHistory({
      data: { limit: READER_QUEUE_PAGE_SIZE, offset },
    }),
  );
}

/**
 * Cache `/recommended` — the articles the reader has liked.
 *
 * A liked article is one the reader already thought worth keeping hold of, and
 * this page is how they find it again; it is a bad one to lose on a plane.
 * Bodies are left alone for the same reason as reading history: a like almost
 * always follows a read, so these are already-read articles competing with a
 * backlog that isn't read yet. Rows without a stored body dim.
 */
async function warmLikes(signal: AbortSignal): Promise<void> {
  // `getLikesInfiniteQueryOptions()`' queryFn, page for page.
  await warmQueuePages(signal, "likesPages", (offset) =>
    readerApi.getLikes({ data: { limit: READER_QUEUE_PAGE_SIZE, offset } }),
  );
}

/**
 * Walk one of the reader's own paginated queues, stopping at the end of the
 * list or {@link READER_QUEUE_WARM_MAX_PAGES}, whichever comes first.
 *
 * The pages are the cache entries: each `offset` is its own URL, so the only
 * way "load more" works offline is to have requested that exact page online
 * first.
 */
async function warmQueuePages(
  signal: AbortSignal,
  counter: "historyPages" | "likesPages",
  fetchPage: (offset: number) => Promise<{ nextOffset: number | null }>,
): Promise<void> {
  let offset = 0;
  for (let page = 0; page < READER_QUEUE_WARM_MAX_PAGES; page += 1) {
    if (signal.aborted || isOffline()) return;
    let result: { nextOffset: number | null };
    try {
      result = await fetchPage(offset);
    } catch {
      // Signed out, or the surface is empty for this reader.
      return;
    }
    progressCount(counter);
    if (result.nextOffset == null) return;
    offset = result.nextOffset;
    await whenIdle(signal);
  }
}

/**
 * Cache the reader's own profile page.
 *
 * {@link warmFollowedUsers} covers everyone the reader follows and misses the
 * one profile reachable from every screen — the avatar menu's "View profile"
 * — because nobody follows themselves. It also warms the `/u/$did` chunk for a
 * reader who follows no one at all, which that pass skips.
 *
 * The `$did` used here is the one the menu links to (`did ?? handle`), because
 * a profile requested by handle is a different cache entry from the same
 * profile requested by DID.
 */
async function warmOwnProfile(
  router: AnyRouter,
  signal: AbortSignal,
): Promise<void> {
  let profileRef: string | null = null;
  try {
    const session = await user.getSession();
    profileRef = session?.user.did ?? session?.user.handle ?? null;
  } catch {
    return;
  }
  if (!profileRef || signal.aborted || isOffline()) return;

  await preloadRouteChunk(router, "/u/$did", { did: profileRef });
  try {
    // Same call `warmFollowedUsers` makes, and the same one
    // `getAuthorProfileQueryOptions(did, { limit: AUTHOR_PAGE_SIZE })` sends
    // from `/u/$did`'s loader.
    await authorApi.getAuthorProfile({
      data: {
        did: profileRef,
        limit: AUTHOR_PAGE_SIZE,
        offset: 0,
        activityLimit: AUTHOR_ACTIVITY_PAGE_SIZE,
      },
    });
    progressCount("ownProfile");
  } catch {
    // Signed out, or a profile the appview can't resolve right now.
  }
}

/**
 * Page through `/latest` so scrolling works offline, not just the first screen.
 *
 * Warming offset 0 alone cached one screenful: the list looked short offline
 * and "load more" had nothing behind it. Each page is a separate cache entry
 * under its own `offset`, so they have to be walked the way the reader would
 * walk them.
 *
 * Returns the article URIs seen, which is the same set the body pass wants —
 * these pages *are* the subscriptions backlog, so walking them twice at two
 * different page sizes would double the requests and cache a second copy of
 * every row under URLs the UI never asks for.
 */
async function warmLatestPages(
  filter: LatestFilterKey,
  signal: AbortSignal,
  known: ReadonlySet<string>,
  state: OfflineSyncState,
  onCollection?: (documentUri: string) => void,
): Promise<Array<string>> {
  const limit = latestFeedPageSize(filter);
  const uris: Array<string> = [];
  const filling = state.initialCompletedAt === null;
  // The initial fill resumes where the last launch was interrupted; a top-up
  // always re-reads the head, which is where new posts appear.
  let offset = filling ? state.feedOffsets[filter] : 0;
  let settledPages = 0;

  if (filling && state.feedDone[filter]) return uris;

  for (let page = 0; page < LATEST_WARM_MAX_PAGES; page += 1) {
    if (signal.aborted || isOffline()) break;
    let feed: Awaited<ReturnType<typeof feedApi.getLatestFeed>>;
    try {
      // Mirrors both the loader and the route's own load-more call.
      feed = await feedApi.getLatestFeed({ data: { filter, limit, offset } });
    } catch {
      break;
    }
    progressCount("feedPages");

    let fresh = 0;
    for (const item of feed.items) {
      uris.push(item.uri);
      if (!known.has(item.uri)) fresh += 1;
      // A collection article redirects `/a/…` → `/collection/…` for readers who
      // open collections as magazines, so that route is reachable offline even
      // though its nav entry is hidden — and it needs its own chunk.
      if (item.isCollection) onCollection?.(item.uri);
    }

    if (feed.nextOffset == null) {
      if (filling) {
        state.feedDone[filter] = true;
        writeOfflineSyncState(state);
      }
      break;
    }
    offset = feed.nextOffset;

    if (filling) {
      // Record the resume point *before* the next request, so a kill mid-flight
      // costs one page rather than the whole walk.
      state.feedOffsets[filter] = offset;
      writeOfflineSyncState(state);
    } else {
      // Top-up only: stop once the walk reaches depth it already has, which is
      // what makes running every few minutes affordable. Two consecutive
      // settled pages rather than one, so a single page of re-reads doesn't end
      // it early. This exit must never apply during the initial fill — after a
      // restart the head is always familiar, so it would stop the walk two
      // pages in and the backlog could never get deeper than one uninterrupted
      // session managed.
      settledPages = fresh === 0 ? settledPages + 1 : 0;
      if (page >= MIN_LATEST_WARM_PAGES && settledPages >= 2) break;
    }

    // Reaching the page cap counts as done, not as interrupted: the cap *is*
    // the intended depth, and without this a reader whose history outruns it
    // would never see the initial fill complete.
    if (filling && page === LATEST_WARM_MAX_PAGES - 1) {
      state.feedDone[filter] = true;
      writeOfflineSyncState(state);
    }

    await whenIdle(signal);
  }

  return uris;
}

/**
 * Cache the reader's subscribed publications.
 *
 * Opening a publication from the sidebar or a byline is an obvious thing to do
 * offline and it failed outright — nothing had ever requested `getPublication`
 * for it, so there was nothing to serve. Subscriptions are a bounded set the
 * reader chose, which makes them worth fetching up front.
 */
async function warmPublications(
  router: AnyRouter,
  signal: AbortSignal,
  enqueueBody: (documentUri: string) => void,
): Promise<void> {
  let following: Array<{ uri: string }>;
  try {
    const sidebar = await feedApi.getSidebar();
    following = sidebar.following;
  } catch {
    return;
  }

  const first = following[0] ? parseAtUri(following[0].uri) : null;
  if (first) {
    await preloadRouteChunk(router, "/p/$did/$rkey", {
      did: first.did,
      rkey: first.rkey,
    });
  }

  await pool(
    following.slice(0, MAX_WARMED_PUBLICATIONS).map((pub) => pub.uri),
    BODY_CONCURRENCY,
    signal,
    async (publicationUri) => {
      // Exactly what `/p/$did/$rkey`'s loader awaits, with the argument values
      // its query options default to. `readerScope` is not passed: it varies
      // the React Query key only, never the request the server sees.
      const [, firstDocs] = await Promise.all([
        publicationApi.getPublicationHeader({ data: { publicationUri } }),
        publicationApi.getPublicationDocuments({
          // Key order matters as much as the values: the payload is serialised
          // into the URL in insertion order, so this must mirror
          // `getPublicationDocumentsQueryOptions`' queryFn exactly.
          data: {
            publicationUri,
            limit: PUBLICATION_RECENT_LIMIT,
            offset: 0,
            filter: PUBLICATION_RECENT_FILTER,
          },
        }),
        notesApi.getPublicationLatestNote({ data: { publicationUri } }),
        publicationApi
          .getPublicationSocialProof({ data: { publicationUri } })
          // Signed-out readers never request this, so a failure is expected.
          .catch(() => null),
      ]);
      progressCount("publications");

      // The back catalog: the pages behind the publication's "load more",
      // requested in the exact shape that button sends (`PUBLICATION_PAGE_SIZE`
      // from the first page's `nextOffset`, not another 12-row page). The
      // bodies are queued rather than fetched here — a back-catalog article is
      // the lowest-priority body there is, and the queue keeps it behind
      // everything the reader is more likely to open.
      for (const item of firstDocs.items) enqueueBody(item.uri);
      let nextOffset = firstDocs.nextOffset;
      for (
        let page = 0;
        page < PUBLICATION_BACK_CATALOG_PAGES && nextOffset != null;
        page += 1
      ) {
        if (signal.aborted || isOffline()) return;
        const docs = await publicationApi.getPublicationDocuments({
          data: {
            publicationUri,
            limit: PUBLICATION_PAGE_SIZE,
            offset: nextOffset,
            filter: PUBLICATION_RECENT_FILTER,
          },
        });
        progressCount("backCatalogPages");
        for (const item of docs.items) enqueueBody(item.uri);
        nextOffset = docs.nextOffset;
      }
    },
  );
}

/**
 * Every family/weight the interface can ask for, as `document.fonts.load`
 * shorthand. Mirrors the Google Fonts request in `__root.tsx`.
 */
const UI_FONT_FACES = [
  ...[300, 400, 500, 600].flatMap((weight) => [
    `${weight} 1rem 'Newsreader'`,
    `italic ${weight} 1rem 'Newsreader'`,
  ]),
  ...[400, 500, 600, 700, 800, 900].map(
    (weight) => `${weight} 1rem 'Atkinson Hyperlegible Next'`,
  ),
  ...[400, 500, 600].map((weight) => `${weight} 1rem 'Spline Sans Mono'`),
];

/**
 * Pull down every weight of the interface fonts, not just the ones already on
 * screen.
 *
 * A browser downloads only the faces it actually uses, so a weight that first
 * appears in a surface the reader hasn't opened — a sheet, a dialog — is never
 * fetched and never cached. Offline it then has nothing to load, and because
 * the stylesheet is requested with `display=optional`, the browser silently
 * keeps the fallback for the rest of the page rather than swapping when it
 * eventually arrives. The result is one panel in the wrong typeface while
 * everything around it looks right.
 *
 * `document.fonts.load` forces each face to be fetched, which puts it in the
 * `google-fonts` cache alongside the rest.
 */
async function warmFonts(signal: AbortSignal): Promise<void> {
  const fonts = (globalThis.document as Document & { fonts?: FontFaceSet })
    ?.fonts;
  if (!fonts?.load) return;
  await Promise.all(
    UI_FONT_FACES.map(async (face) => {
      if (signal.aborted) return;
      try {
        await fonts.load(face);
      } catch {
        // A face the reader's chosen interface font doesn't define.
      }
    }),
  );
}

/**
 * Followed authors, which sit in the same sidebar section as subscriptions and
 * failed the same way: listed, and unopenable.
 */
async function warmFollowedUsers(
  router: AnyRouter,
  signal: AbortSignal,
): Promise<void> {
  let dids: Array<string>;
  try {
    const sidebar = await feedApi.getSidebar();
    dids = sidebar.followingUsers.map((followed) => followed.did);
  } catch {
    return;
  }
  if (dids.length === 0) return;

  await preloadRouteChunk(router, "/u/$did", { did: dids[0] ?? "" });

  await pool(
    dids.slice(0, MAX_WARMED_PUBLICATIONS),
    BODY_CONCURRENCY,
    signal,
    async (did) => {
      // `getAuthorProfileQueryOptions(did, { limit: AUTHOR_PAGE_SIZE })` —
      // offset and activityLimit come from its own defaults.
      await authorApi.getAuthorProfile({
        data: {
          did,
          limit: AUTHOR_PAGE_SIZE,
          offset: 0,
          activityLimit: AUTHOR_ACTIVITY_PAGE_SIZE,
        },
      });
      progressCount("authors");
    },
  );
}

/**
 * The reader's own lists and the ones they've saved — the rest of that sidebar.
 */
async function warmLists(
  router: AnyRouter,
  signal: AbortSignal,
): Promise<void> {
  let refs: Array<{ did: string; rkey: string }> = [];
  try {
    const [own, saved] = await Promise.all([
      listApi.getLists(),
      listApi.getSavedLists().catch(() => []),
    ]);
    // A saved list wraps the list it points at; an owned one is the list.
    refs = [...own, ...saved.map((entry) => entry.list)]
      .map((list) => listRefFromUri(list.uri))
      .filter((ref): ref is { did: string; rkey: string } => ref !== null);
  } catch {
    return;
  }
  if (refs.length === 0) return;

  const first = refs[0];
  if (first) await preloadRouteChunk(router, "/l/$did/$rkey", first);

  await pool(refs, BODY_CONCURRENCY, signal, async ({ did, rkey }) => {
    await Promise.all([
      listApi.getList({ data: { did, rkey } }),
      // `getListFeedQueryOptions(did, rkey, { limit: PAGE_SIZE, offset: 0,
      // readerScope })` — `hideRead` defaults false, and `readerScope` scopes
      // the React Query key only.
      listApi.getListFeed({
        data: {
          did,
          rkey,
          limit: LIST_PAGE_SIZE,
          offset: 0,
          hideRead: false,
        },
      }),
    ]);
    progressCount("lists");
  });
}

/**
 * Publish the device totals without running a pass, so the troubleshooting
 * panel can answer "what do I already have?" the moment it opens.
 */
export function publishOfflineSyncTotals(): void {
  const state = readOfflineSyncState();
  const fresh = ledgerFreshUris(Date.now());
  progressTotals({
    initialComplete: state.initialCompletedAt !== null,
    pending: state.pending.filter((uri) => !fresh.has(uri)).length,
    stored: fresh.size,
  });
}

export function stopOfflineSync(): void {
  controller?.abort();
  controller = null;
  running = false;
}

/**
 * Walk the reader's unread set and make it available offline.
 *
 * No-ops unless this is the installed app: the whole point is the launcher
 * icon that opens with no connection, and silently downloading someone's
 * backlog because they opened the website in a tab is not a trade a website
 * visitor agreed to.
 */
export async function runOfflineSync(
  router: AnyRouter,
  opts: {
    /**
     * Skip the installed-app / toggle / Save-Data gates. Only the settings
     * debug panel passes this — pressing "Run sync now" *is* the consent those
     * gates exist to establish, and it lets sync be exercised in a plain
     * browser tab where `display-mode: standalone` never matches.
     */
    force?: boolean;
  } = {},
): Promise<void> {
  if (running || globalThis.window === undefined) return;
  if (isOffline()) {
    progressIneligible("offline");
    return;
  }
  if (!opts.force) {
    // Each gate names itself so the debug panel can say why nothing has run —
    // "not-eligible: not installed" beats a counter stuck at zero.
    if (!isStandalone()) {
      progressIneligible("not installed (browser tab, not the app)");
      return;
    }
    if (!isOfflineReadingEnabled()) {
      progressIneligible("offline reading is turned off in settings");
      return;
    }
    if (saveDataRequested()) {
      progressIneligible("the system asked apps to save data");
      return;
    }
  }

  running = true;
  controller = new AbortController();
  const { signal } = controller;
  // Resumed from disk, not from this session: the plan has to survive the app
  // being killed, which is the normal way an installed PWA ends.
  const state = readOfflineSyncState();
  const filling = state.initialCompletedAt === null;
  const passToken = progressBegin(filling ? "initial" : "top-up");

  try {
    // Ask once per install. Without this the browser treats the whole origin as
    // discardable and can drop a synced backlog under storage pressure.
    void globalThis.navigator?.storage?.persist?.();

    // ── Phase 1: every *list* surface, breadth-first. ──
    // These are cheap (one request per page) and they are what makes the app
    // feel present offline: feeds that scroll, publications that open. They
    // all run before a single body downloads, because the body walk takes
    // minutes and phones kill backgrounded PWAs without warning — an
    // interrupted pass should leave every surface warm and some bodies
    // missing (dimmed), not deep bodies behind surfaces that 404.
    const fresh = ledgerFreshUris(Date.now());
    // Body order = discovery order: whatever the last launch had left over
    // first, then unread, the feed walk, and publication back catalogs. Newest
    // and most-likely-to-be-opened first, so whatever ends the walk early cuts
    // from the bottom.
    //
    // The queue is seeded from disk. Documents discovered but not yet stored
    // used to live only in memory, so a kill between discovering and fetching
    // them forgot them until some later walk happened past them again.
    const bodyQueue: Array<string> = state.pending.filter(
      (uri) => !fresh.has(uri),
    );
    const queued = new Set(bodyQueue);
    const enqueueBody = (uri: string) => {
      if (queued.has(uri) || fresh.has(uri)) return;
      queued.add(uri);
      bodyQueue.push(uri);
    };
    const publishTotals = () => {
      progressTotals({
        initialComplete: state.initialCompletedAt !== null,
        pending: bodyQueue.length,
        stored: fresh.size,
      });
    };
    publishTotals();

    progressStep("app shell");
    await warmShell(signal);
    progressStep("feeds");
    await warmFeedData(signal);

    // Before the unread walk on purpose — the shelf's bodies are few and are
    // the ones the reader is most likely to open next (see
    // `warmReadingHistory`), and the queue is drained in the order it is
    // filled.
    progressStep("history");
    await warmReadingHistory(signal, enqueueBody);
    state.pending = bodyQueue;
    writeOfflineSyncState(state);
    publishTotals();

    // The rest of "your stuff": what you liked, and the profile the avatar
    // menu points at. Both are a handful of requests and neither can wait for
    // the daily surface pass — a like made this morning should be there
    // tonight.
    progressStep("likes");
    await warmLikes(signal);
    progressStep("your profile");
    await warmOwnProfile(router, signal);

    // The unread list — URIs only; their bodies queue for phase 2.
    progressStep("unread list");
    let cursor: { publishedAt: string; uri: string } | null = null;
    do {
      if (signal.aborted || isOffline()) break;
      const page: Awaited<ReturnType<typeof readerApi.getUnreadDocumentUris>> =
        await readerApi.getUnreadDocumentUris({
          data: cursor ? { cursor } : {},
        });
      for (const uri of page.uris) enqueueBody(uri);
      progressCount("unreadListed", page.uris.length);
      cursor = page.nextCursor;
    } while (cursor && !signal.aborted);

    // The /latest tabs, deep enough to scroll. Every pass, because this is
    // where new posts appear — but it stops as soon as it reaches pages it
    // already knows, so a caught-up pass costs a couple of requests.
    progressStep("latest pages");
    let collectionWarmed = false;
    for (const filter of ["unread", "subscriptions"] as const) {
      if (signal.aborted || isOffline()) break;
      const uris = await warmLatestPages(
        filter,
        signal,
        fresh,
        state,
        (uri) => {
          if (collectionWarmed) return;
          collectionWarmed = true;
          void warmArticleRoute(router, uri, "/collection/$did/$rkey");
        },
      );
      for (const uri of uris) enqueueBody(uri);
      state.pending = bodyQueue;
      writeOfflineSyncState(state);
      publishTotals();
    }

    // Route chunks, fonts, and every publication / author / list the reader
    // follows. Timestamped on disk rather than flagged per session: this is a
    // few hundred requests, the set changes about as often as the reader
    // subscribes to something, and redoing it on every launch was pure waste
    // for an app that gets killed and relaunched all day.
    if (surfacesAreStale(state, Date.now())) {
      progressStep("app code");
      await warmRouteChunks(router, signal);
      progressStep("fonts");
      await warmFonts(signal);
      progressStep("publications");
      await warmPublications(router, signal, enqueueBody);
      progressStep("authors");
      await warmFollowedUsers(router, signal);
      progressStep("lists");
      await warmLists(router, signal);
      // Only once it has actually finished. A pass that lost the connection
      // two seconds in must not claim the sidebar is cached for a day.
      if (!signal.aborted && !isOffline()) {
        state.surfacesWarmedAt = Date.now();
      }
      state.pending = bodyQueue;
      writeOfflineSyncState(state);
      publishTotals();
    }

    // ── Phase 2: article bodies and their images, in queue order. ──
    progressStep("articles");
    progressCount("bodiesQueued", bodyQueue.length);
    if (bodyQueue[0]) await warmArticleRoute(router, bodyQueue[0]);

    let stopReason: "completed" | "offline" | "storage" = "completed";
    // Drains from the front, and the remainder is written back after each
    // batch — so being killed here costs at most one batch of re-fetching
    // rather than the whole walk that discovered these.
    while (bodyQueue.length > 0) {
      if (signal.aborted || isOffline()) {
        stopReason = "offline";
        break;
      }
      if (await underStoragePressure()) {
        stopReason = "storage";
        break;
      }
      const batch = bodyQueue.splice(0, STORAGE_CHECK_INTERVAL);
      await pool(batch, BODY_CONCURRENCY, signal, (uri) =>
        syncDocument(uri, signal),
      );
      for (const uri of batch) fresh.add(uri);
      state.pending = bodyQueue;
      writeOfflineSyncState(state);
      publishTotals();
      await whenIdle(signal);
    }

    // The initial fill is finished only when both feed tabs have been walked to
    // the end *and* nothing is left queued. Recorded on disk, so the cheap
    // top-up behaviour starts from the next launch onwards rather than being
    // re-derived — and so an interrupted fill resumes as a fill.
    if (
      filling &&
      stopReason === "completed" &&
      !signal.aborted &&
      state.feedDone.unread &&
      state.feedDone.subscriptions &&
      bodyQueue.length === 0
    ) {
      state.initialCompletedAt = Date.now();
      // Safe to prune only here: this is the one moment the queue is known to
      // span everything the walk found. A top-up sees only the head of the
      // feed, so pruning to what it saw would evict the whole backlog.
      ledgerRetainOnly(queued);
    }
    state.pending = bodyQueue;
    writeOfflineSyncState(state);
    publishTotals();
    progressEnd(passToken, signal.aborted ? "stopped" : stopReason);
  } catch (error) {
    // Sync is best-effort by construction. A failure means the reader has
    // whatever was stored before, which is the same position they were in
    // without this feature.
    progressEnd(
      passToken,
      "error",
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    running = false;
    controller = null;
  }
}

/**
 * Start syncing after the app has settled, and again whenever the connection
 * comes back. Returns a teardown for the caller's effect.
 */
export function startOfflineSync(router: AnyRouter): () => void {
  const start = () => {
    void runOfflineSync(router);
  };

  // Keep going for as long as the app is open, rather than filling once and
  // stopping: new posts arrive, and a pass that hit the storage guard or lost
  // the connection has more to do. Repeat passes are cheap by construction —
  // the ledger skips bodies already stored, and the feed walk stops as soon as
  // it reaches pages it has already seen (see `warmLatestPages`).
  const timer = globalThis.setTimeout(start, INITIAL_SYNC_DELAY_MS);
  const interval = globalThis.setInterval(start, RESYNC_INTERVAL_MS);

  // Coming back to a backgrounded app is the other natural moment to top up:
  // timers are throttled or suspended while hidden, so the interval alone can
  // leave a long gap.
  const onVisible = () => {
    if (globalThis.document?.visibilityState === "visible") start();
  };
  // The shared verdict rather than the raw `online`/`offline` events: on a
  // browser that misreports `navigator.onLine` those events never fire at all,
  // so the connection coming back would otherwise go unnoticed until the next
  // interval tick.
  const unsubscribe = subscribeToOnlineStatus((online) => {
    if (online) start();
    else stopOfflineSync();
  });
  globalThis.document?.addEventListener("visibilitychange", onVisible);

  return () => {
    globalThis.clearTimeout(timer);
    globalThis.clearInterval(interval);
    unsubscribe();
    globalThis.document?.removeEventListener("visibilitychange", onVisible);
    stopOfflineSync();
  };
}

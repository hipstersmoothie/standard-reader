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
import { readerApi } from "#/integrations/tanstack-query/api-reader.functions";
import { documentImages } from "#/lib/document/images";
import { parseAtUri } from "#/server/atproto/uri";
import { listRefFromUri } from "#/server/reader/saved-lists";

import {
  ledgerFreshUris,
  ledgerRecord,
  ledgerRetainOnly,
  offlineStorageUsage,
} from "./offline-cache";
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
 * rather than something people actually hit; the pass runs once per session
 * (see {@link runOfflineSync}), so it isn't paid repeatedly.
 */
const MAX_WARMED_PUBLICATIONS = 250;

/**
 * Must match `/p/$did/$rkey`'s loader. These values reach the server, so a
 * drift here is not a type error — it is a cache entry stored under a URL the
 * publication page never requests, and an offline page that silently fails.
 */
const PUBLICATION_RECENT_LIMIT = 12;
const PUBLICATION_RECENT_FILTER = "all";

/** Must match `/u/$did`'s loader (`AUTHOR_PAGE_SIZE`), same caveat as above. */
const AUTHOR_PAGE_SIZE = 24;

/** Must match `/l/$did/$rkey`'s loader (`PAGE_SIZE`), same caveat as above. */
const LIST_PAGE_SIZE = 20;

let running = false;
let controller: AbortController | null = null;
/** Whether the session-scoped, run-once work has been done (see the pass). */
let didFullPass = false;

export function isOfflineReadingEnabled(): boolean {
  if (globalThis.localStorage === undefined) return true;
  try {
    // Default on: absent key means the reader has never expressed a preference.
    return globalThis.localStorage.getItem(OFFLINE_READING_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

/**
 * Read through a function rather than inline: an early
 * `if (navigator.onLine === false) return` narrows the global to `true` for the
 * rest of the enclosing function, and the loops below re-check it after
 * awaiting.
 */
function isOffline(): boolean {
  return globalThis.navigator?.onLine === false;
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
  }

  ledgerRecord(documentUri, Date.now());
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
const OFFLINE_ROUTES = ["/", "/latest", "/saved", "/subscriptions"] as const;

async function warmRouteChunks(
  router: AnyRouter,
  signal: AbortSignal,
): Promise<void> {
  for (const to of OFFLINE_ROUTES) {
    if (signal.aborted || isOffline()) return;
    try {
      await router.preloadRoute({ to });
    } catch {
      // Signed-out readers have no /saved or /subscriptions, and a redirect
      // throws here. Neither is a reason to stop warming the rest.
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
  filter: "unread" | "subscriptions",
  signal: AbortSignal,
  known: ReadonlySet<string>,
  onCollection?: (documentUri: string) => void,
): Promise<Array<string>> {
  const limit = latestFeedPageSize(filter);
  const uris: Array<string> = [];
  let offset = 0;
  let settledPages = 0;

  for (let page = 0; page < LATEST_WARM_MAX_PAGES; page += 1) {
    if (signal.aborted || isOffline()) break;
    let feed: Awaited<ReturnType<typeof feedApi.getLatestFeed>>;
    try {
      // Mirrors both the loader and the route's own load-more call.
      feed = await feedApi.getLatestFeed({ data: { filter, limit, offset } });
    } catch {
      break;
    }

    let fresh = 0;
    for (const item of feed.items) {
      uris.push(item.uri);
      if (!known.has(item.uri)) fresh += 1;
      // A collection article redirects `/a/…` → `/collection/…` for readers who
      // open collections as magazines, so that route is reachable offline even
      // though its nav entry is hidden — and it needs its own chunk.
      if (item.isCollection) onCollection?.(item.uri);
    }

    // Stop once the walk reaches depth it already has. This is what makes
    // running every few minutes affordable: the first pass goes as deep as the
    // cap allows, and each pass after it costs a couple of pages unless
    // something new arrived. Two consecutive settled pages rather than one, so
    // a single page of re-reads doesn't end the walk early.
    settledPages = fresh === 0 ? settledPages + 1 : 0;
    if (page >= MIN_LATEST_WARM_PAGES && settledPages >= 2) break;

    if (feed.nextOffset == null) break;
    offset = feed.nextOffset;
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
      await Promise.all([
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
export async function runOfflineSync(router: AnyRouter): Promise<void> {
  if (running) return;
  if (globalThis.window === undefined) return;
  if (!isStandalone()) return;
  if (!isOfflineReadingEnabled()) return;
  if (isOffline()) return;
  if (saveDataRequested()) return;

  running = true;
  controller = new AbortController();
  const { signal } = controller;
  // The first pass of a session goes wide and deep; the ones after it top up.
  const fullPass = !didFullPass;

  try {
    // Ask once per install. Without this the browser treats the whole origin as
    // discardable and can drop a synced backlog under storage pressure.
    void globalThis.navigator?.storage?.persist?.();

    await warmShell(signal);
    // Before any bodies. An unwarmed feed drops a fully-cached page into the
    // offline state, so the surfaces come first and the articles follow.
    await warmFeedData(signal);

    // Route chunks, fonts, and every publication / author / list the reader
    // follows: a large, fixed set that does not change during a session. Doing
    // it once is what lets the pass repeat every few minutes — re-fetching a
    // few hundred sidebar pages on a timer would be a lot of traffic for
    // nothing. A new session redoes it, which is when it can have changed.
    if (fullPass) {
      await warmRouteChunks(router, signal);
      await warmFonts(signal);
      await warmPublications(router, signal);
      await warmFollowedUsers(router, signal);
      await warmLists(router, signal);
      // Only once it has actually finished. A pass that lost the connection
      // two seconds in must not convince the rest of the session that the
      // sidebar is cached.
      if (!signal.aborted && !isOffline()) didFullPass = true;
    }

    const fresh = ledgerFreshUris(Date.now());
    const seen = new Set<string>();
    let cursor: { publishedAt: string; uri: string } | null = null;
    let routeWarmed = false;
    let stoppedEarly = false;

    /** Cache a batch of bodies; returns false when storage says stop. */
    const cacheBodies = async (uris: Array<string>): Promise<boolean> => {
      for (let i = 0; i < uris.length; i += STORAGE_CHECK_INTERVAL) {
        if (signal.aborted || isOffline()) return false;
        if (await underStoragePressure()) return false;
        await pool(
          uris.slice(i, i + STORAGE_CHECK_INTERVAL),
          BODY_CONCURRENCY,
          signal,
          (uri) => syncDocument(uri, signal),
        );
        await whenIdle(signal);
      }
      return true;
    };

    // ── Unread first. Uncapped: this is the backlog the reader came for. ──
    do {
      if (signal.aborted || isOffline()) break;

      const page: Awaited<ReturnType<typeof readerApi.getUnreadDocumentUris>> =
        await readerApi.getUnreadDocumentUris({
          data: cursor ? { cursor } : {},
        });
      for (const uri of page.uris) seen.add(uri);
      cursor = page.nextCursor;

      const pending = page.uris.filter((uri) => !fresh.has(uri));

      if (!routeWarmed && pending[0]) {
        routeWarmed = true;
        await warmArticleRoute(router, pending[0]);
      }

      if (!(await cacheBodies(pending))) {
        stoppedEarly = true;
        break;
      }
    } while (cursor && !signal.aborted);

    // ── Then the /latest tabs, deep enough to scroll. ──
    // Warming offset 0 alone cached one screenful, so the lists looked short
    // offline and "load more" had nothing behind it. Walking the pages also
    // yields the subscriptions backlog — already-read posts that unread alone
    // misses — so the same requests serve both the list and its bodies.
    let collectionWarmed = false;
    for (const filter of ["unread", "subscriptions"] as const) {
      if (stoppedEarly || signal.aborted || isOffline()) break;
      const uris = await warmLatestPages(
        filter,
        signal,
        // What the walk already has, so it can stop once it reaches it.
        fresh,
        (documentUri) => {
          if (collectionWarmed) return;
          collectionWarmed = true;
          void warmArticleRoute(router, documentUri, "/collection/$did/$rkey");
        },
      );
      for (const uri of uris) seen.add(uri);
      if (!(await cacheBodies(uris.filter((uri) => !fresh.has(uri))))) {
        stoppedEarly = true;
      }
    }

    // Prune only after a pass that actually saw everything — the deep first
    // one. Later passes stop as soon as the feed walk reaches familiar ground,
    // so `seen` covers the head of the list and nothing below it; pruning to
    // that would evict the whole backlog and re-download it next time. Entries
    // the reader has worked through age out of the ledger on their own.
    if (fullPass && !stoppedEarly && !cursor && !signal.aborted) {
      ledgerRetainOnly(seen);
    }
  } catch {
    // Sync is best-effort by construction. A failure means the reader has
    // whatever was stored before, which is the same position they were in
    // without this feature.
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
  globalThis.addEventListener?.("online", start);
  globalThis.addEventListener?.("offline", stopOfflineSync);
  globalThis.document?.addEventListener("visibilitychange", onVisible);

  return () => {
    globalThis.clearTimeout(timer);
    globalThis.clearInterval(interval);
    globalThis.removeEventListener?.("online", start);
    globalThis.removeEventListener?.("offline", stopOfflineSync);
    globalThis.document?.removeEventListener("visibilitychange", onVisible);
    stopOfflineSync();
  };
}

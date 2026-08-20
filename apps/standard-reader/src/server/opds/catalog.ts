/**
 * The catalog itself: read-model queries in, {@link OpdsFeed}s out.
 *
 * Every feed here is built from the same queries the web app's pages use, so
 * the catalog cannot drift from the site — a publication that is hidden from
 * discovery is hidden here, a blocked account is filtered here, and a shelf
 * shows what the reader's own page shows.
 */

import type {
  ArticleCard,
  PublicationCard,
} from "#/integrations/tanstack-query/api-shapes";
import type {
  OpdsFeed,
  OpdsLink,
  OpdsNavigationEntry,
  OpdsPagination,
} from "#/lib/opds/model";
import { feedTypeFor, OPDS_REL, OPENSEARCH_TYPE } from "#/lib/opds/model";
import {
  opdsCollectionsUrl,
  opdsComicsUrl,
  opdsLatestUrl,
  opdsListUrl,
  opdsOpenSearchUrl,
  opdsPublicationsUrl,
  opdsRootUrl,
  opdsShelfUrl,
  opdsTagsUrl,
  opdsTagUrl,
  opdsTrendingUrl,
} from "#/lib/opds/urls";
import { SITE_DESCRIPTION, SITE_NAME } from "#/lib/site-metadata";

import { articleEntry, publicationNavEntry } from "./entries";

/** Entries per page. Generous — catalog rows are cheap and paging is clumsy. */
export const OPDS_PAGE_SIZE = 40;

/** The epoch a feed reports when it has nothing dated in it. */
const EMPTY_UPDATED = new Date(0).toISOString();

/** Newest timestamp across a set of rows — the feed's `updated`. */
export function newestUpdated(dates: Array<string | null | undefined>): string {
  let newest = 0;
  for (const value of dates) {
    if (!value) continue;
    const time = Date.parse(value);
    if (!Number.isNaN(time) && time > newest) newest = time;
  }
  return newest === 0 ? EMPTY_UPDATED : new Date(newest).toISOString();
}

/** `?page=` as a 1-based page number; anything unparseable is page 1. */
export function pageFromRequest(request: Request): number {
  const raw = new URL(request.url).searchParams.get("page");
  const page = Number.parseInt(raw ?? "1", 10);
  return Number.isFinite(page) && page > 1 ? page : 1;
}

function withPage(href: string, page: number): string {
  const url = new URL(href);
  if (page > 1) url.searchParams.set("page", String(page));
  else url.searchParams.delete("page");
  return url.toString();
}

/**
 * `start` (and `up`) on every feed, so a client that landed deep — from a saved
 * bookmark, or a shelf URL pasted straight into a device — can still find its
 * way to the rest of the catalog.
 */
function baseLinks(baseUrl: string, upHref?: string): Array<OpdsLink> {
  const links: Array<OpdsLink> = [
    {
      href: opdsRootUrl(baseUrl),
      rel: "start",
      title: SITE_NAME,
      type: feedTypeFor("navigation"),
    },
    {
      href: opdsOpenSearchUrl(baseUrl),
      rel: "search",
      title: `Search ${SITE_NAME}`,
      type: OPENSEARCH_TYPE,
    },
  ];
  if (upHref) {
    links.push({
      href: upHref,
      rel: "up",
      type: feedTypeFor("navigation"),
    });
  }
  return links;
}

/** `next`/`previous` links plus the OpenSearch counts, for a paged feed. */
function pageLinks(
  selfHref: string,
  page: number,
  kind: "acquisition" | "navigation",
  {
    itemCount,
    totalResults,
  }: { itemCount: number; totalResults?: number | null },
): { links: Array<OpdsLink>; pagination: OpdsPagination | undefined } {
  const links: Array<OpdsLink> = [];
  const startIndex = (page - 1) * OPDS_PAGE_SIZE;

  // A full page means there is probably more; a short page means there is not.
  // Where a real total is known it decides instead.
  const hasMore =
    typeof totalResults === "number"
      ? startIndex + itemCount < totalResults
      : itemCount === OPDS_PAGE_SIZE;

  if (hasMore) {
    links.push({
      href: withPage(selfHref, page + 1),
      rel: "next",
      type: feedTypeFor(kind),
    });
  }
  if (page > 1) {
    links.push({
      href: withPage(selfHref, page - 1),
      rel: "previous",
      type: feedTypeFor(kind),
    });
  }

  return {
    links,
    pagination:
      typeof totalResults === "number"
        ? { itemsPerPage: OPDS_PAGE_SIZE, startIndex, totalResults }
        : undefined,
  };
}

export interface ArticleFeedOptions {
  id: string;
  title: string;
  selfHref: string;
  baseUrl: string;
  page: number;
  subtitle?: string | null;
  iconUrl?: string | null;
  upHref?: string;
  totalResults?: number | null;
  /** Extra links (facets, a whole-shelf download) merged in after the standard set. */
  extraLinks?: Array<OpdsLink>;
}

/** A feed of articles — the shape every acquisition feed in the catalog takes. */
export function articleFeed(
  cards: Array<ArticleCard>,
  options: ArticleFeedOptions,
): OpdsFeed {
  const { links: paging, pagination } = pageLinks(
    options.selfHref,
    options.page,
    "acquisition",
    { itemCount: cards.length, totalResults: options.totalResults },
  );

  return {
    iconUrl: options.iconUrl,
    id: options.id,
    kind: "acquisition",
    links: [
      ...baseLinks(options.baseUrl, options.upHref),
      ...paging,
      ...(options.extraLinks ?? []),
    ],
    pagination,
    publications: cards.map((card) => articleEntry(card, options.baseUrl)),
    selfHref: withPage(options.selfHref, options.page),
    subtitle: options.subtitle,
    title: options.title,
    updated: newestUpdated(cards.map((card) => card.publishedAt)),
  };
}

export interface NavigationFeedOptions {
  id: string;
  title: string;
  selfHref: string;
  baseUrl: string;
  subtitle?: string | null;
  upHref?: string;
  page?: number;
  totalResults?: number | null;
  extraLinks?: Array<OpdsLink>;
}

/** A feed of places to go. */
export function navigationFeed(
  entries: Array<OpdsNavigationEntry>,
  options: NavigationFeedOptions,
): OpdsFeed {
  const page = options.page ?? 1;
  const { links: paging, pagination } = pageLinks(
    options.selfHref,
    page,
    "navigation",
    { itemCount: entries.length, totalResults: options.totalResults },
  );

  return {
    id: options.id,
    kind: "navigation",
    links: [
      ...baseLinks(options.baseUrl, options.upHref),
      ...paging,
      ...(options.extraLinks ?? []),
    ],
    navigation: entries,
    pagination,
    selfHref: withPage(options.selfHref, page),
    subtitle: options.subtitle,
    title: options.title,
    updated: newestUpdated(entries.map((entry) => entry.updated)),
  };
}

/**
 * The catalog root.
 *
 * Deliberately public and reader-agnostic: this is the URL that gets shared,
 * printed in docs, and pasted into a device by someone who is not signed in.
 * A reader's own shelves hang off {@link shelfNavigation} instead, at a URL
 * that carries their DID.
 */
export function rootFeed(baseUrl: string): OpdsFeed {
  const updated = new Date(0).toISOString();
  const nav = (
    title: string,
    href: string,
    summary: string,
    kind: "acquisition" | "navigation",
  ): OpdsNavigationEntry => ({ href, id: href, kind, summary, title, updated });

  return {
    id: opdsRootUrl(baseUrl),
    kind: "navigation",
    links: baseLinks(baseUrl),
    navigation: [
      nav(
        "Latest",
        opdsLatestUrl(baseUrl),
        "The newest articles from across the network.",
        "acquisition",
      ),
      nav(
        "Trending",
        opdsTrendingUrl(baseUrl),
        "What the network is reading and recommending right now.",
        "acquisition",
      ),
      nav(
        "Publications",
        opdsPublicationsUrl(baseUrl),
        "Every publication on the network, newest first.",
        "navigation",
      ),
      nav(
        "Comics",
        opdsComicsUrl(baseUrl),
        "Comics on the network, packaged as CBZ.",
        "navigation",
      ),
      nav("Topics", opdsTagsUrl(baseUrl), "Browse by subject.", "navigation"),
      nav(
        "Collections",
        opdsCollectionsUrl(baseUrl),
        "Curated anthologies assembled by readers.",
        "navigation",
      ),
    ],
    selfHref: opdsRootUrl(baseUrl),
    subtitle: SITE_DESCRIPTION,
    title: SITE_NAME,
    // The root has no content of its own; leaving `updated` at the epoch is
    // honest and keeps the document byte-stable for conditional requests.
    updated,
  };
}

/**
 * A reader's own catalog: their shelves first, then the public sections.
 *
 * This is the URL a reader actually pastes into KOReader, so it has to be the
 * whole catalog rather than a side branch — hence the public sections repeated
 * underneath.
 */
export function shelfNavigation({
  baseUrl,
  did,
  readerName,
  lists,
  trackReadingHistory,
}: {
  baseUrl: string;
  did: string;
  readerName: string;
  lists: Array<{ name: string; rkey: string; description: string | null }>;
  trackReadingHistory: boolean;
}): OpdsFeed {
  const self = opdsShelfUrl(baseUrl, did);
  const updated = new Date(0).toISOString();
  // `subsection` rather than `http://opds-spec.org/shelf`: the shelf relation
  // describes a *link to* the reader's shelf, which is what the feed-level link
  // below is for. On a navigation entry, clients look for `subsection` — a
  // stricter one skips an entry whose rel it does not recognise, which is a
  // shelf the reader can see in a browser and not in their reading app.
  const shelf = (
    title: string,
    path: string,
    summary: string,
  ): OpdsNavigationEntry => ({
    href: `${self}/${path}`,
    id: `${self}/${path}`,
    kind: "acquisition",
    summary,
    title,
    updated,
  });

  const entries: Array<OpdsNavigationEntry> = [];
  // Reading history off means every article is "unread"; an unread shelf would
  // be the whole subscription archive, which is not what the reader asked for.
  if (trackReadingHistory) {
    entries.push(shelf("Unread", "unread", "Articles you have not read yet."));
  }
  entries.push(
    shelf("Saved for later", "saved", "Everything you saved to read later."),
    shelf(
      "Subscriptions",
      "subscriptions",
      "The newest articles from the publications you subscribe to.",
    ),
  );

  entries.push({
    href: `${self}/publications`,
    id: `${self}/publications`,
    kind: "navigation",
    summary: "Browse each publication you subscribe to on its own.",
    title: "Your publications",
    updated,
  });

  for (const list of lists) {
    entries.push({
      href: opdsListUrl(baseUrl, did, list.rkey),
      id: `at://${did}/app.standard-reader.list/${list.rkey}`,
      kind: "acquisition",
      summary: list.description,
      title: list.name,
      updated,
    });
  }

  // The public catalog, repeated so this one URL is a complete catalog.
  entries.push(
    {
      href: opdsLatestUrl(baseUrl),
      id: opdsLatestUrl(baseUrl),
      kind: "acquisition",
      summary: "The newest articles from across the network.",
      title: "Latest across the network",
      updated,
    },
    {
      href: opdsTrendingUrl(baseUrl),
      id: opdsTrendingUrl(baseUrl),
      kind: "acquisition",
      summary: "What the network is reading and recommending right now.",
      title: "Trending",
      updated,
    },
    {
      href: opdsPublicationsUrl(baseUrl),
      id: opdsPublicationsUrl(baseUrl),
      kind: "navigation",
      summary: "Every publication on the network.",
      title: "All publications",
      updated,
    },
    {
      href: opdsTagsUrl(baseUrl),
      id: opdsTagsUrl(baseUrl),
      kind: "navigation",
      summary: "Browse by subject.",
      title: "Topics",
      updated,
    },
  );

  return {
    id: self,
    kind: "navigation",
    links: [
      ...baseLinks(baseUrl),
      {
        href: `${self}/saved`,
        rel: OPDS_REL.shelf,
        title: "Saved for later",
        type: feedTypeFor("acquisition"),
      },
    ],
    navigation: entries,
    selfHref: self,
    subtitle: `Shelves for ${readerName}, plus everything on ${SITE_NAME}.`,
    title:
      readerName === SITE_NAME ? SITE_NAME : `${readerName} · ${SITE_NAME}`,
    updated,
  };
}

/** Publications as navigation entries, for any list of them. */
export function publicationEntries(
  publications: Array<PublicationCard>,
  baseUrl: string,
): Array<OpdsNavigationEntry> {
  return publications.map((publication) =>
    publicationNavEntry(
      publication,
      baseUrl,
      publication.lastDocumentAt ?? EMPTY_UPDATED,
    ),
  );
}

/** Topic chips as navigation entries into per-tag acquisition feeds. */
export function topicEntries(
  topics: Array<{ topic: string; count: number }>,
  baseUrl: string,
): Array<OpdsNavigationEntry> {
  return topics.map((topic) => ({
    href: opdsTagUrl(baseUrl, topic.topic),
    id: opdsTagUrl(baseUrl, topic.topic),
    kind: "acquisition",
    summary: `${topic.count} ${topic.count === 1 ? "publication" : "publications"}`,
    title: topic.topic,
    updated: EMPTY_UPDATED,
  }));
}

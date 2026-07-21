import type { InfiniteData } from "@tanstack/react-query";
import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type {
  LatestFeed,
  SidebarData,
} from "#/integrations/tanstack-query/api-feed.functions";
import type {
  ReaderListPage,
  ReadHistoryItem,
  ReadStatus,
} from "#/integrations/tanstack-query/api-reader.functions";
import type {
  ArticleCard,
  PublicationCard,
} from "#/integrations/tanstack-query/api-shapes";

import {
  applyMarkReadOptimisticUpdate,
  applyMarkUnreadOptimisticUpdate,
} from "./read-optimistic";

const PUB_URI = "at://pub";
const DOC_URI = "at://doc";
const OTHER_URI = "at://doc2";

function makeCard(uri: string, isRead: boolean): ArticleCard {
  return {
    uri,
    did: "did:plc:author",
    title: "Title",
    description: null,
    path: null,
    canonicalUrl: null,
    coverImageUrl: null,
    publishedAt: "2024-01-01T00:00:00.000Z",
    featured: false,
    publicationUri: PUB_URI,
    publicationName: "Pub",
    publicationIconUrl: null,
    publicationOwnerAvatarUrl: null,
    publicationOwnerHandle: null,
    publicationBannerUrl: null,
    publicationTopic: null,
    authorHandle: null,
    authorAvatarUrl: null,
    authorDisplayName: null,
    tags: null,
    textContent: null,
    recommendCount: 0,
    commentCount: 0,
    hasRenderableBody: true,
    isRead,
    isCollection: false,
  };
}

function makePub(uri: string, name: string): PublicationCard {
  return {
    uri,
    did: `did:plc:${name}`,
    name,
    url: `https://example.com/${name}`,
    description: null,
    iconUrl: null,
    ownerAvatarUrl: null,
    ownerHandle: null,
    topic: null,
    verified: false,
    hiddenFromDiscover: false,
    subscriberCount: 0,
    documentCount: 0,
    lastDocumentAt: null,
  };
}

function latestFeed(items: Array<ArticleCard>, unread: number): LatestFeed {
  return {
    items,
    counts: { unread, subscriptions: 5, all: 10, trending: 2 },
    nextOffset: null,
  };
}

describe("applyMarkUnreadOptimisticUpdate", () => {
  it("flips a read card back to unread and bumps the latest-feed unread count", () => {
    const qc = new QueryClient();
    qc.setQueryData<LatestFeed>(
      ["feed", "latest", "subscriptions"],
      latestFeed([makeCard(DOC_URI, true)], 0),
    );
    qc.setQueryData<ReadStatus>(["reader", "readStatus", DOC_URI], {
      isRead: true,
    });

    applyMarkUnreadOptimisticUpdate(qc, DOC_URI, PUB_URI);

    const feed = qc.getQueryData<LatestFeed>([
      "feed",
      "latest",
      "subscriptions",
    ]);
    expect(feed?.items[0]?.isRead).toBe(false);
    expect(feed?.counts?.unread).toBe(1);
    expect(
      qc.getQueryData<ReadStatus>(["reader", "readStatus", DOC_URI]),
    ).toEqual({ isRead: false });
  });

  it("does not bump counters when the document was not read", () => {
    const qc = new QueryClient();
    qc.setQueryData<LatestFeed>(
      ["feed", "latest", "subscriptions"],
      latestFeed([makeCard(DOC_URI, false)], 4),
    );

    applyMarkUnreadOptimisticUpdate(qc, DOC_URI, PUB_URI);

    const feed = qc.getQueryData<LatestFeed>([
      "feed",
      "latest",
      "subscriptions",
    ]);
    expect(feed?.counts?.unread).toBe(4);
  });

  it("drops the document from reading history and decrements the total", () => {
    const qc = new QueryClient();
    const history: InfiniteData<ReaderListPage<ReadHistoryItem>> = {
      pages: [
        {
          items: [
            {
              readUri: "r1",
              readAt: null,
              documentUri: DOC_URI,
              article: makeCard(DOC_URI, true),
            },
            {
              readUri: "r2",
              readAt: null,
              documentUri: OTHER_URI,
              article: makeCard(OTHER_URI, true),
            },
          ],
          total: 2,
          nextOffset: null,
        },
      ],
      pageParams: [0],
    };
    qc.setQueryData(["reader", "history", 20], history);

    applyMarkUnreadOptimisticUpdate(qc, DOC_URI, PUB_URI);

    const after = qc.getQueryData<
      InfiniteData<ReaderListPage<ReadHistoryItem>>
    >(["reader", "history", 20]);
    expect(after?.pages[0]?.items.map((item) => item.documentUri)).toEqual([
      OTHER_URI,
    ]);
    expect(after?.pages[0]?.total).toBe(1);
  });

  it("removes the document from batch read-document lookups", () => {
    const qc = new QueryClient();
    qc.setQueryData<Array<string>>(
      ["reader", "readDocuments", [DOC_URI, OTHER_URI]],
      [DOC_URI, OTHER_URI],
    );

    applyMarkUnreadOptimisticUpdate(qc, DOC_URI, PUB_URI);

    expect(
      qc.getQueryData<Array<string>>([
        "reader",
        "readDocuments",
        [DOC_URI, OTHER_URI],
      ]),
    ).toEqual([OTHER_URI]);
  });

  it("increments sidebar unread counters when the document was read", () => {
    const qc = new QueryClient();
    qc.setQueryData<ReadStatus>(["reader", "readStatus", DOC_URI], {
      isRead: true,
    });
    const sidebar: SidebarData = {
      signedIn: true,
      hasFollows: true,
      following: [{ ...makePub(PUB_URI, "Pub"), unreadCount: 2 }],
      followingUsers: [],
      unreadCount: 5,
      savedCount: 0,
    };
    qc.setQueryData(["feed", "sidebar"], sidebar);

    applyMarkUnreadOptimisticUpdate(qc, DOC_URI, PUB_URI);

    const after = qc.getQueryData<SidebarData>(["feed", "sidebar"]);
    expect(after?.unreadCount).toBe(6);
    expect(after?.following[0]?.unreadCount).toBe(3);
  });

  it("round-trips the unread count with applyMarkReadOptimisticUpdate", () => {
    const qc = new QueryClient();
    qc.setQueryData<LatestFeed>(
      ["feed", "latest", "subscriptions"],
      latestFeed([makeCard(DOC_URI, false)], 3),
    );

    applyMarkReadOptimisticUpdate(qc, DOC_URI, PUB_URI);
    let feed = qc.getQueryData<LatestFeed>(["feed", "latest", "subscriptions"]);
    expect(feed?.items[0]?.isRead).toBe(true);
    expect(feed?.counts?.unread).toBe(2);

    applyMarkUnreadOptimisticUpdate(qc, DOC_URI, PUB_URI);
    feed = qc.getQueryData<LatestFeed>(["feed", "latest", "subscriptions"]);
    expect(feed?.items[0]?.isRead).toBe(false);
    expect(feed?.counts?.unread).toBe(3);
  });
});

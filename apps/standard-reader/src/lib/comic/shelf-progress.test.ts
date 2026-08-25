import { describe, expect, it } from "vitest";

import type { ComicUnreadPage } from "#/server/reader/comic";

import { comicIssueProgress } from "./shelf-progress";

const page11: ComicUnreadPage = {
  uri: "at://did:plc:a/site.standard.document/p11",
  pageOffset: 11,
};
const page12: ComicUnreadPage = {
  uri: "at://did:plc:a/site.standard.document/p12",
  pageOffset: 12,
};

/** Issue #2, pages 10..13, with the middle two unread. */
const issue = { pageOffset: 10, unreadPages: [page11, page12] };

describe("comicIssueProgress", () => {
  it("opens on the first page the reader hasn't seen", () => {
    expect(comicIssueProgress(issue)).toEqual({
      startPage: 12,
      unread: true,
      unreadCount: 2,
    });
  });

  it("counts an issue unread while any one page is", () => {
    const lastPageOnly = { pageOffset: 10, unreadPages: [page12] };
    expect(comicIssueProgress(lastPageOnly)).toMatchObject({
      startPage: 13,
      unread: true,
    });
  });

  it("goes back to the cover once the issue has been read through", () => {
    expect(comicIssueProgress({ pageOffset: 10, unreadPages: [] })).toEqual({
      startPage: 11,
      unread: false,
      unreadCount: 0,
    });
  });

  it("drops pages the caller has since read, and follows the rest", () => {
    const read = new Set([page11.uri]);
    expect(comicIssueProgress(issue, (page) => !read.has(page.uri))).toEqual({
      startPage: 13,
      unread: true,
      unreadCount: 1,
    });
  });

  it("reads as fully read when the caller has read every page", () => {
    expect(comicIssueProgress(issue, () => false)).toEqual({
      startPage: 11,
      unread: false,
      unreadCount: 0,
    });
  });
});

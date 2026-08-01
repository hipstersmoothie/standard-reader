import { describe, expect, it } from "vitest";

import type { ComicIssue } from "#/server/reader/comic";

import { issueAtPage, pageOfIssue } from "./use-comic-pages";

/** Three issues of 3, 1 and 2 pages — absolute pages 0..5. */
const issues: Array<ComicIssue> = [
  {
    uri: "at://did:plc:a/site.standard.document/one",
    did: "did:plc:a",
    rkey: "one",
    title: "Cover",
    publishedAt: "2026-01-01T00:00:00.000Z",
    pageCount: 3,
    pageOffset: 0,
  },
  {
    uri: "at://did:plc:a/site.standard.document/two",
    did: "did:plc:a",
    rkey: "two",
    title: "Pg. 1",
    publishedAt: "2026-01-02T00:00:00.000Z",
    pageCount: 1,
    pageOffset: 3,
  },
  {
    uri: "at://did:plc:a/site.standard.document/three",
    did: "did:plc:a",
    rkey: "three",
    title: "Pg. 2",
    publishedAt: "2026-01-03T00:00:00.000Z",
    pageCount: 2,
    pageOffset: 4,
  },
];

describe("issueAtPage", () => {
  it("maps every page to the issue that contains it", () => {
    const titles = [0, 1, 2, 3, 4, 5].map(
      (index) => issueAtPage(issues, index)?.title,
    );
    expect(titles).toEqual([
      "Cover",
      "Cover",
      "Cover",
      "Pg. 1",
      "Pg. 2",
      "Pg. 2",
    ]);
  });

  it("resolves the boundary pages to the right side", () => {
    // Page 3 is the first page of the second issue, not the last of the first.
    expect(issueAtPage(issues, 3)?.title).toBe("Pg. 1");
    expect(issueAtPage(issues, 2)?.title).toBe("Cover");
  });

  it("has no issue past the last page — that index is the end card", () => {
    expect(issueAtPage(issues, 6)).toBeNull();
    expect(issueAtPage(issues, 99)).toBeNull();
  });

  it("has no issue for an empty spine", () => {
    expect(issueAtPage([], 0)).toBeNull();
  });
});

describe("pageOfIssue", () => {
  it("returns the issue's first absolute page", () => {
    expect(issues.map((issue) => pageOfIssue(issues, issue.uri))).toEqual([
      0, 3, 4,
    ]);
  });

  it("falls back to the start for an issue not in the spine", () => {
    // A text-only post is dropped from the spine, so opening the reader from it
    // starts at the cover rather than at a page that doesn't exist.
    expect(
      pageOfIssue(issues, "at://did:plc:a/site.standard.document/gone"),
    ).toBe(0);
  });
});

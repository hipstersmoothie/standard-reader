import { describe, expect, it } from "vitest";

import {
  isCoverPageLabel,
  parseComicIssueTitle,
  titlesLookLikeIssues,
} from "./issue-title";

describe("parseComicIssueTitle", () => {
  it("reads the real shapes a comic uses", () => {
    // Titles taken from `Fray In The Veil`, the comic this was built against.
    expect(parseComicIssueTitle("FITV #1 Cover")).toEqual({
      series: "FITV",
      issueNumber: 1,
      pageLabel: "Cover",
    });
    expect(parseComicIssueTitle("FITV #1 Inner Cover")).toEqual({
      series: "FITV",
      issueNumber: 1,
      pageLabel: "Inner Cover",
    });
    expect(parseComicIssueTitle("FITV #2, Pg. 22 (End of FITV #2)")).toEqual({
      series: "FITV",
      issueNumber: 2,
      pageLabel: "Pg. 22 (End of FITV #2)",
    });
  });

  it("handles a multi-word series and other separators", () => {
    expect(parseComicIssueTitle("Fray In The Veil #12 — Pg. 3")).toEqual({
      series: "Fray In The Veil",
      issueNumber: 12,
      pageLabel: "Pg. 3",
    });
    expect(parseComicIssueTitle("Some Comic #7: Page One")).toEqual({
      series: "Some Comic",
      issueNumber: 7,
      pageLabel: "Page One",
    });
  });

  it("allows a title that is only an issue number", () => {
    expect(parseComicIssueTitle("#4")).toEqual({
      series: "",
      issueNumber: 4,
      pageLabel: "",
    });
  });

  it("refuses titles with no #-marked issue", () => {
    // A bare number is ordinary prose, not an issue marker.
    expect(parseComicIssueTitle("10 Things I Learned")).toBeNull();
    expect(parseComicIssueTitle("A hiatus note")).toBeNull();
    expect(parseComicIssueTitle("")).toBeNull();
    expect(parseComicIssueTitle(null)).toBeNull();
  });
});

describe("isCoverPageLabel", () => {
  it("recognises a cover but not the leaf behind it", () => {
    expect(isCoverPageLabel("Cover")).toBe(true);
    expect(isCoverPageLabel("cover")).toBe(true);
    expect(isCoverPageLabel("Inner Cover")).toBe(false);
    expect(isCoverPageLabel("Pg. 1")).toBe(false);
    expect(isCoverPageLabel("")).toBe(false);
  });
});

describe("titlesLookLikeIssues", () => {
  it("accepts a comic with one stray announcement", () => {
    expect(
      titlesLookLikeIssues([
        "FITV #1 Cover",
        "FITV #1, Pg. 1",
        "FITV #1, Pg. 2",
        "FITV #2 Cover",
        "A note about the hiatus",
      ]),
    ).toBe(true);
  });

  it("rejects an ordinary publication that happens to use a #", () => {
    expect(
      titlesLookLikeIssues([
        "On writing well",
        "Notes from #2 of a series I read",
        "Another essay",
        "One more",
      ]),
    ).toBe(false);
  });

  it("rejects an empty archive rather than claiming a shelf", () => {
    expect(titlesLookLikeIssues([])).toBe(false);
  });
});

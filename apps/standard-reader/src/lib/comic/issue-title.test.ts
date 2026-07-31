import { describe, expect, it } from "vitest";

import {
  isCoverPageLabel,
  parseComicIssueTitle,
  parseComicPageTitle,
  parseComicTitlePart,
  titlesLookLikeComicSequence,
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

describe("parseComicPageTitle", () => {
  it("reads the shapes a page-numbered comic uses", () => {
    // Titles taken from `Astarion and Veluthe's Infinite Adventure`, a comic
    // that numbers pages through a named arc and never uses issue numbers.
    expect(parseComicPageTitle("Prologue P.18")).toEqual({
      arc: "Prologue",
      pageNumber: 18,
    });
    expect(parseComicPageTitle("Prologue p.3 ")).toEqual({
      arc: "Prologue",
      pageNumber: 3,
    });
    expect(parseComicPageTitle("Chapter 2 — Page 7")).toEqual({
      arc: "Chapter 2",
      pageNumber: 7,
    });
    expect(parseComicPageTitle("Chapter 2, pg. 7")).toEqual({
      arc: "Chapter 2",
      pageNumber: 7,
    });
  });

  it("allows a comic that numbers pages with no arc at all", () => {
    expect(parseComicPageTitle("Page 4")).toEqual({ arc: "", pageNumber: 4 });
    expect(parseComicPageTitle("p.12")).toEqual({ arc: "", pageNumber: 12 });
  });

  it("keeps a trailing aside out of the arc", () => {
    expect(parseComicPageTitle("Prologue p.18 (end of the prologue)")).toEqual({
      arc: "Prologue",
      pageNumber: 18,
    });
  });

  it("refuses titles with no page marker", () => {
    // A trailing number with nothing marking it is prose, not a page.
    expect(parseComicPageTitle("Sonnet 18")).toBeNull();
    expect(parseComicPageTitle("COMPVEMBER 2025")).toBeNull();
    expect(parseComicPageTitle("Top 10 things I learned")).toBeNull();
    expect(parseComicPageTitle("A hiatus note")).toBeNull();
    expect(parseComicPageTitle("")).toBeNull();
    expect(parseComicPageTitle(null)).toBeNull();
  });
});

describe("parseComicTitlePart", () => {
  it("groups pages of one issue under the issue number", () => {
    expect(parseComicTitlePart("FITV #1 Cover")).toEqual({
      key: "#1",
      label: "#1",
      issueNumber: 1,
      isCover: true,
    });
    expect(parseComicTitlePart("FITV #1, Pg. 2")?.key).toBe("#1");
  });

  it("groups pages of one arc under the arc, case-insensitively", () => {
    expect(parseComicTitlePart("Prologue P.1")).toEqual({
      key: "arc:prologue",
      label: "Prologue",
      issueNumber: null,
      isCover: false,
    });
    expect(parseComicTitlePart("Prologue p.2")?.key).toBe("arc:prologue");
    expect(parseComicTitlePart("Chapter 1 p.1")?.key).toBe("arc:chapter 1");
  });

  it("prefers the issue number when a title carries both", () => {
    // Grouping `Chapter 2 #4, Pg. 1` by its chapter would fold every issue in
    // that chapter into one shelf entry.
    expect(parseComicTitlePart("Chapter 2 #4, Pg. 1")).toMatchObject({
      key: "#4",
      issueNumber: 4,
    });
  });

  it("declines a title that follows neither convention", () => {
    expect(parseComicTitlePart("A note about the hiatus")).toBeNull();
  });
});

describe("titlesLookLikeComicSequence", () => {
  it("accepts a comic with one stray announcement", () => {
    expect(
      titlesLookLikeComicSequence([
        "FITV #1 Cover",
        "FITV #1, Pg. 1",
        "FITV #1, Pg. 2",
        "FITV #2 Cover",
        "A note about the hiatus",
      ]),
    ).toBe(true);
  });

  it("accepts a comic that numbers pages instead of issues", () => {
    expect(
      titlesLookLikeComicSequence([
        "Prologue P.1 ",
        "Prologue p.2",
        "Prologue p.3 ",
        "Prologue p.4",
        "Prologue P.18",
      ]),
    ).toBe(true);
  });

  it("rejects an ordinary publication that happens to use a #", () => {
    expect(
      titlesLookLikeComicSequence([
        "On writing well",
        "Notes from #2 of a series I read",
        "Another essay",
        "One more",
      ]),
    ).toBe(false);
  });

  it("rejects a blog whose posts merely end in numbers", () => {
    expect(
      titlesLookLikeComicSequence([
        "Camgirls for Kids",
        "COMPVEMBER 2025",
        "The Death of DeviantArt",
        "Is this thing on?",
        "2025 Creative Review",
      ]),
    ).toBe(false);
  });

  it("rejects an empty archive rather than claiming a shelf", () => {
    expect(titlesLookLikeComicSequence([])).toBe(false);
  });
});

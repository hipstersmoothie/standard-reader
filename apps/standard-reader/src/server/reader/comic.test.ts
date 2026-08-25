import { describe, expect, it } from "vitest";

import type { ComicIssue } from "./comic";
import { planComicShelf } from "./comic";

/** A spine entry, with the offsets a real spine would have already worked out. */
function spine(titles: Array<string>): Array<ComicIssue> {
  return titles.map((title, index) => ({
    uri: `at://did:plc:comic/site.standard.document/${index}`,
    did: "did:plc:comic",
    rkey: String(index),
    title,
    publishedAt: new Date(index * 1000).toISOString(),
    pageCount: 1,
    pageOffset: index,
  }));
}

/** What each shelf entry ended up standing for, as titles. */
function laidOut(issues: Array<ComicIssue>): Array<Array<string>> {
  return planComicShelf(issues).groups.map((group) =>
    group.pages.map((page) => page.issue.title),
  );
}

describe("planComicShelf", () => {
  it("collapses issue-numbered pages into one entry per issue", () => {
    const plan = planComicShelf(
      spine([
        "FITV #1 Cover",
        "FITV #1, Pg. 1",
        "FITV #1, Pg. 2",
        "FITV #2 Cover",
        "FITV #2, Pg. 1",
      ]),
    );
    expect(plan.mode).toBe("issues");
    expect(plan.groups.map((group) => group.issueNumber)).toEqual([1, 2]);
    expect(plan.groups.map((group) => group.pages.length)).toEqual([3, 2]);
    // The page that says it's the cover is the one that fronts the issue.
    expect(plan.groups[0]?.pages.map((page) => page.isCover)).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("keeps a card per post when the titles carry no issue number", () => {
    // A comic that names its pages `Pg01`, `Pg02` is not broken — it just has
    // no issues to collapse, so every page keeps its own cover.
    const plan = planComicShelf(spine(["Pg01", "Pg02"]));
    expect(plan.mode).toBe("pages");
    expect(laidOut(spine(["Pg01", "Pg02"]))).toEqual([["Pg01"], ["Pg02"]]);
    expect(plan.groups.every((group) => group.issueNumber == null)).toBe(true);
  });

  it("shelves a comic whose pages all belong to one issue", () => {
    // One entry is still a shelf: "read issue #1" beats a column of its pages.
    const plan = planComicShelf(
      spine(["Astarion #1 Cover", "Astarion #1, Pg. 1"]),
    );
    expect(plan.mode).toBe("issues");
    expect(plan.groups).toHaveLength(1);
    expect(plan.groups[0]?.issueNumber).toBe(1);
  });

  it("keeps a stray untitled page inside the issue it sits in", () => {
    // One post off-convention is not enough to lose the grouping (4 of 5 parse,
    // over `ISSUE_TITLE_MATCH_SHARE`), and the odd one joins the issue it sits
    // inside rather than splitting it.
    expect(
      laidOut(
        spine([
          "FITV #1 Cover",
          "FITV #1, Pg. 1",
          "An announcement",
          "FITV #2 Cover",
          "FITV #2, Pg. 1",
        ]),
      ),
    ).toEqual([
      ["FITV #1 Cover", "FITV #1, Pg. 1", "An announcement"],
      ["FITV #2 Cover", "FITV #2, Pg. 1"],
    ]);
  });

  it("has nothing to lay out for a comic with no pages", () => {
    const plan = planComicShelf([]);
    expect(plan.groups).toEqual([]);
    expect(plan.mode).toBe("pages");
  });
});

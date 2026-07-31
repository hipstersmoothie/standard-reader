import { describe, expect, it } from "vitest";

import { comicNoteParagraphs, comicPageNote } from "./page-note";

describe("comicNoteParagraphs", () => {
  it("splits on the blank line the extractors join blocks with", () => {
    expect(comicNoteParagraphs("One.\n\nTwo.\n\n\nThree.")).toEqual([
      "One.",
      "Two.",
      "Three.",
    ]);
  });

  it("keeps a soft line break inside its paragraph", () => {
    expect(comicNoteParagraphs("A line\nand its wrap")).toEqual([
      "A line\nand its wrap",
    ]);
  });

  it("has nothing to render for a page with no note", () => {
    expect(comicNoteParagraphs(null)).toEqual([]);
    expect(comicNoteParagraphs("   \n\n  ")).toEqual([]);
  });
});

describe("comicPageNote", () => {
  const alt = "Ilya stands in the doorway, backlit.";

  it("drops the alt text of the page it is describing", () => {
    expect(comicPageNote(`${alt}\n\nBack next Tuesday.`, [{ alt }])).toBe(
      "Back next Tuesday.",
    );
  });

  it("ignores how the alt was whitespaced", () => {
    const spaced = "Ilya stands   in the\ndoorway, backlit.";
    expect(comicPageNote(`${spaced}\n\nBack next Tuesday.`, [{ alt }])).toBe(
      "Back next Tuesday.",
    );
  });

  it("subtracts every page's alt from a post that carries several", () => {
    const body = `${alt}\n\nSecond panel.\n\nThanks for reading.`;
    const images = [{ alt }, { alt: "Second panel." }];
    expect(comicPageNote(body, images)).toBe("Thanks for reading.");
  });

  it("comes back null when the post is art and nothing else", () => {
    expect(comicPageNote(alt, [{ alt }])).toBeNull();
    expect(comicPageNote(null, [{ alt }])).toBeNull();
    expect(comicPageNote("", [])).toBeNull();
  });

  it("keeps a note whole when the images carry no alt at all", () => {
    expect(comicPageNote("Back next Tuesday.", [{ alt: "" }])).toBe(
      "Back next Tuesday.",
    );
  });

  it("keeps the remaining paragraphs in order", () => {
    const body = `${alt}\n\nOne.\n\nTwo.`;
    expect(comicPageNote(body, [{ alt }])).toBe("One.\n\nTwo.");
  });
});

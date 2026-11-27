import { describe, expect, it } from "vitest";

import {
  LEAFLET_BLOCK,
  LEAFLET_CONTENT,
  LEAFLET_PAGE,
} from "#/lib/leaflet/types";
import { PCKT_BLOCK, PCKT_CONTENT } from "#/lib/pckt/types";

import {
  articleHeadingOutline,
  buildHeadingOutline,
  headingAnchorSlug,
} from "./heading-outline";
import { STANDARD_MARKDOWN_CONTENT } from "./structured-content/types";

const levelsAndTexts = (outline: ReturnType<typeof articleHeadingOutline>) =>
  outline.map(({ level, text }) => [level, text]);

describe("headingAnchorSlug", () => {
  it("lowercases, drops punctuation and hyphenates whitespace", () => {
    expect(headingAnchorSlug("  What's New in v2.0?  ")).toBe(
      "whats-new-in-v20",
    );
    expect(headingAnchorSlug("Part 1 — The Beginning")).toBe(
      "part-1-the-beginning",
    );
  });

  it("keeps letters from every script", () => {
    expect(headingAnchorSlug("はじめに")).toBe("はじめに");
    expect(headingAnchorSlug("Ünïcödé Straße")).toBe("ünïcödé-straße");
  });

  it("falls back when nothing survives", () => {
    expect(headingAnchorSlug("!!!")).toBe("section");
    expect(headingAnchorSlug("🎉")).toBe("section");
  });

  it("caps the length without leaving a trailing hyphen", () => {
    const slug = headingAnchorSlug(`${"a".repeat(63)} b`);
    expect(slug.length).toBeLessThanOrEqual(64);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("buildHeadingOutline", () => {
  it("suffixes repeated slugs so every id is unique", () => {
    const outline = buildHeadingOutline([
      { level: 2, text: "Notes" },
      { level: 2, text: "Notes" },
      { level: 3, text: "notes!" },
    ]);
    expect(outline.map((entry) => entry.id)).toEqual([
      "notes",
      "notes-2",
      "notes-3",
    ]);
  });

  it("drops empty headings, normalizes whitespace and clamps levels", () => {
    const outline = buildHeadingOutline([
      { level: 0, text: "Top" },
      { level: 2, text: "   " },
      { level: 9, text: "Deep\n  down" },
      { text: "No level" },
    ]);
    expect(levelsAndTexts(outline)).toEqual([
      [1, "Top"],
      [6, "Deep down"],
      [2, "No level"],
    ]);
  });
});

function leafletDoc(
  blocks: Array<Record<string, unknown>>,
  pageType: string = LEAFLET_PAGE.linearDocument,
) {
  return {
    $type: LEAFLET_CONTENT,
    pages: [{ $type: pageType, blocks: blocks.map((block) => ({ block })) }],
  };
}

describe("articleHeadingOutline", () => {
  it("reads Leaflet header blocks", () => {
    const content = leafletDoc([
      { $type: LEAFLET_BLOCK.header, level: 1, plaintext: "Intro" },
      { $type: LEAFLET_BLOCK.text, plaintext: "Body" },
      { $type: LEAFLET_BLOCK.header, level: 2, plaintext: "Details" },
    ]);
    expect(
      levelsAndTexts(articleHeadingOutline({ contentJson: content })),
    ).toEqual([
      [1, "Intro"],
      [2, "Details"],
    ]);
  });

  it("reads pckt headings and drops one that repeats the dek", () => {
    const content = {
      $type: PCKT_CONTENT,
      items: [
        { $type: PCKT_BLOCK.heading, level: 1, plaintext: "The dek" },
        { $type: PCKT_BLOCK.heading, level: 2, plaintext: "First" },
        { $type: PCKT_BLOCK.text, plaintext: "Body" },
        { $type: PCKT_BLOCK.heading, level: 2, plaintext: "Second" },
      ],
    };
    expect(
      levelsAndTexts(
        articleHeadingOutline({ contentJson: content, description: "The dek" }),
      ),
    ).toEqual([
      [2, "First"],
      [2, "Second"],
    ]);
  });

  it("reads markdown headings h1–h6", () => {
    const content = {
      $type: STANDARD_MARKDOWN_CONTENT,
      text: [
        "# One",
        "para",
        "## Two **bold**",
        "### Three",
        "#### Four",
        "##### Five",
        "###### Six",
      ].join("\n\n"),
    };
    expect(
      levelsAndTexts(articleHeadingOutline({ contentJson: content })),
    ).toEqual([
      [1, "One"],
      [2, "Two bold"],
      [3, "Three"],
      [4, "Four"],
      [5, "Five"],
      [6, "Six"],
    ]);
  });

  it("uses contentFormat when the payload carries no $type", () => {
    const outline = articleHeadingOutline({
      contentFormat: STANDARD_MARKDOWN_CONTENT,
      contentJson: { text: "## Only\n\ntext" },
    });
    expect(levelsAndTexts(outline)).toEqual([[2, "Only"]]);
  });

  it("reads sanitized HTML headings", () => {
    const content = {
      $type: "org.wordpress.html",
      html: [
        "<h2>Getting <em>started</em></h2>",
        "<p>Hello</p>",
        "<section><h3>Nested</h3></section>",
        "<script><h2>never</h2></script>",
      ].join(""),
    };
    expect(
      levelsAndTexts(articleHeadingOutline({ contentJson: content })),
    ).toEqual([
      [2, "Getting started"],
      [3, "Nested"],
    ]);
  });

  it("returns nothing for formats no renderer claims", () => {
    expect(
      articleHeadingOutline({ contentJson: { $type: "com.example.nope" } }),
    ).toEqual([]);
    expect(articleHeadingOutline({ contentJson: null })).toEqual([]);
  });
});

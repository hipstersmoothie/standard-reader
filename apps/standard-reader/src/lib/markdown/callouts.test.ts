import { describe, expect, it } from "vitest";

import { parseCalloutMarker } from "./callouts";

describe("parseCalloutMarker", () => {
  it("parses a plain GFM marker and derives the label", () => {
    const marker = parseCalloutMarker("[!NOTE]\nBody");
    expect(marker).toMatchObject({
      type: "note",
      kind: "note",
      collapsible: false,
      title: "Note",
    });
    // The match consumes the marker line including its trailing newline.
    expect("[!NOTE]\nBody".slice(marker?.matchLength ?? 0)).toBe("Body");
  });

  it("lowercases the type keyword", () => {
    expect(parseCalloutMarker("[!Warning]")?.type).toBe("warning");
    expect(parseCalloutMarker("[!warning]")?.kind).toBe("warning");
  });

  it("maps GFM aliases to GitHub's colors", () => {
    // GitHub renders `important` purple and `caution` red.
    expect(parseCalloutMarker("[!IMPORTANT]")?.kind).toBe("example");
    expect(parseCalloutMarker("[!CAUTION]")?.kind).toBe("danger");
  });

  it("reads an Obsidian collapse indicator and custom title", () => {
    const collapsed = parseCalloutMarker("[!tip]- Custom title\nBody");
    expect(collapsed).toMatchObject({
      type: "tip",
      kind: "tip",
      collapsible: true,
      defaultOpen: false,
      title: "Custom title",
    });

    const expanded = parseCalloutMarker("[!tip]+ Open me");
    expect(expanded).toMatchObject({
      collapsible: true,
      defaultOpen: true,
      title: "Open me",
    });
  });

  it("falls back to a note-styled callout titled after the keyword", () => {
    const marker = parseCalloutMarker("[!custom]");
    expect(marker?.kind).toBe("note");
    // The keyword itself is preserved and title-cased as the header.
    expect(marker?.type).toBe("custom");
    expect(marker?.title).toBe("Custom");
  });

  it("returns null when the text does not open with a marker", () => {
    expect(parseCalloutMarker("Just a normal quote")).toBeNull();
    expect(parseCalloutMarker("Text [!NOTE] mid-line")).toBeNull();
  });
});

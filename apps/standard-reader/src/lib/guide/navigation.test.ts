import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { GUIDE_SHOTS } from "./screenshots";

/**
 * The guide's sidebar, "On this page" rail, mobile jump menu, and scroll-spy
 * are all generated from `GUIDE_SECTIONS`, but the anchors themselves live on
 * the page components. Nothing at compile time ties the two together, so these
 * tests do: a heading renamed on a page without updating the nav (or the other
 * way round) is a dead link in three places at once.
 *
 * `navigation.ts` is read as source rather than imported — it uses the Lingui
 * `msg` macro, which the app's Vite config compiles away but the shared Vitest
 * config does not. The labels are not what is being checked here; the ids are.
 */

const GUIDE_LIB_DIR = import.meta.dirname;
const PAGES_DIR = path.join(GUIDE_LIB_DIR, "../../components/guide/pages");

const navigationSource = readFileSync(
  path.join(GUIDE_LIB_DIR, "navigation.ts"),
  "utf8",
);

/** Area keys, in sidebar order, from the `GUIDE_AREAS` entries. */
const AREAS = [...navigationSource.matchAll(/^\s{4}area: "([a-z-]+)",$/gm)]
  .map((match) => match[1])
  .filter((area): area is string => area != null);

/** `GUIDE_SECTIONS` as `{ [area]: sectionIds }`, parsed from the same source. */
const SECTIONS: Record<string, Array<string>> = {};
{
  const body = navigationSource.slice(
    navigationSource.indexOf("export const GUIDE_SECTIONS"),
  );
  for (const block of body.matchAll(
    /^ {2}"?([a-z-]+)"?: \[$([\s\S]*?)^ {2}\],$/gm,
  )) {
    const area = block[1];
    if (area == null) continue;
    SECTIONS[area] = [...(block[2] ?? "").matchAll(/\bid: "([a-z\d-]+)"/g)]
      .map((match) => match[1])
      .filter((id): id is string => id != null);
  }
}

/** `welcome` → `welcome-guide-page.tsx`, matching the route components. */
function pageSourceFor(area: string): string {
  return readFileSync(path.join(PAGES_DIR, `${area}-guide-page.tsx`), "utf8");
}

describe("guide navigation", () => {
  it("parses the areas and sections it is about to check", () => {
    expect(AREAS.length).toBeGreaterThan(1);
    expect(Object.keys(SECTIONS).toSorted()).toEqual(AREAS.toSorted());
    for (const area of AREAS) {
      expect(SECTIONS[area]?.length, area).toBeGreaterThan(0);
    }
  });

  it("has a page component for every area", () => {
    for (const area of AREAS) {
      expect(() => pageSourceFor(area), area).not.toThrow();
    }
  });

  it("renders an anchor for every declared section", () => {
    for (const area of AREAS) {
      const source = pageSourceFor(area);
      for (const id of SECTIONS[area] ?? []) {
        expect(source, `${area}: no heading with id="${id}"`).toContain(
          `id="${id}"`,
        );
      }
    }
  });

  it("declares every anchor a page renders", () => {
    for (const area of AREAS) {
      const source = pageSourceFor(area);
      const declared = new Set(SECTIONS[area] ?? []);
      for (const match of source.matchAll(/\bid="([a-z\d-]+)"/g)) {
        const id = match[1];
        // The mobile jump select owns its own id; only headings are anchors.
        if (id == null || id.endsWith("-jump-nav")) continue;
        expect(
          declared.has(id),
          `${area}: id="${id}" is not in GUIDE_SECTIONS`,
        ).toBe(true);
      }
    }
  });

  it("only references screenshots that are declared", () => {
    const shotIds = new Set<string>(GUIDE_SHOTS.map((shot) => shot.id));

    for (const area of AREAS) {
      for (const match of pageSourceFor(area).matchAll(/shot="([a-z\d-]+)"/g)) {
        expect(
          shotIds.has(match[1] ?? ""),
          `${area}: unknown screenshot "${match[1]}"`,
        ).toBe(true);
      }
    }
  });

  it("gives every screenshot alt text", () => {
    for (const area of AREAS) {
      for (const figure of pageSourceFor(area).matchAll(
        /<GuideFigure\b[\s\S]*?\/>/g,
      )) {
        expect(figure[0], `${area}: a <GuideFigure> has no alt text`).toMatch(
          /\balt=/,
        );
      }
    }
  });
});

describe("guide screenshots", () => {
  it("has unique ids", () => {
    const ids = GUIDE_SHOTS.map((shot) => shot.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("captures at least the light scheme for every shot", () => {
    for (const shot of GUIDE_SHOTS) {
      expect(shot.schemes, shot.id).toContain("light");
    }
  });
});

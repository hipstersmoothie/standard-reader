import { describe, expect, it } from "vitest";

import { customPaletteVars } from "./appearance-vars";
import { publicationThemeScaleVars } from "./publication-theme-scale";

const LIGHT_PAPER = "#fcfaf5";
/** Pale sand — about 1.2:1 against the paper above, well under AA. */
const PALE_ACCENT = "#f0d0a0";

function vars(paper: string, accent: string): Record<string, string> {
  return customPaletteVars(paper, accent) as Record<string, string>;
}

describe("the reader's own palette", () => {
  it("keeps the accent they picked, however little contrast it has", () => {
    expect(vars(LIGHT_PAPER, PALE_ACCENT)["--sr-accent-solid1-light"]).toBe(
      PALE_ACCENT,
    );
  });

  /**
   * The same colors handed to us by a publication still get the substitution —
   * a stranger's site shouldn't be able to grey out our chrome. This is the
   * contrast that makes the reader-facing behaviour a deliberate choice rather
   * than a hole in the color science.
   */
  it("still substitutes a low-contrast accent for a publication theme", () => {
    const publication = publicationThemeScaleVars({
      themeBackground: LIGHT_PAPER,
      themeForeground: "#241f1b",
      themeAccent: PALE_ACCENT,
      themeAccentForeground: null,
    }) as Record<string, string>;
    expect(publication["--pub-accent-solid1-light"]).not.toBe(PALE_ACCENT);
  });

  it("keeps a strong accent verbatim too", () => {
    expect(vars(LIGHT_PAPER, "#ad7f58")["--sr-accent-solid1-light"]).toBe(
      "#ad7f58",
    );
  });

  it("derives warm ink for warm paper rather than snapping to black", () => {
    const ink = vars("#1b1512", "#e0703a")["--sr-text2-dark"];
    expect(ink).not.toBe("#ffffff");
    // Warm: red channel ahead of blue.
    const [r, , b] = [
      Number.parseInt(ink.slice(1, 3), 16),
      Number.parseInt(ink.slice(3, 5), 16),
      Number.parseInt(ink.slice(5, 7), 16),
    ];
    expect(r).toBeGreaterThan(b);
  });

  it("routes a dark paper to the dark scheme", () => {
    expect(vars("#1b1512", "#e0703a")["--sr-bg-dark"]).toBe("#1b1512");
  });
});

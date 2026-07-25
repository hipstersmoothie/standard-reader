import Color from "colorjs.io";
import type { ThemeRegistrationAny } from "shiki";
import { bundledThemes, bundledThemesInfo } from "shiki";
import { describe, expect, it } from "vitest";

import { pickCodeTheme } from "./match-theme";

const typeById = new Map(bundledThemesInfo.map((t) => [t.id, t.type]));

describe("pickCodeTheme", () => {
  it("returns null without an accent to match on", async () => {
    // The accent carries the publication's character; without it any theme is
    // as good as the editorial one we already ship.
    await expect(
      pickCodeTheme(
        { background: "#ffffff", foreground: "#111111", accent: null },
        "light",
      ),
    ).resolves.toBeNull();
  });

  it("only ever picks a theme matching the requested scheme", async () => {
    const target = {
      background: "#1f150c",
      foreground: "#e1dcc9",
      accent: "#412d15",
    };
    for (const scheme of ["light", "dark"] as const) {
      const picked = await pickCodeTheme(target, scheme);
      expect(picked).toBeTruthy();
      expect(typeById.get(picked as string)).toBe(scheme);
    }
  });

  it("picks different themes for meaningfully different accents", async () => {
    const warm = await pickCodeTheme(
      { background: "#1f150c", foreground: "#e1dcc9", accent: "#412d15" },
      "dark",
    );
    const cool = await pickCodeTheme(
      { background: "#eef5ff", foreground: "#1a3a5c", accent: "#5eb5ec" },
      "dark",
    );
    expect(warm).not.toBe(cool);
  });

  it("keeps the code panel close to the page background", async () => {
    // A code block is mostly background, so a theme whose surface disagrees with
    // the page reads as a foreign panel however well its accent matches. This
    // regressed once: a teal accent on a near-white page picked cream
    // `gruvbox-light-hard` (#f9f5d7) purely on accent similarity.
    const pageBackground = "#fdfcfa";
    const picked = await pickCodeTheme(
      { background: pageBackground, foreground: "#292929", accent: "#2b7882" },
      "light",
    );
    expect(picked).toBeTruthy();
    const loaded = await bundledThemes[picked as keyof typeof bundledThemes]();
    const theme =
      (loaded as { default?: ThemeRegistrationAny }).default ?? loaded;
    const themeBackground = (theme as ThemeRegistrationAny).colors?.[
      "editor.background"
    ];
    expect(themeBackground).toBeTruthy();
    const delta = new Color(pageBackground).deltaEOK(
      new Color(themeBackground as string),
    );
    expect(delta).toBeLessThanOrEqual(0.035);
  });

  it("survives an unparseable colour rather than throwing", async () => {
    await expect(
      pickCodeTheme(
        { background: "not-a-color", foreground: null, accent: "#65a30d" },
        "light",
      ),
    ).resolves.toBeTruthy();
  });
});

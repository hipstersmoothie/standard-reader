import { describe, expect, it } from "vitest";

import { publicationThemeScaleVars } from "./publication-theme-scale";

const BASE = {
  themeBackground: "#ffffff",
  themeForeground: "#0d0d0d",
  themeAccent: "#2b52ff",
  themeAccentForeground: "#ffffff",
};

function vars(input: Parameters<typeof publicationThemeScaleVars>[0]) {
  return publicationThemeScaleVars(input) as unknown as Record<string, string>;
}

describe("publicationThemeScaleVars neutral anchors", () => {
  it("leaves the derived scale untouched when the publisher states nothing", () => {
    // The `basicTheme`-only path must not shift — most publications are here.
    const withoutAnchors = vars(BASE);
    const withNullAnchors = vars({
      ...BASE,
      surface: null,
      surfaceHover: null,
      border: null,
    });
    expect(withNullAnchors).toEqual(withoutAnchors);
  });

  it("pins a stated surface and border exactly onto their steps", () => {
    const v = vars({ ...BASE, surface: "#fafafa", border: "#e5e5e5" });
    // Offprint's base200 -> component1, base300 -> border1, verbatim.
    expect(v["--pub-component1-light"]).toBe("#fafafa");
    expect(v["--pub-border1-light"]).toBe("#e5e5e5");
  });

  it("pins a stated hover fill onto the hover step, not the resting one", () => {
    const v = vars({ ...BASE, surfaceHover: "#a7f3d0" });
    expect(v["--pub-component2-light"]).toBe("#a7f3d0");
    // The resting surface stays a subtle derivation off the background.
    expect(v["--pub-component1-light"]).not.toBe("#a7f3d0");
  });

  it("interpolates the steps between two anchors", () => {
    const v = vars({ ...BASE, surface: "#f0f0f0", border: "#d0d0d0" });
    const between = v["--pub-component3-light"];
    // component3 sits between component1 (#f0f0f0) and border1 (#d0d0d0).
    expect(between < "#f0f0f0").toBe(true);
    expect(between > "#d0d0d0").toBe(true);
  });

  it("keeps the ramp monotonic across anchored and derived steps", () => {
    const v = vars({ ...BASE, surface: "#fafafa", border: "#e5e5e5" });
    const order = [
      "--pub-bgSubtle-light",
      "--pub-component1-light",
      "--pub-component2-light",
      "--pub-component3-light",
      "--pub-border1-light",
      "--pub-border2-light",
      "--pub-border3-light",
    ].map((k) => Number.parseInt(v[k].slice(1, 3), 16));
    // On a light background each step must get progressively darker.
    for (let i = 1; i < order.length; i += 1) {
      expect(order[i]).toBeLessThanOrEqual(order[i - 1]);
    }
  });

  it("routes a dark stated background to dark mode, not light", () => {
    // A publication authored on black (Leaflet on a black canvas, a dark-scheme
    // Offprint theme). Painting that into light mode gave the reader a dark page
    // *and* a ramp derived by darkening near-black, which collapsed every step.
    const v = vars({
      ...BASE,
      themeBackground: "#1f150c",
      themeForeground: "#e1dcc9",
    });
    expect(v["--pub-bg-dark"]).toBe("#1f150c");
    // Light mode is synthesized by mirroring their colour through OKLCH, so it
    // keeps the warm hue rather than dropping to generic near-white.
    const lightBg = v["--pub-bg-light"];
    expect(lightBg).not.toBe("#1f150c");
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(lightBg.slice(i, i + 2), 16),
    );
    expect(r).toBeGreaterThan(230); // light…
    expect(r).toBeGreaterThan(b); // …and still warm, like their own palette.
    expect(g).toBeGreaterThan(b);
    // Ink is mirrored from their text colour: dark enough to read, not flat black.
    const ink = v["--pub-text2-light"];
    expect(Number.parseInt(ink.slice(1, 3), 16)).toBeLessThan(80);
  });

  it("keeps the neutral steps separated for a dark publication", () => {
    const v = vars({
      ...BASE,
      themeBackground: "#1f150c",
      themeForeground: "#e1dcc9",
    });
    for (const mode of ["light", "dark"]) {
      const channel = (key: string) =>
        Number.parseInt(v[`--pub-${key}-${mode}`].slice(1, 3), 16);
      // Borders must be visibly distinct from the page, not the ~1-unit
      // difference the collapsed ramp used to produce.
      expect(Math.abs(channel("border1") - channel("bg"))).toBeGreaterThan(16);
      expect(Math.abs(channel("component1") - channel("bg"))).toBeGreaterThan(
        4,
      );
    }
  });

  it("leaves a light publication's own background in light mode", () => {
    const v = vars({ ...BASE, themeBackground: "#f0f2f2" });
    expect(v["--pub-bg-light"]).toBe("#f0f2f2");
  });

  it("ignores stated light anchors when the background is dark", () => {
    // Those anchors describe dark surfaces; applying them to the substituted
    // light page would reintroduce the unreadable ramp.
    const v = vars({
      ...BASE,
      themeBackground: "#0a0a0a",
      themeForeground: "#fafafa",
      surface: "#171717",
      border: "#262626",
    });
    expect(v["--pub-component1-light"]).not.toBe("#171717");
    expect(v["--pub-border1-light"]).not.toBe("#262626");
    // They anchor the dark ramp instead, where they belong.
    expect(v["--pub-component1-dark"]).toBe("#171717");
    expect(v["--pub-border1-dark"]).toBe("#262626");
  });

  it("anchors the dark ramp from the authored dark palette", () => {
    const v = vars({
      ...BASE,
      dark: {
        background: "#022c22",
        foreground: "#d1fae5",
        accent: "#84cc16",
        accentForeground: null,
        surface: null,
        surfaceHover: "#064e3b",
        border: null,
        link: null,
        neutral: null,
        secondary: null,
      },
    });
    expect(v["--pub-bg-dark"]).toBe("#022c22");
    expect(v["--pub-component2-dark"]).toBe("#064e3b");
  });

  it("emits no link var when the publisher states none", () => {
    // `publicationLink` then falls back to the accent's text step, which is what
    // links used before the token existed.
    const v = vars(BASE);
    expect(v["--pub-link-light"]).toBeUndefined();
    expect(v["--pub-link-dark"]).toBeUndefined();
  });

  it("uses a stated link colour instead of the accent", () => {
    const v = vars({ ...BASE, link: "#0d9488" });
    // Teal is kept (a nudge darker to clear AA on white), and is nowhere near
    // the blue accent — the two are genuinely separate.
    const link = v["--pub-link-light"];
    const [r, g, b] = [1, 3, 5].map((i) =>
      Number.parseInt(link.slice(i, i + 2), 16),
    );
    expect(g).toBeGreaterThan(r);
    expect(b).toBeGreaterThan(r);
    expect(g).toBeGreaterThan(b); // teal, not blue
    expect(v["--pub-accent-solid1-light"]).toBe("#2b52ff");
  });

  it("forces a stated link to stay readable on the page", () => {
    // A link colour chosen for the publisher's own surface can be unreadable on
    // a synthesized one; contrast wins over fidelity.
    const v = vars({ ...BASE, themeBackground: "#ffffff", link: "#fbfbfb" });
    expect(v["--pub-link-light"]).not.toBe("#fbfbfb");
  });

  it("takes the link from the authored dark palette in dark mode", () => {
    const v = vars({
      ...BASE,
      link: "#0d9488",
      dark: {
        background: "#022c22",
        foreground: "#d1fae5",
        accent: "#84cc16",
        accentForeground: null,
        surface: null,
        surfaceHover: null,
        border: null,
        link: "#5eead4",
        neutral: null,
        secondary: null,
      },
    });
    // Light keeps the light palette's teal; dark takes the authored one.
    expect(v["--pub-link-light"]).not.toBe(v["--pub-link-dark"]);
    expect(v["--pub-link-dark"]).toBe("#5eead4");
  });

  it("uses a stated neutral for the solid fill", () => {
    const derived = vars(BASE);
    const v = vars({ ...BASE, neutral: "#0d0d0d" });
    expect(v["--pub-solid1-light"]).toBe("#0d0d0d");
    expect(v["--pub-solid1-light"]).not.toBe(derived["--pub-solid1-light"]);
  });

  it("ignores light-mode anchors when building a derived dark scale", () => {
    // Light anchors describe light surfaces; reusing them on a dark ramp would
    // wash it out. Only an authored dark palette may anchor dark.
    const anchored = vars({ ...BASE, surface: "#fafafa", border: "#e5e5e5" });
    const plain = vars(BASE);
    expect(anchored["--pub-component1-dark"]).toBe(
      plain["--pub-component1-dark"],
    );
  });
});

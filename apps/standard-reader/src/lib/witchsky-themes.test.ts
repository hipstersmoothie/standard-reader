import { describe, expect, it } from "vitest";

import { palettesFromRecords, palettesFromTheme } from "./witchsky-themes";

const THEME_URI = "at://did:plc:reader/app.witchsky.theme.colors/3mvpzxkrbms25";

/** Trimmed from a real record — only the colors we read are kept. */
const COFFEE = {
  $type: "app.witchsky.theme.colors",
  name: "Coffee / Espresso",
  mode: "light",
  base: {
    name: "Default",
    colors: { canvas: "#1c1310", accent: "#d4975c", text: "#f4deb8" },
  },
  variants: [
    { name: "Light", colors: { canvas: "#f7f2e9", accent: "#a55a1f" } },
    { name: "Dark", colors: { canvas: "#050505" } },
  ],
};

describe("palettesFromTheme", () => {
  it("maps canvas to paper and accent to accent, base then variants", () => {
    expect(palettesFromTheme(THEME_URI, COFFEE)).toEqual([
      {
        id: `${THEME_URI}#base`,
        name: "Coffee / Espresso",
        paper: "#1c1310",
        accent: "#d4975c",
      },
      {
        id: `${THEME_URI}#0`,
        name: "Coffee / Espresso · Light",
        paper: "#f7f2e9",
        accent: "#a55a1f",
      },
      {
        id: `${THEME_URI}#1`,
        name: "Coffee / Espresso · Dark",
        paper: "#050505",
        // Not overridden by the variant, so it falls through to base.
        accent: "#d4975c",
      },
    ]);
  });

  it("normalizes hex to lowercase #rrggbb", () => {
    const [palette] = palettesFromTheme(THEME_URI, {
      name: "Loud",
      base: {
        name: "Default",
        colors: { canvas: "#ABC", accent: "#C32FD0FF" },
      },
    });
    expect(palette).toMatchObject({ paper: "#aabbcc", accent: "#c32fd0" });
  });

  it("skips themes whose base colors are not hex", () => {
    expect(
      palettesFromTheme(THEME_URI, {
        name: "Named",
        base: { name: "Default", colors: { canvas: "rebeccapurple" } },
      }),
    ).toEqual([]);
    expect(palettesFromTheme(THEME_URI, null)).toEqual([]);
  });

  it("hides Material You themes, whose stored colors are only an example", () => {
    expect(
      palettesFromTheme(THEME_URI, {
        ...COFFEE,
        special: {
          $type: "app.witchsky.theme.defs#materialYou",
          accent: "#c97e5a",
        },
      }),
    ).toEqual([]);
  });
});

describe("palettesFromRecords", () => {
  it("drops a saved copy of the reader's own theme", () => {
    const palettes = palettesFromRecords(
      [{ uri: THEME_URI, value: COFFEE }],
      [
        {
          uri: "at://did:plc:reader/app.witchsky.theme.saved/3mvq577vskk2h",
          value: { subject: { uri: THEME_URI }, snapshot: COFFEE },
        },
      ],
    );
    expect(palettes).toHaveLength(3);
  });

  it("reads saved themes from their snapshot", () => {
    const subject =
      "at://did:plc:author/app.witchsky.theme.colors/3mug7d56zc72i";
    const palettes = palettesFromRecords(
      [],
      [
        {
          uri: "at://did:plc:reader/app.witchsky.theme.saved/3mvpzp34ct225",
          value: {
            subject: { uri: subject },
            snapshot: {
              name: "Pear",
              base: {
                name: "Pear",
                colors: { canvas: "#fbfaed", accent: "#557a42" },
              },
            },
          },
        },
      ],
    );
    expect(palettes).toEqual([
      {
        id: `${subject}#base`,
        name: "Pear",
        paper: "#fbfaed",
        accent: "#557a42",
      },
    ]);
  });
});

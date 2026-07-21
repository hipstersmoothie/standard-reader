import type { Font } from "satori";

import { loadOgFonts } from "#/server/og/fonts";
import { loadGoogleFontFaces } from "#/server/og/google-font";

export interface CollectionOgFontRoles {
  sans: string;
  serif: string;
  title: string;
  mono: string;
}

/** Magazine cover font roles + satori font payloads for a collection theme. */
export async function loadCollectionOgFonts(input: {
  fontTitle: string | null;
  fontBody: string | null;
}): Promise<{ roles: CollectionOgFontRoles; fonts: Array<Font> }> {
  const titleFamily = input.fontTitle?.trim() || "Newsreader";
  const bodyFamily = input.fontBody?.trim() || "Newsreader";

  const [base, titleFaces, bodyFaces] = await Promise.all([
    loadOgFonts(),
    titleFamily === "Newsreader"
      ? Promise.resolve([])
      : loadGoogleFontFaces(titleFamily, {
          weights: [400, 600, 700],
          styles: ["normal", "italic"],
        }),
    bodyFamily === "Newsreader" || bodyFamily === titleFamily
      ? Promise.resolve([])
      : loadGoogleFontFaces(bodyFamily, { weights: [400, 600] }),
  ]);

  const fonts = [...base, ...titleFaces, ...bodyFaces];

  return {
    roles: {
      sans: "Atkinson Hyperlegible Next",
      serif: bodyFamily,
      title: titleFamily,
      mono: "Atkinson Hyperlegible Next",
    },
    fonts,
  };
}

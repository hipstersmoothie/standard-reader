import { Resvg } from "@resvg/resvg-js";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

/** Rasterize a Satori SVG to PNG at OG dimensions. */
export function renderOgPng(svg: string, width: number = OG_WIDTH): Uint8Array {
  const resvg = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: {
      loadSystemFonts: false,
    },
  });

  return resvg.render().asPng();
}

import type { Font, SatoriOptions } from "satori";

import { loadAppleEmojiAsset } from "#/server/og/emoji";
import { loadFallbackFonts } from "#/server/og/fallback-font";

/**
 * Satori asset hook shared by all OG cards: emoji resolve to Apple-style PNGs,
 * everything else (scripts/symbols the bundled latin fonts can't draw) gets a
 * per-segment Noto fallback face.
 */
async function loadOgAsset(
  code: string,
  segment: string,
): Promise<string | Array<Font> | undefined> {
  if (code === "emoji") {
    return loadAppleEmojiAsset(code, segment);
  }
  return loadFallbackFonts(code, segment);
}

export function ogSatoriOptions(
  fonts: Array<Font>,
  size: { width: number; height: number },
): SatoriOptions {
  return {
    width: size.width,
    height: size.height,
    fonts,
    loadAdditionalAsset: loadOgAsset as NonNullable<
      SatoriOptions["loadAdditionalAsset"]
    >,
  };
}

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
    /**
     * Fresh array per render. Satori keeps its font loader in a WeakMap keyed
     * by this array and appends every `loadAdditionalAsset` fallback face to
     * it, never removing them — handing it the process-lifetime array from
     * `loadOgFonts()` grew that loader with every CJK/symbol segment ever
     * rendered. A copy scopes the loader (and its fallbacks) to one render;
     * the font buffers are shared, so satori's parse cache still hits.
     */
    fonts: [...fonts],
    loadAdditionalAsset: loadOgAsset as NonNullable<
      SatoriOptions["loadAdditionalAsset"]
    >,
  };
}

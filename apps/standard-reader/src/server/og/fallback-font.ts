import type { Font } from "satori";

import { loadGoogleFontSubset } from "#/server/og/google-font";

/**
 * Glyph-fallback fonts for satori. The bundled Newsreader/Atkinson faces are
 * latin-subset only, so any other script (CJK, Cyrillic, Arabic, symbols…) in
 * user-authored text renders as tofu. When satori hits a segment its fonts
 * can't draw, it calls `loadAdditionalAsset(languageCode, segment)` — for
 * non-emoji codes we answer with a Noto face subsetted to just that segment's
 * glyphs via the Google Fonts `text=` parameter.
 *
 * The language-code → Noto family table mirrors @vercel/og's `languageFontMap`
 * (satori emits exactly these codes from its script detection). Codes can
 * arrive pipe-joined when a segment matches several candidate scripts, e.g.
 * `ja-JP|zh-CN`.
 */
const LANGUAGE_FONT_MAP: Record<string, Array<string>> = {
  "ja-JP": ["Noto Sans JP"],
  "ko-KR": ["Noto Sans KR"],
  "zh-CN": ["Noto Sans SC"],
  "zh-TW": ["Noto Sans TC"],
  "zh-HK": ["Noto Sans HK"],
  "th-TH": ["Noto Sans Thai"],
  "bn-IN": ["Noto Sans Bengali"],
  "ar-AR": ["Noto Sans Arabic"],
  "ta-IN": ["Noto Sans Tamil"],
  "ml-IN": ["Noto Sans Malayalam"],
  "he-IL": ["Noto Sans Hebrew"],
  "te-IN": ["Noto Sans Telugu"],
  devanagari: ["Noto Sans Devanagari"],
  kannada: ["Noto Sans Kannada"],
  symbol: ["Noto Sans Symbols", "Noto Sans Symbols 2"],
  math: ["Noto Sans Math"],
  unknown: ["Noto Sans"],
};

/**
 * Resolved fallback faces (and null misses) keyed by `family:segment`. The
 * same handle/bio segments recur across cards and scraper retries; without
 * this every render would re-hit Google Fonts.
 */
const fallbackCache = new Map<string, Promise<Font | null>>();

function loadFallbackFace(
  code: string,
  family: string,
  segment: string,
): Promise<Font | null> {
  const cacheKey = `${family}:${segment}`;
  const cached = fallbackCache.get(cacheKey);
  if (cached) return cached;

  const pending = loadGoogleFontSubset(family, segment).then(
    (data): Font | null =>
      data
        ? {
            /**
             * Satori dedupes fonts by `${name}_${lang}` and only ever uses the
             * first entry per key, so the name must be unique per subset —
             * otherwise a tiny subset (e.g. just punctuation) that resolves
             * first shadows a later subset of the same family and its glyphs
             * render as tofu.
             */
            name: `${family} fallback ${segment}`,
            data,
            weight: 400,
            style: "normal",
            // `lang` steers satori to this font for segments of that script;
            // synthetic codes (unknown/math/symbol) match any leftover segment.
            lang: code === "unknown" ? undefined : code,
          }
        : null,
  );
  fallbackCache.set(cacheKey, pending);
  return pending;
}

/**
 * Non-emoji arm of satori's `loadAdditionalAsset`. Returns every fallback face
 * that covers the segment (empty array when none do — satori then renders the
 * segment with its missing-glyph boxes, same as before this hook existed).
 */
export async function loadFallbackFonts(
  code: string,
  segment: string,
): Promise<Array<Font>> {
  if (typeof segment !== "string" || segment.length === 0) return [];

  /**
   * Satori's segmenter can hand us lone surrogates (e.g. half of an emoji it
   * misclassified as "unknown"). `encodeURIComponent` throws on those, which
   * would sink the whole segment's font fetch — strip them first.
   */
  const cleaned = segment.toWellFormed().replaceAll("�", "");
  if (cleaned.length === 0) return [];

  // `code` can be pipe-joined ("ja-JP|zh-CN") but satori's Font.lang only
  // accepts single codes, so fan out to (lang, family) pairs.
  const pairs = new Map<string, string>();
  for (const lang of code.split("|")) {
    for (const family of LANGUAGE_FONT_MAP[lang] ?? []) {
      if (!pairs.has(family)) pairs.set(family, lang);
    }
  }
  if (pairs.size === 0) pairs.set("Noto Sans", "unknown");

  const faces = await Promise.all(
    [...pairs].map(([family, lang]) => loadFallbackFace(lang, family, cleaned)),
  );
  return faces.filter((face): face is Font => face != null);
}

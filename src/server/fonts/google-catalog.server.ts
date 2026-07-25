import {
  isValidGoogleFontFamily,
  normalizeGoogleFontFamily,
} from "#/lib/google-fonts";
/**
 * The Google Fonts family catalog, fetched once and cached in memory.
 *
 * Two consumers share this cache: the reading-typography font picker (via
 * `googleFontsApi`) and publication theming, which matches the font keys
 * publishers write — Offprint slugs, PCKT's squashed keys — onto real family
 * names (see `#/lib/publication-fonts`).
 */
import { normalizeFontKey } from "#/lib/publication-fonts";

const GOOGLE_FONTS_METADATA_URL = "https://fonts.google.com/metadata/fonts";
export const GOOGLE_FONTS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedFamilies: ReadonlyArray<string> | null = null;
let cachedIndex: ReadonlyMap<string, string> | null = null;
let cachedAt = 0;

type GoogleFontsMetadata = {
  familyMetadataList?: ReadonlyArray<{ family?: string }>;
};

export async function loadGoogleFontFamilies(): Promise<ReadonlyArray<string>> {
  if (cachedFamilies && Date.now() - cachedAt < GOOGLE_FONTS_CACHE_TTL_MS) {
    return cachedFamilies;
  }

  const response = await fetch(GOOGLE_FONTS_METADATA_URL, {
    headers: {
      Accept: "application/json",
      "User-Agent": "standard-reader/1.0",
    },
  });

  if (!response.ok) {
    throw new Error("Could not load Google Fonts catalog.");
  }

  const raw = await response.text();
  const json = JSON.parse(
    raw.replace(/^\)\]\}'\n?/, ""),
  ) as GoogleFontsMetadata;
  const families = (json.familyMetadataList ?? [])
    .map((entry) => normalizeGoogleFontFamily(entry.family ?? ""))
    .filter((family) => isValidGoogleFontFamily(family));

  cachedFamilies = [...new Set(families)].toSorted((a, b) =>
    a.localeCompare(b),
  );
  cachedIndex = new Map(
    cachedFamilies.map((family) => [normalizeFontKey(family), family]),
  );
  cachedAt = Date.now();
  return cachedFamilies;
}

/**
 * Normalized-key → family lookup. Returns a lookup that always misses when the
 * catalog can't be fetched, so a Google Fonts outage degrades to "no publisher
 * fonts" rather than failing the page.
 */
export async function googleFontLookup(): Promise<
  (normalizedKey: string) => string | null
> {
  try {
    await loadGoogleFontFamilies();
  } catch {
    return () => null;
  }
  const index = cachedIndex;
  return (normalizedKey: string) => index?.get(normalizedKey) ?? null;
}

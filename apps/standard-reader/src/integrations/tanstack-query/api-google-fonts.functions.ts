import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import {
  isValidGoogleFontFamily,
  normalizeGoogleFontFamily,
} from "#/lib/google-fonts";

const GOOGLE_FONTS_METADATA_URL = "https://fonts.google.com/metadata/fonts";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cachedFamilies: ReadonlyArray<string> | null = null;
let cachedAt = 0;

type GoogleFontsMetadata = {
  familyMetadataList?: ReadonlyArray<{ family?: string }>;
};

async function loadGoogleFontFamilies(): Promise<ReadonlyArray<string>> {
  if (cachedFamilies && Date.now() - cachedAt < CACHE_TTL_MS) {
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
  cachedAt = Date.now();
  return cachedFamilies;
}

const getGoogleFontFamilies = createServerFn({ method: "GET" }).handler(
  async () => {
    const families = await loadGoogleFontFamilies();
    return { families };
  },
);

const getGoogleFontFamiliesQueryOptions = queryOptions({
  queryKey: ["googleFonts", "families"] as const,
  queryFn: () => getGoogleFontFamilies(),
  staleTime: CACHE_TTL_MS,
});

export const googleFontsApi = {
  getGoogleFontFamilies,
  getGoogleFontFamiliesQueryOptions,
};

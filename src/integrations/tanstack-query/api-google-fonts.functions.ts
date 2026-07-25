import { queryOptions } from "@tanstack/react-query";
import { createServerFn } from "@tanstack/react-start";

import {
  GOOGLE_FONTS_CACHE_TTL_MS,
  loadGoogleFontFamilies,
} from "#/server/fonts/google-catalog.server";

const getGoogleFontFamilies = createServerFn({ method: "GET" }).handler(
  async () => {
    const families = await loadGoogleFontFamilies();
    return { families };
  },
);

const getGoogleFontFamiliesQueryOptions = queryOptions({
  queryKey: ["googleFonts", "families"] as const,
  queryFn: () => getGoogleFontFamilies(),
  staleTime: GOOGLE_FONTS_CACHE_TTL_MS,
});

export const googleFontsApi = {
  getGoogleFontFamilies,
  getGoogleFontFamiliesQueryOptions,
};

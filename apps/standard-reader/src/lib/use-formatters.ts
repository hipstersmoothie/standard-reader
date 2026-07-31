import { useMemo } from "react";

import type { Formatters } from "./formatters";
import { formattersFor } from "./formatters";
import { useLocale } from "./use-locale";

/**
 * Component-side accessor; re-memoizes only when the reader changes language.
 *
 * Kept separate from `./formatters.ts` so that module stays free of React and
 * of `useLocale` (which reaches into the server-fn layer). The browser
 * extension is a separate build that imports `formattersFor` directly and
 * would fail to bundle otherwise.
 */
export function useFormatters(): Formatters {
  const { locale } = useLocale();
  return useMemo(() => formattersFor(locale), [locale]);
}

import { useEffect, useState } from "react";

import type { ThemeMode } from "./theme";
import {
  DEFAULT_THEME_MODE,
  applyThemeMode,
  readStoredThemeMode,
  storeThemeMode,
} from "./theme";

/**
 * The current theme choice, for the menu that changes it.
 *
 * The DOM is already correct before this runs — `THEME_PREPAINT_SCRIPT` set
 * `color-scheme` in `<head>`. This hook exists only so the menu can show which
 * option is ticked, which is why it starts on the server's default and reads
 * storage after mount: the alternative is markup that disagrees with itself
 * during hydration, for a checkmark nobody can see until they open the menu.
 */
export function useThemeMode(): [ThemeMode, (mode: ThemeMode) => void] {
  const [mode, setMode] = useState<ThemeMode>(DEFAULT_THEME_MODE);

  useEffect(() => {
    setMode(readStoredThemeMode());
  }, []);

  const choose = (next: ThemeMode) => {
    setMode(next);
    applyThemeMode(next);
    storeThemeMode(next);
  };

  return [mode, choose];
}

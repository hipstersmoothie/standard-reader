import { createContext, useContext } from "react";

import type { ExtensionThemeMode } from "./extension-theme";

export const ExtensionThemeContext = createContext<{
  mode: ExtensionThemeMode;
  setMode: (mode: ExtensionThemeMode) => void;
} | null>(null);

export function useExtensionTheme() {
  const context = useContext(ExtensionThemeContext);
  if (context == null) {
    throw new Error("useExtensionTheme must be used within ExtensionTheme");
  }
  return context;
}

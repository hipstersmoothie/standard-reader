import type { ReactNode } from "react";

import * as stylex from "@stylexjs/stylex";
import {
  editorialFonts,
  editorialPrimary,
  editorialShadow,
  editorialUi,
} from "#/components/reader/theme";
import { uiColor } from "#/design-system/theme/color.stylex";
import { useCallback, useEffect, useState } from "react";

import type { ExtensionThemeMode } from "../lib/extension-theme";

import {
  applyExtensionColorScheme,
  getExtensionThemeMode,
  setExtensionThemeMode,
} from "../lib/extension-theme";
import { ExtensionThemeContext } from "../lib/extension-theme-context";

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    fontFamily: "system-ui, sans-serif",
    minHeight: "100%",
  },
  popupRoot: {
    backgroundColor: uiColor.bg,
    color: uiColor.text2,
    minHeight: "280px",
    width: "400px",
  },
  pageRoot: {
    backgroundColor: uiColor.bg,
    boxSizing: "border-box",
    color: uiColor.text2,
  },
  optionsRoot: {
    backgroundColor: uiColor.bg,
    color: uiColor.text2,
    minHeight: "100%",
  },
});

type ExtensionThemeProps = {
  children: ReactNode;
  variant?: "popup" | "page" | "options";
};

export function ExtensionTheme({
  children,
  variant = "popup",
}: ExtensionThemeProps) {
  const [mode, setModeState] = useState<ExtensionThemeMode>(() =>
    variant === "page" ? "light" : getExtensionThemeMode(),
  );

  const setMode = useCallback((next: ExtensionThemeMode) => {
    setModeState(next);
    setExtensionThemeMode(next);
  }, []);

  useEffect(() => {
    if (variant === "page") return;
    applyExtensionColorScheme(mode);
  }, [mode, variant]);

  const colorScheme: ExtensionThemeMode = variant === "page" ? "light" : mode;

  return (
    <ExtensionThemeContext.Provider value={{ mode, setMode }}>
      <div
        style={{ colorScheme }}
        {...stylex.props(
          editorialUi,
          editorialPrimary,
          editorialFonts,
          editorialShadow,
          styles.root,
          variant === "popup" && styles.popupRoot,
          variant === "page" && styles.pageRoot,
          variant === "options" && styles.optionsRoot,
        )}
      >
        {children}
      </div>
    </ExtensionThemeContext.Provider>
  );
}

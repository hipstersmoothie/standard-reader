import type { ReactNode } from "react";

import * as stylex from "@stylexjs/stylex";
import { useEffect } from "react";
import {
  editorialFonts,
  editorialPrimary,
  editorialShadow,
  editorialUi,
} from "#/components/reader/theme";

import { uiColor } from "#/design-system/theme/color.stylex";

import {
  applyExtensionColorScheme,
  getExtensionThemeMode,
} from "../lib/extension-theme";

const styles = stylex.create({
  root: {
    boxSizing: "border-box",
    fontFamily: "system-ui, sans-serif",
    minHeight: "100%",
  },
  popupRoot: {
    backgroundColor: uiColor.bg,
    color: uiColor.text2,
    colorScheme: "light",
    minHeight: "280px",
    width: "400px",
  },
  pageRoot: {
    backgroundColor: uiColor.bg,
    boxSizing: "border-box",
    color: uiColor.text2,
    colorScheme: "light",
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
  useEffect(() => {
    // Content-script widgets (page chip, bsky badge) live in shadow DOM on the
    // host document — never mutate documentElement there.
    if (variant === "page") return;

    if (variant === "popup") {
      applyExtensionColorScheme("light");
      return;
    }
    applyExtensionColorScheme(getExtensionThemeMode());
  }, [variant]);

  return (
    <div
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
  );
}

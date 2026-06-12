import { IconButton } from "#/design-system/icon-button";
import { Moon, Sun } from "lucide-react";

import type { ExtensionThemeMode } from "../lib/extension-theme";

import { useExtensionTheme } from "../lib/extension-theme-context";

export function ExtensionThemeToggle() {
  const { mode, setMode } = useExtensionTheme();

  const toggleMode = () => {
    const next: ExtensionThemeMode = mode === "light" ? "dark" : "light";
    setMode(next);
  };

  return (
    <IconButton
      aria-label={
        mode === "light" ? "Switch to dark mode" : "Switch to light mode"
      }
      variant="tertiary"
      size="md"
      onPress={toggleMode}
    >
      {mode === "light" ? <Sun size={18} /> : <Moon size={18} />}
    </IconButton>
  );
}

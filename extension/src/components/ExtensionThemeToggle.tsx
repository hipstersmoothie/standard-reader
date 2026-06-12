import { IconButton } from "#/design-system/icon-button";
import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

import {
  getExtensionThemeMode,
  setExtensionThemeMode,
  type ExtensionThemeMode,
} from "../lib/extension-theme";

export function ExtensionThemeToggle() {
  const [mode, setMode] = useState<ExtensionThemeMode>("light");

  useEffect(() => {
    setMode(getExtensionThemeMode());
  }, []);

  const toggleMode = () => {
    const next: ExtensionThemeMode = mode === "light" ? "dark" : "light";
    setMode(next);
    setExtensionThemeMode(next);
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

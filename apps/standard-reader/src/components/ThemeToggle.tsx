import { useEffect, useState } from "react";

import { Button } from "@standard-reader/design-system/button";

type ThemeMode = "light" | "dark" | "auto";

function getInitialMode(): ThemeMode {
  if (globalThis.localStorage === undefined) {
    return "auto";
  }

  const stored = globalThis.localStorage.getItem("theme");
  if (stored === "light" || stored === "dark" || stored === "auto") {
    return stored;
  }

  return "auto";
}

function applyThemeMode(mode: ThemeMode) {
  const prefersDark = globalThis.matchMedia(
    "(prefers-color-scheme: dark)",
  ).matches;
  const resolved = mode === "auto" ? (prefersDark ? "dark" : "light") : mode;

  const root = document.documentElement;
  if (mode === "auto") {
    delete root.dataset.theme;
  } else {
    root.dataset.theme = mode;
  }
  root.style.colorScheme = resolved;
}

const NEXT_MODE: Record<ThemeMode, ThemeMode> = {
  light: "dark",
  dark: "auto",
  auto: "light",
};

const LABEL: Record<ThemeMode, string> = {
  light: "Light",
  dark: "Dark",
  auto: "Auto",
};

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => {
    const initialMode = getInitialMode();
    applyThemeMode(initialMode);
    return initialMode;
  });

  useEffect(() => {
    if (mode !== "auto") {
      return;
    }

    const media = globalThis.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyThemeMode("auto");

    media.addEventListener("change", onChange);
    return () => {
      media.removeEventListener("change", onChange);
    };
  }, [mode]);

  function toggleMode() {
    const nextMode = NEXT_MODE[mode];
    setMode(nextMode);
    applyThemeMode(nextMode);
    globalThis.localStorage.setItem("theme", nextMode);
  }

  return (
    <Button
      variant="secondary"
      size="sm"
      onPress={toggleMode}
      aria-label={`Theme: ${LABEL[mode]}. Click to change.`}
    >
      {LABEL[mode]}
    </Button>
  );
}

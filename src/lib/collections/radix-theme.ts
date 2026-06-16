import type { CollectionTheme } from "./theme";

import Color from "colorjs.io";

import { generateRadixColors } from "./generate-radix-colors";

/** Lightness check that accepts any CSS color (hex, rgb(), oklch, …). */
function isLightColor(value: string): boolean {
  try {
    return (new Color(value).to("oklch").l ?? 1) > 0.5;
  } catch {
    return true;
  }
}

/**
 * Turn a collection's theme (accent + background + foreground) into full Radix
 * 12-step scales for BOTH light and dark, then map those onto the magazine's CSS
 * custom properties. Generating a real dark scale from the same accent is what
 * gives a themed collection a properly designed automatic dark mode (rather than
 * naïvely reusing the light colors).
 */

const LIGHT_DEFAULT_BG = "#fdfdfc";
const DARK_DEFAULT_BG = "#111111";

type Scales = ReturnType<typeof generateRadixColors>;

/** Map generated Radix scales onto the magazine's CSS variables (Radix steps are 1-based; arrays 0-based). */
function paletteVars(c: Scales): Record<string, string> {
  return {
    "--paper": c.background,
    "--paper-2": c.grayScale[1],
    "--paper-sunk": c.grayScale[2],
    "--ink": c.grayScale[11],
    "--ink-soft": c.grayScale[10],
    "--muted": c.grayScale[10],
    "--faint": c.grayScale[8],
    "--line": c.grayScale[5],
    "--line-strong": c.grayScale[6],
    "--accent": c.accentScale[8],
    "--accent-ink": c.accentScale[10],
    "--accent-soft": c.accentScale[2],
  };
}

export interface MagazinePalette {
  light: Record<string, string>;
  dark: Record<string, string>;
}

/** Whether a themed collection should open in dark mode (its background is dark). */
export function themePrefersDark(
  theme: CollectionTheme | null | undefined,
): boolean {
  return Boolean(theme?.background && !isLightColor(theme.background));
}

/** Generate the light + dark magazine palettes for a theme, or null if no accent. */
export function buildMagazinePalette(
  theme: CollectionTheme | null | undefined,
): MagazinePalette | null {
  if (!theme?.accent) return null;
  const accent = theme.accent;
  const gray = theme.foreground ?? accent;
  // The theme carries one background; route it to whichever mode its luminance
  // matches and use a sensible default for the other.
  const bgIsLight = theme.background ? isLightColor(theme.background) : true;
  const lightBg = theme.background && bgIsLight ? theme.background : LIGHT_DEFAULT_BG;
  const darkBg = theme.background && !bgIsLight ? theme.background : DARK_DEFAULT_BG;
  try {
    const light = generateRadixColors({
      appearance: "light",
      accent,
      gray,
      background: lightBg,
    });
    const dark = generateRadixColors({
      appearance: "dark",
      accent,
      gray,
      background: darkBg,
    });
    return { light: paletteVars(light), dark: paletteVars(dark) };
  } catch {
    return null;
  }
}

function declarations(vars: Record<string, string>): string {
  return Object.entries(vars)
    .map(([key, value]) => `${key}:${value}`)
    .join(";");
}

/**
 * Scoped CSS applying the light palette to `.mag.is-themed` and the dark palette
 * to `.mag.is-themed.is-dark`, so the magazine's existing dark toggle switches
 * between two properly generated scales.
 */
export function magazinePaletteCss(palette: MagazinePalette): string {
  return (
    `.mag.is-themed{${declarations(palette.light)}}` +
    `.mag.is-themed.is-dark{${declarations(palette.dark)}}`
  );
}

import Color from "colorjs.io";
import type { CSSProperties } from "react";

import type { AppearancePreference } from "#/lib/appearance";
import {
  DEFAULT_CUSTOM_ACCENT,
  DEFAULT_CUSTOM_PAPER,
  appearanceScaleVars,
  normalizeAppearance,
} from "#/lib/appearance";

import { publicationThemeScaleVars } from "./publication-theme-scale";

/**
 * Namespace for the reader's own palette, deliberately distinct from the
 * publication theme's `--pub-*`: a publication page nested inside a custom app
 * theme sets its own vars, and the two must not overwrite each other.
 */
export const APPEARANCE_VAR_PREFIX = "sr";

/**
 * Ink for a reader-chosen paper.
 *
 * The reader picks two colors, not four, so the text color has to come from
 * somewhere. Snapping to black or white (what the scale generator does on its
 * own when handed no foreground) throws away the paper's character — warm paper
 * deserves warm ink. Mirror the paper through OKLCH instead: keep its hue, move
 * lightness to the far end, and keep a trace of its chroma. The generator still
 * enforces contrast on top of this, so a low-contrast result can't ship.
 */
function inkForPaper(paper: string): string {
  try {
    const color = new Color(paper).to("oklch");
    const lightness = color.coords[0] ?? 1;
    const chroma = color.coords[1] ?? 0;
    const hue = color.coords[2] ?? 0;
    const isDarkPaper = lightness < 0.5;
    const ink = new Color("oklch", [
      isDarkPaper ? 0.93 : 0.24,
      Math.min(chroma * (isDarkPaper ? 0.6 : 1.2), 0.03),
      hue,
    ]);
    return ink.to("srgb").toString({ format: "hex" });
  } catch {
    return "#000000";
  }
}

/**
 * The `--sr-*` scale for a reader's own accent + paper, using the same color
 * science that paints publication themes (`publicationThemeScaleVars`): one
 * stated background is routed to the mode its luminance matches and the other
 * mode is mirrored through OKLCH.
 *
 * `trustStatedAccent` is the difference between theming your own app and being
 * handed someone else's. For a publication, an accent that can't clear 3:1
 * against the page is replaced by the page's ink — a stranger's site shouldn't
 * be able to make our chrome unreadable. Here the reader picked the color, and
 * substituting it means choosing a primary color and watching it come back grey.
 * They keep what they chose; the settings panel scores the result and says so.
 */
export function customPaletteVars(
  paper: string,
  accent: string,
): CSSProperties {
  return publicationThemeScaleVars(
    {
      themeBackground: paper,
      themeForeground: inkForPaper(paper),
      themeAccent: accent,
      themeAccentForeground: null,
    },
    APPEARANCE_VAR_PREFIX,
    { trustStatedAccent: true },
  );
}

/**
 * Every custom property the appearance preference publishes: the numeric dials
 * in all modes, plus the custom palette's scale when one is in use.
 *
 * Returns `undefined` when there is nothing to set, so a reader on the defaults
 * gets no inline `style` at all and the markup stays byte-identical.
 */
export function appearanceStyleVars(
  preference: AppearancePreference,
  options: { includePalette: boolean },
): CSSProperties | undefined {
  const normalized = normalizeAppearance(preference);
  const scaleVars = appearanceScaleVars(normalized);
  const paletteVars =
    options.includePalette && normalized.palette === "custom"
      ? customPaletteVars(
          normalized.customPaper ?? DEFAULT_CUSTOM_PAPER,
          normalized.customAccent ?? DEFAULT_CUSTOM_ACCENT,
        )
      : undefined;

  if (!paletteVars && Object.keys(scaleVars).length === 0) return undefined;
  return { ...paletteVars, ...scaleVars };
}

/**
 * Picks the bundled Shiki theme that best matches a publication's palette.
 *
 * Synthesizing syntax colours from a publication's four theme colours would mean
 * inventing a whole colour system per publication — keywords, strings, comments,
 * numbers — and algorithmic palettes read as noise next to hand-designed ones.
 * Shiki already ships 65 themes that *are* designed systems, so we score them
 * against the publication's background, text and accent and use the closest.
 *
 * Scoring is perceptual (ΔE in OKLab) and weighted toward the accent, since that
 * is what gives a theme its character; background and text mostly decide whether
 * it sits calmly on the page.
 */
import Color from "colorjs.io";
import type { ThemeRegistrationAny } from "shiki";
import { bundledThemes, bundledThemesInfo } from "shiki";

import type { ResolvedThemeScheme } from "#/lib/theme";

export interface CodeThemeTarget {
  /** The surface the code block sits on. */
  background: string | null;
  /** Body text colour. */
  foreground: string | null;
  /** The publication's accent — the strongest signal of its character. */
  accent: string | null;
}

interface ThemeFingerprint {
  id: string;
  type: "light" | "dark";
  background: string;
  foreground: string;
  /** The token colour covering the most scopes — keywords, in practice. */
  accent: string;
}

/**
 * A code block is mostly background: the panel is a large flat area, while the
 * accent shows up as a few keywords. So the background is a **gate**, not just a
 * weighted term — a theme whose surface visibly disagrees with the page reads as
 * a foreign panel no matter how well its keyword colour echoes the accent (a
 * cream `gruvbox-light-hard` on a near-white page was the case that prompted
 * this). Among themes that do sit calmly, we then pick the most characterful.
 *
 * Threshold is ΔE in OKLab; ~0.02 is roughly "just noticeable", so 0.035 allows
 * a panel that reads as a distinct surface without clashing.
 */
const MAX_BACKGROUND_DELTA = 0.035;

const WEIGHT = { background: 1, foreground: 0.6, accent: 1.4 } as const;

/** Themes whose palette is a novelty rather than a reading surface. */
const EXCLUDED = new Set(["red", "vitesse-black", "andromeeda"]);

function accentOf(theme: ThemeRegistrationAny): string | null {
  const byColor = new Map<string, number>();
  for (const entry of theme.tokenColors ?? []) {
    const fg = entry.settings?.foreground;
    if (!fg) continue;
    const scopes = Array.isArray(entry.scope)
      ? entry.scope.length
      : entry.scope
        ? 1
        : 0;
    byColor.set(fg, (byColor.get(fg) ?? 0) + scopes);
  }
  let best: string | null = null;
  let bestCount = -1;
  for (const [color, count] of byColor) {
    // Skip the body text colour; it is the foreground, not the accent.
    if (
      color.toLowerCase() === theme.colors?.["editor.foreground"]?.toLowerCase()
    ) {
      continue;
    }
    if (count > bestCount) {
      best = color;
      bestCount = count;
    }
  }
  return best;
}

let fingerprintsPromise: Promise<ReadonlyArray<ThemeFingerprint>> | null = null;

async function loadFingerprints(): Promise<ReadonlyArray<ThemeFingerprint>> {
  fingerprintsPromise ??= (async () => {
    const out: Array<ThemeFingerprint> = [];
    await Promise.all(
      bundledThemesInfo.map(async (info) => {
        if (EXCLUDED.has(info.id)) return;
        try {
          const loaded =
            await bundledThemes[info.id as keyof typeof bundledThemes]();
          const theme = (loaded.default ?? loaded) as ThemeRegistrationAny;
          const background = theme.colors?.["editor.background"];
          const foreground = theme.colors?.["editor.foreground"];
          const accent = accentOf(theme);
          if (!background || !foreground || !accent) return;
          out.push({
            id: info.id,
            type: info.type,
            background,
            foreground,
            accent,
          });
        } catch {
          // A theme that won't load simply isn't a candidate.
        }
      }),
    );
    return out;
  })();
  return fingerprintsPromise;
}

function parse(value: string | null): Color | null {
  if (!value) return null;
  try {
    return new Color(value);
  } catch {
    return null;
  }
}

/**
 * The bundled theme closest to `target`, or `null` when the target carries too
 * little colour to choose on (the caller then keeps the editorial theme).
 */
export async function pickCodeTheme(
  target: CodeThemeTarget,
  scheme: ResolvedThemeScheme,
): Promise<string | null> {
  const accent = parse(target.accent);
  const background = parse(target.background);
  const foreground = parse(target.foreground);
  // The accent is what makes a match meaningful; without it, any theme is as
  // good as the editorial one we already have.
  if (!accent) return null;

  const fingerprints = await loadFingerprints();
  const ofScheme = fingerprints.filter((f) => f.type === scheme);
  if (ofScheme.length === 0) return null;

  // Gate on background agreement first; fall back to the full field if nothing
  // sits closely enough, so we always return a usable theme.
  const nearBackground = background
    ? ofScheme.filter((f) => {
        try {
          return (
            background.deltaEOK(new Color(f.background)) <= MAX_BACKGROUND_DELTA
          );
        } catch {
          return false;
        }
      })
    : ofScheme;
  const candidates = nearBackground.length > 0 ? nearBackground : ofScheme;

  let best: string | null = null;
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of candidates) {
    let score = 0;
    try {
      score += WEIGHT.accent * accent.deltaEOK(new Color(candidate.accent));
      if (background) {
        score +=
          WEIGHT.background *
          background.deltaEOK(new Color(candidate.background));
      }
      if (foreground) {
        score +=
          WEIGHT.foreground *
          foreground.deltaEOK(new Color(candidate.foreground));
      }
    } catch {
      continue;
    }
    if (score < bestScore) {
      bestScore = score;
      best = candidate.id;
    }
  }
  return best;
}

interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** Resolved OG palette (hex — resvg does not support oklch()). */
export interface QuoteOgColors {
  background: string;
  foreground: string;
  muted: string;
  accent: string;
  accentForeground: string;
  line: string;
  hoverBg: string;
  hoverFg: string;
  accentSubtle: string;
  accentSubtleFg: string;
}

export interface PublicationThemeInput {
  themeBackground: string | null;
  themeForeground: string | null;
  themeAccent: string | null;
  themeAccentForeground: string | null;
}

const DEFAULT: QuoteOgColors = {
  background: "#f9f7f2",
  foreground: "#3e3934",
  muted: "#8a847a",
  accent: "#bd5633",
  accentForeground: "#f9f7f2",
  line: "#d9d2c8",
  hoverBg: "#f0ece7",
  hoverFg: "#3e3934",
  accentSubtle: "#f0e0d7",
  accentSubtleFg: "#bd5633",
};

const BLACK: Rgb = { r: 0, g: 0, b: 0 };
const WHITE: Rgb = { r: 255, g: 255, b: 255 };

/** WCAG 2.1 contrast for normal body text. */
const MIN_BODY_CONTRAST = 4.5;
/** WCAG 2.1 contrast for large / secondary text and decorative accents. */
const MIN_LARGE_CONTRAST = 3;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parseCssColor(input: string | null | undefined): Rgb | null {
  if (!input) return null;
  const trimmed = input.trim();

  const rgbMatch = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/i.exec(
    trimmed,
  );
  if (rgbMatch) {
    return {
      r: clamp(Math.round(Number(rgbMatch[1])), 0, 255),
      g: clamp(Math.round(Number(rgbMatch[2])), 0, 255),
      b: clamp(Math.round(Number(rgbMatch[3])), 0, 255),
    };
  }

  const hexMatch = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(trimmed);
  if (hexMatch) {
    const hex = hexMatch[1];
    if (hex.length === 3) {
      return {
        r: Number.parseInt(hex[0] + hex[0], 16),
        g: Number.parseInt(hex[1] + hex[1], 16),
        b: Number.parseInt(hex[2] + hex[2], 16),
      };
    }
    return {
      r: Number.parseInt(hex.slice(0, 2), 16),
      g: Number.parseInt(hex.slice(2, 4), 16),
      b: Number.parseInt(hex.slice(4, 6), 16),
    };
  }

  return null;
}

function rgbToHex(color: Rgb): string {
  const channel = (value: number) =>
    clamp(Math.round(value), 0, 255).toString(16).padStart(2, "0");
  return `#${channel(color.r)}${channel(color.g)}${channel(color.b)}`;
}

function linearize(channel: number): number {
  const value = channel / 255;
  return value <= 0.039_28 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(color: Rgb): number {
  return (
    0.2126 * linearize(color.r) +
    0.7152 * linearize(color.g) +
    0.0722 * linearize(color.b)
  );
}

export function contrastRatio(foreground: Rgb, background: Rgb): number {
  const lighter = Math.max(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  const darker = Math.min(
    relativeLuminance(foreground),
    relativeLuminance(background),
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function mix(a: Rgb, b: Rgb, amount: number): Rgb {
  const t = clamp(amount, 0, 1);
  return {
    r: a.r + (b.r - a.r) * t,
    g: a.g + (b.g - a.g) * t,
    b: a.b + (b.b - a.b) * t,
  };
}

/** Pick black or white, whichever contrasts more with `background`. */
function highContrastFallback(background: Rgb): Rgb {
  return contrastRatio(BLACK, background) >= contrastRatio(WHITE, background)
    ? BLACK
    : WHITE;
}

function ensureContrast(
  foreground: Rgb,
  background: Rgb,
  minRatio: number,
): Rgb {
  if (contrastRatio(foreground, background) >= minRatio) {
    return foreground;
  }
  return highContrastFallback(background);
}

function deriveMuted(foreground: Rgb, background: Rgb): Rgb {
  for (const amount of [0.65, 0.55, 0.45, 0.35]) {
    const candidate = mix(foreground, background, amount);
    if (contrastRatio(candidate, background) >= MIN_LARGE_CONTRAST) {
      return candidate;
    }
  }
  return ensureContrast(
    mix(foreground, background, 0.5),
    background,
    MIN_LARGE_CONTRAST,
  );
}

function deriveLine(foreground: Rgb, background: Rgb): Rgb {
  return mix(background, foreground, 0.22);
}

/** Subtle hover wash — a light/dark tint of the publication surface. */
function deriveHoverBg(foreground: Rgb, background: Rgb): Rgb {
  return mix(background, foreground, 0.08);
}

function deriveHoverFg(foreground: Rgb, hoverBg: Rgb): Rgb {
  return ensureContrast(foreground, hoverBg, MIN_BODY_CONTRAST);
}

/** Tonal accent surface for active toggles (Saved, Following). */
function deriveAccentSubtle(accent: Rgb, background: Rgb): Rgb {
  return mix(background, accent, 0.14);
}

function deriveAccentSubtleFg(
  accent: Rgb,
  accentSubtle: Rgb,
  foreground: Rgb,
): Rgb {
  if (contrastRatio(accent, accentSubtle) >= MIN_BODY_CONTRAST) {
    return accent;
  }
  return ensureContrast(foreground, accentSubtle, MIN_BODY_CONTRAST);
}

function accentOnBackground(
  accent: Rgb,
  background: Rgb,
  foreground: Rgb,
): Rgb {
  if (contrastRatio(accent, background) >= MIN_LARGE_CONTRAST) {
    return accent;
  }
  return foreground;
}

function parseOrDefault(
  value: string | null | undefined,
  fallbackHex: string,
): Rgb {
  const parsed = parseCssColor(value) ?? parseCssColor(fallbackHex);
  if (!parsed) {
    throw new Error(`Invalid fallback color: ${fallbackHex}`);
  }
  return parsed;
}

/** Build an accessible OG palette from a publication's flattened theme. */
export function resolveQuoteOgColors(
  theme: PublicationThemeInput,
): QuoteOgColors {
  const background = parseOrDefault(theme.themeBackground, DEFAULT.background);
  const foreground = ensureContrast(
    parseOrDefault(theme.themeForeground, DEFAULT.foreground),
    background,
    MIN_BODY_CONTRAST,
  );
  const accentRaw = parseOrDefault(theme.themeAccent, DEFAULT.accent);
  const accent = accentOnBackground(accentRaw, background, foreground);
  const accentForeground = ensureContrast(
    parseOrDefault(theme.themeAccentForeground, DEFAULT.accentForeground),
    accent,
    MIN_BODY_CONTRAST,
  );
  const muted = deriveMuted(foreground, background);
  const line = deriveLine(foreground, background);
  const hoverBg = deriveHoverBg(foreground, background);
  const hoverFg = deriveHoverFg(foreground, hoverBg);
  const accentSubtle = deriveAccentSubtle(accent, background);
  const accentSubtleFg = deriveAccentSubtleFg(accent, accentSubtle, foreground);

  return {
    background: rgbToHex(background),
    foreground: rgbToHex(foreground),
    muted: rgbToHex(muted),
    accent: rgbToHex(accent),
    accentForeground: rgbToHex(accentForeground),
    line: rgbToHex(line),
    hoverBg: rgbToHex(hoverBg),
    hoverFg: rgbToHex(hoverFg),
    accentSubtle: rgbToHex(accentSubtle),
    accentSubtleFg: rgbToHex(accentSubtleFg),
  };
}

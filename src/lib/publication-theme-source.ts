/**
 * Normalizes the publisher-authored theme carried on a `site.standard.publication`
 * record into the light (and, when supplied, dark) palettes our UI themes from.
 *
 * `basicTheme` (`site.standard.theme.basic`) is the interop baseline every
 * publisher writes: four opaque colors, light mode only. Alongside it, records
 * keep the richer native theme of whichever platform published them, under
 * `theme`, discriminated by `$type`:
 *
 * - **`pub.leaflet.publication#theme`** — Leaflet paints a *page* on top of a
 *   *canvas*. `basicTheme.background` mirrors the canvas (`backgroundColor`), so
 *   for publications with `showPageBackground` the baseline reports a background
 *   the reader never actually sees behind the text. `pageBackground` is the real
 *   surface, and it may be translucent over the canvas.
 * - **`blog.pckt.theme`** — PCKT authors a full light *and* dark palette. That
 *   dark palette is worth far more than the one we derive by darkening the light
 *   background, so we use it verbatim when present.
 *
 * Unknown `$type`s fall back to `basicTheme`, so a new publishing platform
 * degrades to the interop baseline rather than losing its colors.
 *
 * Client-safe: pure functions over already-fetched JSON, no server imports.
 */

export interface ThemePalette {
  background: string | null;
  foreground: string | null;
  accent: string | null;
  accentForeground: string | null;
  /**
   * Optional anchors on the neutral ramp between the page background and the
   * strongest border. We otherwise *derive* these steps by darkening the
   * background by fixed ratios; when a publisher states them outright we pin
   * their value at the matching step instead of guessing.
   *
   * `surface` is a resting secondary background (cards, sidebars),
   * `surfaceHover` its hover state, and `border` the borders/dividers color.
   */
  surface: string | null;
  surfaceHover: string | null;
  border: string | null;
  /**
   * Link colour, stated separately from the accent. Publishers routinely choose
   * a different hue for links than for accents (PCKT states both, always), and
   * collapsing links into the accent throws that distinction away.
   */
  link: string | null;
  /** Neutral solid fill for muted UI (Offprint `neutral`). */
  neutral: string | null;
  /** Secondary action colour (Offprint `secondary`). */
  secondary: string | null;
}

export interface ResolvedPublicationTheme {
  light: ThemePalette;
  /** Publisher-authored dark palette; `null` means "derive one from `light`". */
  dark: ThemePalette | null;
}

export const EMPTY_PALETTE: ThemePalette = {
  background: null,
  foreground: null,
  accent: null,
  accentForeground: null,
  surface: null,
  surfaceHover: null,
  border: null,
  link: null,
  neutral: null,
  secondary: null,
};

interface Rgb {
  r: number;
  g: number;
  b: number;
}

function clampChannel(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)));
}

function toHex(c: Rgb): string {
  const ch = (v: number) => clampChannel(v).toString(16).padStart(2, "0");
  return `#${ch(c.r)}${ch(c.g)}${ch(c.b)}`;
}

function parseHexString(value: string): Rgb | null {
  const m = /^#?([\da-f]{3}|[\da-f]{6})$/i.exec(value.trim());
  if (!m) return null;
  const h = m[1];
  if (h.length === 3) {
    return {
      r: Number.parseInt(h[0] + h[0], 16),
      g: Number.parseInt(h[1] + h[1], 16),
      b: Number.parseInt(h[2] + h[2], 16),
    };
  }
  return {
    r: Number.parseInt(h.slice(0, 2), 16),
    g: Number.parseInt(h.slice(2, 4), 16),
    b: Number.parseInt(h.slice(4, 6), 16),
  };
}

function parseRgbFunction(value: string): { rgb: Rgb; alpha: number } | null {
  const m = /^rgba?\(([^)]+)\)$/i.exec(value.trim());
  if (!m) return null;
  const parts = m[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .map(Number);
  if (parts.length < 3 || parts.slice(0, 3).some((n) => Number.isNaN(n))) {
    return null;
  }
  const alpha = parts.length > 3 && !Number.isNaN(parts[3]) ? parts[3] : 1;
  return { rgb: { r: parts[0], g: parts[1], b: parts[2] }, alpha };
}

/**
 * A color as any of the shapes these records use: a hex or `rgb()` string, or a
 * `{r,g,b}` / `{r,g,b,a}` object. Lexicon alpha is a 0–100 percentage
 * (`pub.leaflet.theme.color#rgba`), not a 0–255 channel or a 0–1 fraction.
 */
function parseColor(value: unknown): { rgb: Rgb; alpha: number } | null {
  if (typeof value === "string") {
    const hex = parseHexString(value);
    if (hex) return { rgb: hex, alpha: 1 };
    return parseRgbFunction(value);
  }
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  if (
    typeof o.r !== "number" ||
    typeof o.g !== "number" ||
    typeof o.b !== "number"
  ) {
    return null;
  }
  const alpha =
    typeof o.a === "number" ? Math.min(1, Math.max(0, o.a / 100)) : 1;
  return { rgb: { r: o.r, g: o.g, b: o.b }, alpha };
}

/**
 * Flatten a possibly-translucent color to an opaque hex by compositing it over
 * `backdrop`. Our tokens are opaque, and a translucent page background is only
 * meaningful against the canvas it sits on, so we resolve it here.
 */
function flattenColor(value: unknown, backdrop: Rgb | null): string | null {
  const parsed = parseColor(value);
  if (!parsed) return null;
  if (parsed.alpha >= 1 || !backdrop) return toHex(parsed.rgb);
  const t = parsed.alpha;
  return toHex({
    r: backdrop.r + (parsed.rgb.r - backdrop.r) * t,
    g: backdrop.g + (parsed.rgb.g - backdrop.g) * t,
    b: backdrop.b + (parsed.rgb.b - backdrop.b) * t,
  });
}

function opaqueRgb(value: unknown): Rgb | null {
  return parseColor(value)?.rgb ?? null;
}

function isPalettePopulated(palette: ThemePalette): boolean {
  return Boolean(
    palette.background ||
    palette.foreground ||
    palette.accent ||
    palette.accentForeground,
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/** `site.standard.theme.basic` — the interop baseline (light only). */
function paletteFromBasicTheme(basicTheme: unknown): ThemePalette {
  const t = asRecord(basicTheme);
  if (!t) return EMPTY_PALETTE;
  return {
    background: flattenColor(t.background, null),
    foreground: flattenColor(t.foreground, null),
    accent: flattenColor(t.accent, null),
    accentForeground: flattenColor(t.accentForeground, null),
    // The interop baseline has no scale steps — they stay derived.
    surface: null,
    surfaceHover: null,
    border: null,
    link: null,
    neutral: null,
    secondary: null,
  };
}

/**
 * `pub.leaflet.publication#theme`. The surface a reader actually sees is
 * `pageBackground` over `backgroundColor` when `showPageBackground` is on,
 * otherwise the canvas itself.
 */
function paletteFromLeafletTheme(theme: Record<string, unknown>): ThemePalette {
  const canvas = opaqueRgb(theme.backgroundColor);
  const showPage = theme.showPageBackground === true;
  const surface = showPage
    ? (flattenColor(theme.pageBackground, canvas) ??
      flattenColor(theme.backgroundColor, null))
    : flattenColor(theme.backgroundColor, null);

  return {
    background: surface,
    foreground: flattenColor(theme.primary, null),
    accent: flattenColor(theme.accentBackground, null),
    accentForeground: flattenColor(theme.accentText, null),
    // Leaflet states no component, border, link or neutral colors of its own.
    surface: null,
    surfaceHover: null,
    border: null,
    link: null,
    neutral: null,
    secondary: null,
  };
}

/**
 * `app.offprint.theme` — a DaisyUI-shaped palette that maps almost 1:1 onto our
 * tokens: `base100` is the page, `baseContent` the text, and `primary` /
 * `primaryContent` the action pair. Its `colorScheme` declares whether the
 * palette *is* the light or the dark one, so it slots accordingly rather than
 * always being treated as light.
 */
function paletteFromOffprintTheme(
  theme: Record<string, unknown>,
): ThemePalette {
  const colors = asRecord(theme.colors);
  if (!colors) return EMPTY_PALETTE;
  return {
    background: flattenColor(colors.base100, null),
    foreground: flattenColor(colors.baseContent, null),
    accent:
      flattenColor(colors.primary, null) ?? flattenColor(colors.accent, null),
    accentForeground:
      flattenColor(colors.primaryContent, null) ??
      flattenColor(colors.accentContent, null),
    // `base200` is Offprint's "cards, sidebars" surface and `base300` its
    // "borders, dividers" — exactly the steps we would otherwise approximate.
    surface: flattenColor(colors.base200, null),
    surfaceHover: null,
    border: flattenColor(colors.base300, null),
    // Offprint has no distinct link colour; links follow the accent.
    link: null,
    neutral: flattenColor(colors.neutral, null),
    secondary: flattenColor(colors.secondary, null),
  };
}

/** One half of a `blog.pckt.theme` (`light` / `dark`), hex strings throughout. */
function paletteFromPcktVariant(variant: unknown): ThemePalette {
  const v = asRecord(variant);
  if (!v) return EMPTY_PALETTE;
  return {
    background: flattenColor(v.background, null),
    foreground: flattenColor(v.text, null),
    accent: flattenColor(v.accent, null),
    // PCKT has no accent-foreground; the scale generator picks a WCAG-safe one.
    accentForeground: null,
    // `surfaceHover` is a hover fill, so it anchors the hover step rather than
    // the resting one — using it for resting cards would be far louder than the
    // publisher intends.
    surface: null,
    surfaceHover: flattenColor(v.surfaceHover, null),
    border: null,
    link: flattenColor(v.link, null),
    neutral: null,
    secondary: null,
  };
}

/**
 * Resolve the palettes to theme from, preferring the publisher's native theme
 * and falling back to `basicTheme` per-slot so a partial native theme still
 * benefits from the baseline.
 */
export function resolvePublicationTheme(
  basicTheme: unknown,
  nativeTheme: unknown,
): ResolvedPublicationTheme {
  const base = paletteFromBasicTheme(basicTheme);
  const theme = asRecord(nativeTheme);
  const type = typeof theme?.$type === "string" ? theme.$type : null;

  let light = EMPTY_PALETTE;
  let dark: ThemePalette | null = null;

  if (theme) {
    if (type === "blog.pckt.theme") {
      light = paletteFromPcktVariant(theme.light);
      const darkPalette = paletteFromPcktVariant(theme.dark);
      dark = isPalettePopulated(darkPalette) ? darkPalette : null;
    } else if (type === "app.offprint.theme") {
      const palette = paletteFromOffprintTheme(theme);
      if (theme.colorScheme === "dark") {
        // A dark-scheme Offprint theme is the publisher's dark palette; the
        // light side stays on `basicTheme` rather than being darkened from it.
        dark = isPalettePopulated(palette) ? palette : null;
      } else {
        light = palette;
      }
    } else if (type?.startsWith("pub.leaflet.")) {
      light = paletteFromLeafletTheme(theme);
    }
  }

  return {
    light: {
      background: light.background ?? base.background,
      foreground: light.foreground ?? base.foreground,
      accent: light.accent ?? base.accent,
      accentForeground: light.accentForeground ?? base.accentForeground,
      surface: light.surface,
      surfaceHover: light.surfaceHover,
      border: light.border,
      link: light.link,
      neutral: light.neutral,
      secondary: light.secondary,
    },
    dark,
  };
}

/** Whether a resolved theme carries anything worth painting with. */
export function hasResolvedTheme(
  theme: ResolvedPublicationTheme | null | undefined,
): boolean {
  return Boolean(theme && isPalettePopulated(theme.light));
}

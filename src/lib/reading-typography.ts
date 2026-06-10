/**
 * Reading typography preferences shared types/helpers.
 *
 * Controls body text size, column measure, and optional sans-serif body on
 * the article wrapper. Persisted in the `standard-reader-reading` cookie (SSR
 * for everyone). Signed-in users also store a compact encoding on
 * `user.reading_typography` (`null` = all defaults).
 */

export type ReadingFontSize = "small" | "default" | "large";

export type ReadingMeasure = "narrow" | "default" | "wide";

export type ReadingBodyFont = "serif" | "sans";

export interface ReadingTypographyPreference {
  fontSize: ReadingFontSize;
  measure: ReadingMeasure;
  bodyFont: ReadingBodyFont;
}

export const DEFAULT_READING_TYPOGRAPHY: ReadingTypographyPreference = {
  fontSize: "default",
  measure: "default",
  bodyFont: "serif",
};

export const READING_TYPOGRAPHY_COOKIE = "standard-reader-reading";

export const READING_TYPOGRAPHY_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

export const READING_FONT_SIZES = ["small", "default", "large"] as const;

export const READING_MEASURES = ["narrow", "default", "wide"] as const;

export const READING_BODY_FONTS = ["serif", "sans"] as const;

const ENCODING_SEPARATOR = ":";

export function isReadingFontSize(value: unknown): value is ReadingFontSize {
  return (
    typeof value === "string" &&
    (READING_FONT_SIZES as ReadonlyArray<string>).includes(value)
  );
}

export function isReadingMeasure(value: unknown): value is ReadingMeasure {
  return (
    typeof value === "string" &&
    (READING_MEASURES as ReadonlyArray<string>).includes(value)
  );
}

export function isReadingBodyFont(value: unknown): value is ReadingBodyFont {
  return (
    typeof value === "string" &&
    (READING_BODY_FONTS as ReadonlyArray<string>).includes(value)
  );
}

export function isReadingTypographyPreference(
  value: unknown,
): value is ReadingTypographyPreference {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    isReadingFontSize(record.fontSize) &&
    isReadingMeasure(record.measure) &&
    isReadingBodyFont(record.bodyFont)
  );
}

export function parseReadingTypographyCookie(
  value: unknown,
): ReadingTypographyPreference {
  if (typeof value !== "string" || value.trim() === "") {
    return DEFAULT_READING_TYPOGRAPHY;
  }

  const [fontSize, measure, bodyFont] = value.split(ENCODING_SEPARATOR);
  return {
    fontSize: isReadingFontSize(fontSize)
      ? fontSize
      : DEFAULT_READING_TYPOGRAPHY.fontSize,
    measure: isReadingMeasure(measure)
      ? measure
      : DEFAULT_READING_TYPOGRAPHY.measure,
    bodyFont: isReadingBodyFont(bodyFont)
      ? bodyFont
      : DEFAULT_READING_TYPOGRAPHY.bodyFont,
  };
}

export function readingTypographyToCookieValue(
  preference: ReadingTypographyPreference,
): string {
  return [preference.fontSize, preference.measure, preference.bodyFont].join(
    ENCODING_SEPARATOR,
  );
}

export function readingTypographyIsDefault(
  preference: ReadingTypographyPreference,
): boolean {
  return (
    preference.fontSize === DEFAULT_READING_TYPOGRAPHY.fontSize &&
    preference.measure === DEFAULT_READING_TYPOGRAPHY.measure &&
    preference.bodyFont === DEFAULT_READING_TYPOGRAPHY.bodyFont
  );
}

export function readingTypographyToDbValue(
  preference: ReadingTypographyPreference,
): string | null {
  return readingTypographyIsDefault(preference)
    ? null
    : readingTypographyToCookieValue(preference);
}

export function dbValueToReadingTypography(
  value: string | null | undefined,
): ReadingTypographyPreference {
  return parseReadingTypographyCookie(value ?? "");
}

export function readingFontSizeLabel(fontSize: ReadingFontSize): string {
  switch (fontSize) {
    case "small": {
      return "Small";
    }
    case "large": {
      return "Large";
    }
    default: {
      return "Default";
    }
  }
}

export function readingMeasureLabel(measure: ReadingMeasure): string {
  switch (measure) {
    case "narrow": {
      return "Narrow";
    }
    case "wide": {
      return "Wide";
    }
    default: {
      return "Default";
    }
  }
}

export function readingBodyFontLabel(bodyFont: ReadingBodyFont): string {
  return bodyFont === "sans" ? "Sans" : "Serif";
}

export function readingTypographySummary(
  preference: ReadingTypographyPreference,
): string {
  if (readingTypographyIsDefault(preference)) {
    return "Default";
  }

  const parts: Array<string> = [];
  if (preference.fontSize !== DEFAULT_READING_TYPOGRAPHY.fontSize) {
    parts.push(readingFontSizeLabel(preference.fontSize));
  }
  if (preference.measure !== DEFAULT_READING_TYPOGRAPHY.measure) {
    parts.push(readingMeasureLabel(preference.measure));
  }
  if (preference.bodyFont !== DEFAULT_READING_TYPOGRAPHY.bodyFont) {
    parts.push(readingBodyFontLabel(preference.bodyFont));
  }

  return parts.join(" · ");
}

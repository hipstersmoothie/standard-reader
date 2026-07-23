/**
 * Reading typography preferences shared types/helpers.
 *
 * Controls body text size, column measure, and body font (serif, sans, or a
 * custom Google Font). Persisted in the `standard-reader-reading` cookie (SSR
 * for everyone). Signed-in users also store a compact encoding on
 * `user.reading_typography` (`null` = all defaults).
 */

import {
  DEFAULT_CUSTOM_GOOGLE_FONT,
  isValidGoogleFontFamily,
  normalizeGoogleFontFamily,
} from "./google-fonts";

export type ReadingFontSize = "small" | "default" | "large";

export type ReadingMeasure = "narrow" | "default" | "wide";

export type ReadingBodyFont = "serif" | "sans" | "custom";

export interface ReadingTypographyPreference {
  fontSize: ReadingFontSize;
  measure: ReadingMeasure;
  bodyFont: ReadingBodyFont;
  /** Google Font family name when `bodyFont` is `custom`. */
  customFontFamily?: string;
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

export const READING_BODY_FONTS = ["serif", "sans", "custom"] as const;

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

function normalizeCustomFontFamily(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = normalizeGoogleFontFamily(value);
  return isValidGoogleFontFamily(normalized) ? normalized : undefined;
}

export function normalizeReadingTypographyPreference(
  preference: ReadingTypographyPreference,
): ReadingTypographyPreference {
  if (preference.bodyFont !== "custom") {
    return { ...preference, customFontFamily: undefined };
  }

  const customFontFamily =
    normalizeCustomFontFamily(preference.customFontFamily) ??
    DEFAULT_CUSTOM_GOOGLE_FONT;

  return { ...preference, customFontFamily };
}

export function isReadingTypographyPreference(
  value: unknown,
): value is ReadingTypographyPreference {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (
    !isReadingFontSize(record.fontSize) ||
    !isReadingMeasure(record.measure) ||
    !isReadingBodyFont(record.bodyFont)
  ) {
    return false;
  }

  if (record.bodyFont === "custom") {
    return normalizeCustomFontFamily(record.customFontFamily) !== undefined;
  }

  return record.customFontFamily === undefined;
}

export function parseReadingTypographyCookie(
  value: unknown,
): ReadingTypographyPreference {
  if (typeof value !== "string" || value.trim() === "") {
    return DEFAULT_READING_TYPOGRAPHY;
  }

  const parts = value.split(ENCODING_SEPARATOR);
  const [fontSize, measure, bodyFont, encodedCustomFont] = parts;

  const parsed: ReadingTypographyPreference = {
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

  if (parsed.bodyFont === "custom" && encodedCustomFont) {
    const customFontFamily = normalizeCustomFontFamily(
      decodeURIComponent(encodedCustomFont),
    );
    if (customFontFamily) {
      parsed.customFontFamily = customFontFamily;
    } else {
      parsed.bodyFont = DEFAULT_READING_TYPOGRAPHY.bodyFont;
    }
  }

  return normalizeReadingTypographyPreference(parsed);
}

export function readingTypographyToCookieValue(
  preference: ReadingTypographyPreference,
): string {
  const normalized = normalizeReadingTypographyPreference(preference);
  if (normalized.bodyFont === "custom" && normalized.customFontFamily) {
    return [
      normalized.fontSize,
      normalized.measure,
      "custom",
      encodeURIComponent(normalized.customFontFamily),
    ].join(ENCODING_SEPARATOR);
  }

  return [normalized.fontSize, normalized.measure, normalized.bodyFont].join(
    ENCODING_SEPARATOR,
  );
}

export function readingTypographyIsDefault(
  preference: ReadingTypographyPreference,
): boolean {
  const normalized = normalizeReadingTypographyPreference(preference);
  return (
    normalized.fontSize === DEFAULT_READING_TYPOGRAPHY.fontSize &&
    normalized.measure === DEFAULT_READING_TYPOGRAPHY.measure &&
    normalized.bodyFont === DEFAULT_READING_TYPOGRAPHY.bodyFont
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
  switch (bodyFont) {
    case "sans": {
      return "Sans";
    }
    case "custom": {
      return "Custom";
    }
    default: {
      return "Serif";
    }
  }
}

export function readingTypographySummary(
  preference: ReadingTypographyPreference,
): string {
  const normalized = normalizeReadingTypographyPreference(preference);
  if (readingTypographyIsDefault(normalized)) {
    return "Default";
  }

  const parts: Array<string> = [];
  if (normalized.fontSize !== DEFAULT_READING_TYPOGRAPHY.fontSize) {
    parts.push(readingFontSizeLabel(normalized.fontSize));
  }
  if (normalized.measure !== DEFAULT_READING_TYPOGRAPHY.measure) {
    parts.push(readingMeasureLabel(normalized.measure));
  }
  if (normalized.bodyFont !== DEFAULT_READING_TYPOGRAPHY.bodyFont) {
    if (normalized.bodyFont === "custom" && normalized.customFontFamily) {
      parts.push(normalized.customFontFamily);
    } else {
      parts.push(readingBodyFontLabel(normalized.bodyFont));
    }
  }

  return parts.join(" · ");
}

export function readingCustomFontFamily(
  preference: ReadingTypographyPreference,
): string | null {
  const normalized = normalizeReadingTypographyPreference(preference);
  return normalized.bodyFont === "custom"
    ? (normalized.customFontFamily ?? null)
    : null;
}

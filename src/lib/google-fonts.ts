/** Default Google Font when the user first picks Custom body font. */
export const DEFAULT_CUSTOM_GOOGLE_FONT = "Lora";

const GOOGLE_FONTS_CSS_BASE = "https://fonts.googleapis.com/css2";

/** Build a stylesheet URL that loads regular, semibold, and italic for article body. */
export function googleFontsStylesheetUrl(family: string): string {
  const query = new URLSearchParams({
    family: `${family.trim()}:ital,wght@0,400;0,600;1,400`,
    display: "swap",
  });
  return `${GOOGLE_FONTS_CSS_BASE}?${query.toString()}`;
}

/** Lighter stylesheet for font-picker previews (regular 400 only). */
export function googleFontsPreviewStylesheetUrl(family: string): string {
  const query = new URLSearchParams({
    family: `${family.trim()}:wght@400`,
    display: "swap",
  });
  return `${GOOGLE_FONTS_CSS_BASE}?${query.toString()}`;
}

export function googleFontFamilyStyle(family: string): string {
  return `"${normalizeGoogleFontFamily(family)}", serif`;
}

export function isValidGoogleFontFamily(name: string): boolean {
  const trimmed = name.trim();
  return (
    trimmed.length > 0 && trimmed.length <= 80 && /^[\w\s\-']+$/.test(trimmed)
  );
}

export function normalizeGoogleFontFamily(name: string): string {
  return name.trim().replaceAll(/\s+/g, " ");
}

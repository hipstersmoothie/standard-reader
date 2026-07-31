/**
 * Reads the fonts a publisher chose out of their native theme
 * (see `#/lib/publication-theme-source` for the colour half).
 *
 * Each platform states fonts differently:
 *
 * - **Leaflet** — either a built-in key (`source-sans`, `quattro`) or a
 *   self-describing `custom:<Family>:<url-spec>:<axes>` string, which already
 *   contains the exact family name and needs no lookup.
 * - **PCKT** — squashed lowercase keys with no separators (`spacemono`,
 *   `ibmplexserif`), under a single `font` used for both headings and body.
 * - **Offprint** — standard Google Fonts slugs (`dm-sans`, `source-serif-4`)
 *   split across `typography.headingFont` / `bodyFont`.
 *
 * Rather than hand-maintaining a table per platform, keys are normalized
 * (lowercased, non-alphanumerics stripped) and matched against the Google Fonts
 * catalog we already fetch for the reading-typography picker — that alone
 * resolves every Offprint slug and most PCKT keys. {@link PLATFORM_FONT_ALIASES}
 * covers the handful whose key doesn't normalize onto its family name.
 *
 * Anything that doesn't resolve is left alone rather than guessed at: an unknown
 * key means the reader keeps their own typography, which is the right outcome
 * for the platform *defaults* that make up most of the misses — PCKT's
 * `legible` / `sans` are generic slots rather than named faces, and Leaflet's
 * `quattro` (and PCKT's `iawritermono`) are iA Writer fonts that Google Fonts
 * does not serve.
 *
 * Client-safe: pure string handling, no catalog access.
 */

/** Lowercase, alphanumerics only — `DM Sans` and `dm-sans` both become `dmsans`. */
export function normalizeFontKey(value: string): string {
  return value.toLowerCase().replaceAll(/[^a-z0-9]/g, "");
}

/**
 * Keys whose normalized form doesn't match their Google Fonts family. Verified
 * against the live catalog; each target is a real family.
 */
export const PLATFORM_FONT_ALIASES: Readonly<Record<string, string>> = {
  // Adobe renamed Source Sans Pro to Source Sans 3; Leaflet still says
  // `source-sans`, and it's their most-used body font.
  sourcesans: "Source Sans 3",
  // PCKT's key drops the middle word.
  cactusserif: "Cactus Classical Serif",
  anon: "Anonymous Pro",
};

export interface PublicationFontRequest {
  /** Family stated outright by the record — no catalog lookup needed. */
  family: string | null;
  /** Platform key or slug to resolve against the catalog. */
  key: string | null;
}

export interface PublicationFontRequests {
  heading: PublicationFontRequest | null;
  body: PublicationFontRequest | null;
}

const EMPTY: PublicationFontRequests = { heading: null, body: null };

/**
 * Leaflet's `custom:` form, e.g.
 * `custom:Source Serif 4:Source+Serif+4:ital,wght@0,400;0,700;1,400;1,700` —
 * the second segment is the family name as Google Fonts spells it.
 */
function parseFontValue(value: unknown): PublicationFontRequest | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  if (trimmed.startsWith("custom:")) {
    const rest = trimmed.slice("custom:".length);
    const family = (rest.split(":")[0] ?? "").trim();
    return family.length > 0 ? { family, key: null } : null;
  }

  return { family: null, key: trimmed };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : null;
}

/** Pull the heading/body font requests out of a publisher's native theme. */
export function publicationFontRequests(
  nativeTheme: unknown,
): PublicationFontRequests {
  const theme = asRecord(nativeTheme);
  const type = typeof theme?.$type === "string" ? theme.$type : null;
  if (!theme || !type) return EMPTY;

  if (type === "blog.pckt.theme") {
    // One font for the whole publication.
    const font = parseFontValue(theme.font);
    return { heading: font, body: font };
  }

  if (type === "app.offprint.theme") {
    const typography = asRecord(theme.typography);
    if (!typography) return EMPTY;
    return {
      heading: parseFontValue(typography.headingFont),
      body: parseFontValue(typography.bodyFont),
    };
  }

  if (type.startsWith("pub.leaflet.")) {
    return {
      heading: parseFontValue(theme.headingFont),
      body: parseFontValue(theme.bodyFont),
    };
  }

  return EMPTY;
}

export interface PublicationFonts {
  heading: string | null;
  body: string | null;
}

export const NO_PUBLICATION_FONTS: PublicationFonts = {
  heading: null,
  body: null,
};

/**
 * Turn font requests into Google Fonts family names, given a lookup built from
 * the catalog (normalized key → family). Unresolved requests stay `null`.
 */
export function resolvePublicationFonts(
  requests: PublicationFontRequests,
  lookup: (normalizedKey: string) => string | null,
): PublicationFonts {
  const resolve = (request: PublicationFontRequest | null): string | null => {
    if (!request) return null;
    if (request.family) return request.family;
    if (!request.key) return null;
    const normalized = normalizeFontKey(request.key);
    if (normalized.length === 0) return null;
    return PLATFORM_FONT_ALIASES[normalized] ?? lookup(normalized);
  };
  return { heading: resolve(requests.heading), body: resolve(requests.body) };
}

/** Whether a resolved pair carries anything worth loading. */
export function hasPublicationFonts(
  fonts: PublicationFonts | null | undefined,
): fonts is PublicationFonts {
  return Boolean(fonts && (fonts.heading || fonts.body));
}

/**
 * Google Fonts stylesheet URL for the resolved families, or null.
 *
 * Deliberately requests no `wght` axis: Google Fonts CSS2 fails the *whole*
 * request when any family lacks a requested weight, which would silently drop
 * every font on the page. Bold falls back to synthetic bold. Same reasoning as
 * `googleFontsHref` in the magazine.
 */
export function publicationFontsHref(
  fonts: PublicationFonts | null | undefined,
): string | null {
  if (!fonts) return null;
  const families = [fonts.heading, fonts.body].filter(
    (family) => family !== null,
  );
  if (families.length === 0) return null;
  const params = [...new Set(families)]
    .map(
      (family) => `family=${encodeURIComponent(family).replaceAll("%20", "+")}`,
    )
    .join("&");
  return `https://fonts.googleapis.com/css2?${params}&display=swap`;
}

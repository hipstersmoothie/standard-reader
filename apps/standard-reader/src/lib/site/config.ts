import type { SiteStyle } from "./styles";
import { DEFAULT_SITE_STYLE, toSiteStyle } from "./styles";

/** One outbound link in a site's masthead. */
export interface SiteLink {
  label: string;
  url: string;
}

/**
 * A site's own four flat colors. Structurally the light half of
 * `PublicationThemeColors`, so `publicationThemeScaleVars` generates the full
 * scale from it without a second colour pipeline.
 */
export interface SiteTheme {
  background: string | null;
  foreground: string | null;
  accent: string | null;
  accentForeground: string | null;
}

/**
 * Everything a standalone site needs to present itself, resolved from the
 * owner's `app.standard-reader.site` record (or defaulted when they have none —
 * a site always renders, configured or not).
 */
export interface SiteConfig {
  style: SiteStyle;
  /** Short line under the name; null falls back to the description or bio. */
  tagline: string | null;
  /** The owner's own colors; null means "use the publication's theme". */
  theme: SiteTheme | null;
  links: Array<SiteLink>;
  /** Whether the footer links back to the Standard Reader page. */
  showStandardReaderLink: boolean;
  /** Whether the owner has actually configured this site. */
  configured: boolean;
}

export const DEFAULT_SITE_CONFIG: SiteConfig = {
  style: DEFAULT_SITE_STYLE,
  tagline: null,
  theme: null,
  links: [],
  showStandardReaderLink: true,
  configured: false,
};

/** Most links a masthead will carry — matches the lexicon's `maxLength`. */
export const SITE_MAX_LINKS = 8;
export const SITE_MAX_TAGLINE_LENGTH = 300;
export const SITE_MAX_LINK_LABEL_LENGTH = 120;

const HEX_COLOR = /^#(?:[\da-f]{3}|[\da-f]{6})$/i;

/**
 * A hex colour, lowercased, or null. Everything downstream of a stored theme
 * assumes `#rgb`/`#rrggbb` — the scale generator parses exactly that and
 * silently falls back to its own defaults otherwise — so anything else is
 * dropped here rather than allowed to reach a page as a missing colour.
 */
export function normalizeHexColor(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim().toLowerCase();
  return HEX_COLOR.test(trimmed) ? trimmed : null;
}

/** A theme with at least one colour stated, or null when it states none. */
export function normalizeSiteTheme(value: unknown): SiteTheme | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Record<string, unknown>;
  const theme: SiteTheme = {
    background: normalizeHexColor(raw.background),
    foreground: normalizeHexColor(raw.foreground),
    accent: normalizeHexColor(raw.accent),
    accentForeground: normalizeHexColor(raw.accentForeground),
  };
  const stated =
    theme.background ??
    theme.foreground ??
    theme.accent ??
    theme.accentForeground;
  return stated ? theme : null;
}

/**
 * Links that would actually work. A label with no URL, or a URL in a scheme a
 * browser won't navigate to from a link, is dropped — a masthead is a public
 * surface, and `javascript:` in someone's repo must not become a link on a page
 * we render.
 */
export function normalizeSiteLinks(value: unknown): Array<SiteLink> {
  if (!Array.isArray(value)) return [];
  const links: Array<SiteLink> = [];
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;
    const raw = entry as Record<string, unknown>;
    const label = typeof raw.label === "string" ? raw.label.trim() : "";
    const url = typeof raw.url === "string" ? raw.url.trim() : "";
    if (!label || !url) continue;
    if (!/^https?:\/\//i.test(url)) continue;
    links.push({
      label: label.slice(0, SITE_MAX_LINK_LABEL_LENGTH),
      url,
    });
    if (links.length >= SITE_MAX_LINKS) break;
  }
  return links;
}

/**
 * Build a config from a `sites` row (or from a record's fields, which the row
 * mirrors one-for-one). Every field is defensive: the row is a mirror of
 * somebody else's repo, and a site page must render whatever is in it.
 */
export function siteConfigFromRow(row: {
  style: string | null;
  tagline: string | null;
  themeBackground: string | null;
  themeForeground: string | null;
  themeAccent: string | null;
  themeAccentForeground: string | null;
  links: unknown;
  showStandardReaderLink: boolean | null;
}): SiteConfig {
  return {
    style: toSiteStyle(row.style),
    tagline: row.tagline?.trim() || null,
    theme: normalizeSiteTheme({
      background: row.themeBackground,
      foreground: row.themeForeground,
      accent: row.themeAccent,
      accentForeground: row.themeAccentForeground,
    }),
    links: normalizeSiteLinks(row.links),
    showStandardReaderLink: row.showStandardReaderLink !== false,
    configured: true,
  };
}

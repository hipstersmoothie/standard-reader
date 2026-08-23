/**
 * `@standard-reader/publication-theme` — a publication's palette, shared.
 *
 * A `site.standard.theme.basic` record states four flat colors. Everything a
 * themed surface needs beyond that — the full light *and* dark scales, the
 * contrast nudging that keeps an accent readable on its own paper, the
 * Google-Fonts href for the families a publisher named — is derived from those
 * four, and the derivation must be identical wherever it happens: Standard
 * Reader paints publication pages with it, Standard Writer paints standalone
 * sites and OG images with it, and a publisher who picked one accent expects
 * one accent.
 *
 * Ships source rather than a build: the consuming app compiles StyleX, and
 * `./tokens` is a StyleX theme.
 */
export * from "./scale.ts";
export * from "./fonts.ts";
export * from "./theme-source.ts";
export * from "./quote-colors.ts";

/**
 * Re-export shim. The palette derivation moved to
 * `@standard-reader/publication-theme` when Standard Writer began painting
 * standalone sites with the same colors — one derivation, two apps. This file
 * keeps the reader's own `#/lib/publication-theme-source` imports pointing
 * somewhere sensible from inside this app.
 */
export * from "@standard-reader/publication-theme/theme-source";

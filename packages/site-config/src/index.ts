/**
 * `@standard-reader/site-config` — a standalone site's configuration record,
 * normalized once for everyone who touches it.
 *
 * Two apps sit either side of this: Standard Reader's ingester turns an
 * `app.standard-reader.site` record into a `sites` row, and Standard Writer
 * turns that row back into a rendered page. Both must agree about what a valid
 * style is, which colors are usable, and which links are safe to put on a
 * public page — so the normalizers live here rather than being written twice
 * and drifting apart.
 */
export * from "./config.ts";
export * from "./styles.ts";
export * from "./url.ts";

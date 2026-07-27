/**
 * HTML `width`/`height` attributes are only meaningful as layout numbers when
 * they are unitless or `px`. Publishers routinely ship `width="100%"` on
 * responsive embeds; parsing that as `100` and pairing it with `height="200"`
 * would produce a 1:2 aspect ratio and render the embed at twice the column
 * width tall.
 */
const PIXEL_DIMENSION = /^\s*(\d+(?:\.\d+)?)\s*(?:px)?\s*$/i;

/**
 * Parse a dimension into pixels, rejecting relative units (`%`, `em`, `vw`, …)
 * and non-positive values.
 */
export function parsePixelDimension(
  value: string | number | undefined | null,
): number | undefined {
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 ? value : undefined;
  }
  if (typeof value !== "string") return undefined;

  const match = PIXEL_DIMENSION.exec(value);
  if (!match) return undefined;

  const parsed = Number.parseFloat(match[1]);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

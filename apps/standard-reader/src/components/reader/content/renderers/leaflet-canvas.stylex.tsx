import * as stylex from "@stylexjs/stylex";

/**
 * Container queries for Leaflet canvas pages. A canvas registers the
 * `leaflet-canvas` container while it may reflow; below `reflow` a full-width
 * canvas would draw its text at under 60% size, so its blocks fall back into
 * one reading column instead (see `leaflet-canvas.tsx`).
 */
/** Leaflet's width for a canvas page without a fixed size (`LEAFLET_CANVAS_WIDTH`). */
export const canvasSizes = stylex.defineConsts({
  width: "1272px",
  /** `CANVAS_MOBILE_VIEW_WIDTH`. */
  mobileView: "520px",
});

export const canvasQueries = stylex.defineConsts({
  reflow: "@container leaflet-canvas (max-width: 48rem)",
  frameNarrow: "@container leaflet-canvas-frame (max-width: 48rem)",
});

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

/** Minimum stage width to enter two-page spread mode. */
export const SPREAD_ENTER_WIDTH = 760;

/** Stay in spread until width drops below this (avoids flicker around 760px). */
export const SPREAD_EXIT_WIDTH = 720;

export interface Geom {
  spread: boolean;
  perView: number;
  pageW: number;
  pageH: number;
  hMargin: number;
  vMargin: number;
  colW: number;
  gap: number;
}

/** Decide spread vs single-page with hysteresis so resize drags do not oscillate. */
export function resolveSpreadMode(
  width: number,
  height: number,
  prevSpread: boolean,
): boolean {
  const w = Math.round(width);
  const h = Math.round(height);
  if (w <= 0 || h <= 0) return prevSpread;
  if (prevSpread) {
    // Keep spread through square aspect; exit only in portrait or below exit width.
    return w >= SPREAD_EXIT_WIDTH && w >= h;
  }
  return w >= SPREAD_ENTER_WIDTH && w > h;
}

export function readGeom(
  width: number,
  height: number,
  prevSpread = false,
): Geom {
  const w = Math.round(width);
  const h = Math.round(height);
  const spread = resolveSpreadMode(w, h, prevSpread);
  const perView = spread ? 2 : 1;
  const pageW = w / perView;
  const hMargin = Math.round(clamp(pageW * 0.08, 24, 96));
  const vMargin = Math.round(clamp(h * 0.07, 28, 110));
  return {
    spread,
    perView,
    pageW,
    pageH: h,
    hMargin,
    vMargin,
    colW: pageW - 2 * hMargin,
    gap: 2 * hMargin,
  };
}

export function geomEqual(a: Geom, b: Geom): boolean {
  return (
    a.spread === b.spread &&
    a.pageW === b.pageW &&
    a.pageH === b.pageH &&
    a.hMargin === b.hMargin &&
    a.vMargin === b.vMargin
  );
}

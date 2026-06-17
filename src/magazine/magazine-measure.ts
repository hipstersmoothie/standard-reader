import { applyForcedColumnBreaks } from "./feature-layout";
import type { Geom } from "./magazine-geom";

export interface FlowMeasure {
  columns: number;
  slideCount: number;
  featureCols: Array<number>;
}

export interface ResizeAnchor {
  col: number;
  featureIndex: number;
  offsetInFeature: number;
}

export function featureIndexAtColumn(
  col: number,
  featureCols: Array<number>,
): number {
  let found = -1;
  for (let i = 0; i < featureCols.length; i++) {
    if (featureCols[i] <= col) found = i;
  }
  return found;
}

export function captureResizeAnchor(
  activeSlide: number,
  geom: Geom,
  featureCols: Array<number>,
): ResizeAnchor {
  const col = activeSlide * geom.perView;
  const featureIndex = featureIndexAtColumn(col, featureCols);
  const featureStartCol =
    featureIndex >= 0 ? (featureCols[featureIndex] ?? 0) : 0;
  return {
    col,
    featureIndex,
    offsetInFeature: featureIndex >= 0 ? col - featureStartCol : col,
  };
}

export function slideForAnchor(
  anchor: ResizeAnchor,
  geom: Geom,
  measure: FlowMeasure,
): number {
  const maxSlide = Math.max(0, measure.slideCount - 1);
  const targetCol =
    anchor.featureIndex >= 0
      ? (measure.featureCols[anchor.featureIndex] ?? 0) + anchor.offsetInFeature
      : anchor.col;
  return Math.max(
    0,
    Math.min(maxSlide, Math.floor(targetCol / Math.max(1, geom.perView))),
  );
}

/** Synchronous read of flowed column layout — used after resize before React state catches up. */
export function readFlowMeasure({
  flow,
  geom,
  featureEls,
  endEl,
  requireEnd,
}: {
  flow: HTMLElement;
  geom: Geom;
  featureEls: Array<HTMLElement | null>;
  endEl: HTMLElement | null;
  requireEnd: boolean;
}): FlowMeasure | null {
  applyForcedColumnBreaks(flow);

  const pitch = geom.colW + geom.gap;
  if (pitch <= 0) return null;

  const flowLeft = flow.getBoundingClientRect().left;
  const columnAt = (el: HTMLElement | null) => {
    if (!el) return null;
    const x = el.getBoundingClientRect().left - flowLeft;
    return Math.max(0, Math.round(x / pitch));
  };
  const columnSpanEnd = (el: HTMLElement | null) => {
    if (!el) return null;
    const x = el.getBoundingClientRect().right - flowLeft;
    return Math.max(0, Math.ceil(x / pitch) - 1);
  };

  let columns = Math.max(
    1,
    Math.ceil((flow.scrollWidth + geom.gap - 1) / pitch),
  );

  const endStartCol = columnAt(endEl);
  const endSpanCol = columnSpanEnd(endEl);
  if (requireEnd && !endEl) return null;

  const endAnchorCol =
    endStartCol != null
      ? Math.max(endStartCol, endSpanCol ?? endStartCol)
      : null;
  if (endAnchorCol != null) {
    columns = Math.max(columns, endAnchorCol + geom.perView);
  }

  let slideCount = Math.max(1, Math.ceil(columns / geom.perView));
  if (endStartCol != null) {
    slideCount = Math.max(
      slideCount,
      Math.floor(endStartCol / geom.perView) + 1,
    );
  }

  const featureCols = featureEls.map((el) => columnAt(el) ?? 0);

  return { columns, slideCount, featureCols };
}

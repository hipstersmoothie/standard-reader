import { describe, expect, it } from "vitest";

import type { Geom } from "./magazine-geom";
import {
  captureResizeAnchor,
  slideForAnchor,
  type FlowMeasure,
  type ResizeAnchor,
} from "./magazine-measure";

const spreadGeom: Geom = {
  spread: true,
  perView: 2,
  pageW: 600,
  pageH: 800,
  hMargin: 48,
  vMargin: 56,
  colW: 504,
  gap: 96,
};

const singleGeom: Geom = {
  ...spreadGeom,
  spread: false,
  perView: 1,
  pageW: 1200,
  colW: 1104,
};

const featureCols = [2, 8, 14];

describe("captureResizeAnchor", () => {
  it("records offset within a feature", () => {
    expect(captureResizeAnchor(3, spreadGeom, featureCols)).toEqual({
      col: 6,
      featureIndex: 0,
      offsetInFeature: 4,
    });
  });
});

describe("slideForAnchor", () => {
  it("restores mid-feature column after geometry change", () => {
    const anchor: ResizeAnchor = {
      col: 6,
      featureIndex: 0,
      offsetInFeature: 4,
    };
    const remeasured: FlowMeasure = {
      columns: 20,
      slideCount: 10,
      featureCols: [9, 15, 21],
    };
    expect(slideForAnchor(anchor, spreadGeom, remeasured)).toBe(6);
  });

  it("restores cover column before features", () => {
    const measure: FlowMeasure = {
      columns: 20,
      slideCount: 10,
      featureCols: [2, 9, 15],
    };
    const anchor: ResizeAnchor = {
      col: 1,
      featureIndex: -1,
      offsetInFeature: 1,
    };
    expect(slideForAnchor(anchor, spreadGeom, measure)).toBe(0);
  });

  it("maps to correct slide when perView changes to single", () => {
    const anchor: ResizeAnchor = {
      col: 6,
      featureIndex: 0,
      offsetInFeature: 4,
    };
    const remeasured: FlowMeasure = {
      columns: 30,
      slideCount: 30,
      featureCols: [3, 12, 22],
    };
    expect(slideForAnchor(anchor, singleGeom, remeasured)).toBe(7);
  });
});

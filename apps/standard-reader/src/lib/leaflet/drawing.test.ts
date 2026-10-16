import { describe, expect, it } from "vitest";

import { leafletDrawingGeometry } from "./drawing";
import { LEAFLET_BLOCK } from "./types";

describe("leafletDrawingGeometry", () => {
  it("draws strokes as smooth paths through x, y, pressure triples", () => {
    const geometry = leafletDrawingGeometry({
      $type: LEAFLET_BLOCK.drawing,
      viewBox: { x: 10, y: 20, width: 300, height: 200 },
      strokes: [
        {
          points: [0, 0, 500, 10, 10, 600, 20, 0, 700],
          color: "#FFB400",
          size: 8,
        },
      ],
    });

    expect(geometry).toEqual({
      viewBox: { x: 10, y: 20, width: 300, height: 200 },
      fills: [],
      strokes: [
        {
          d: "M0 0Q10 10 15 5L20 0",
          color: { kind: "hex", value: "#FFB400" },
          width: 8,
        },
      ],
    });
  });

  it("maps theme color names and falls back to primary for anything else", () => {
    const geometry = leafletDrawingGeometry({
      strokes: [
        { points: [0, 0, 0], color: "accent", size: 4 },
        { points: [0, 0, 0], color: "url(javascript:x)", size: 4 },
      ],
      fills: [{ points: [0, 0, 10, 0, 10, 10], color: "tertiary" }],
    });

    expect(geometry?.strokes.map((stroke) => stroke.color)).toEqual([
      { kind: "theme", value: "accent" },
      { kind: "theme", value: "primary" },
    ]);
    expect(geometry?.strokes[0]?.d).toBe("M0 0L0 0");
    expect(geometry?.fills).toEqual([
      { d: "M0 0L10 0L10 10Z", color: { kind: "theme", value: "tertiary" } },
    ]);
  });

  it("frames the ink when the view box is missing", () => {
    const geometry = leafletDrawingGeometry({
      strokes: [{ points: [100, 200, 500, 140, 260, 500], size: 20 }],
    });

    expect(geometry?.viewBox).toEqual({ x: 90, y: 190, width: 60, height: 80 });
  });

  it("returns null when there is nothing to draw", () => {
    expect(leafletDrawingGeometry({ strokes: [{ points: [1] }] })).toBeNull();
  });
});

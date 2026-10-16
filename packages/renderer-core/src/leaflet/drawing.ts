import type { LeafletDrawingBlock, LeafletDrawingViewBox } from "./types.js";

/** Theme colors a drawing may name instead of a hex value. */
export type LeafletDrawingThemeColor = "primary" | "accent" | "tertiary";

/** A hex color, or one of the document theme's colors. */
export type LeafletDrawingColor =
  | { kind: "hex"; value: string }
  | { kind: "theme"; value: LeafletDrawingThemeColor };

export interface LeafletDrawingPath {
  /** SVG path data in drawing space. */
  d: string;
  color: LeafletDrawingColor;
}

export interface LeafletDrawingStrokePath extends LeafletDrawingPath {
  /** Stroke width in drawing space. */
  width: number;
}

export interface LeafletDrawingGeometry {
  viewBox: LeafletDrawingViewBox;
  /** Painted first, beneath the strokes. */
  fills: Array<LeafletDrawingPath>;
  strokes: Array<LeafletDrawingStrokePath>;
}

const HEX_COLOR = /^#[\da-f]{3,8}$/i;
const THEME_COLORS = new Set<string>(["primary", "accent", "tertiary"]);
const DEFAULT_STROKE_SIZE = 16;

function drawingColor(value: unknown): LeafletDrawingColor {
  if (typeof value === "string") {
    if (HEX_COLOR.test(value)) return { kind: "hex", value };
    if (THEME_COLORS.has(value)) {
      return { kind: "theme", value: value as LeafletDrawingThemeColor };
    }
  }
  return { kind: "theme", value: "primary" };
}

/** Split a flattened number array into points of `stride` values each. */
function pointsOf(
  values: unknown,
  stride: number,
): Array<{ x: number; y: number }> {
  if (!Array.isArray(values)) return [];
  const points: Array<{ x: number; y: number }> = [];
  for (let index = 0; index + 1 < values.length; index += stride) {
    const x: unknown = values[index];
    const y: unknown = values[index + 1];
    if (typeof x !== "number" || typeof y !== "number") continue;
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    points.push({ x, y });
  }
  return points;
}

/**
 * A stroke as one smooth path: quadratic curves through the midpoints between
 * input points, which is the centre line perfect-freehand outlines. Width is
 * carried as a constant stroke width rather than a pressure-varying outline.
 */
function strokePathData(points: Array<{ x: number; y: number }>): string {
  const [first] = points;
  if (!first) return "";
  // A lone point still needs a segment for the round cap to draw a dot.
  if (points.length === 1)
    return `M${first.x} ${first.y}L${first.x} ${first.y}`;

  let d = `M${first.x} ${first.y}`;
  for (const [index, point] of points.entries()) {
    if (index === 0) continue;
    const next = points[index + 1];
    d += next
      ? `Q${point.x} ${point.y} ${(point.x + next.x) / 2} ${(point.y + next.y) / 2}`
      : `L${point.x} ${point.y}`;
  }
  return d;
}

function polygonPathData(points: Array<{ x: number; y: number }>): string {
  if (points.length < 3) return "";
  return `${points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join("")}Z`;
}

function validViewBox(value: unknown): LeafletDrawingViewBox | null {
  if (typeof value !== "object" || value === null) return null;
  const { x, y, width, height } = value as Record<string, unknown>;
  if (
    typeof x !== "number" ||
    typeof y !== "number" ||
    typeof width !== "number" ||
    typeof height !== "number" ||
    width <= 0 ||
    height <= 0
  ) {
    return null;
  }
  return { x, y, width, height };
}

/**
 * Resolve a `pub.leaflet.blocks.drawing` into SVG paths. Returns null when it
 * has nothing to draw. A missing view box falls back to the bounds of the ink.
 */
export function leafletDrawingGeometry(
  block: LeafletDrawingBlock,
): LeafletDrawingGeometry | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const extend = (points: Array<{ x: number; y: number }>, pad: number) => {
    for (const point of points) {
      minX = Math.min(minX, point.x - pad);
      minY = Math.min(minY, point.y - pad);
      maxX = Math.max(maxX, point.x + pad);
      maxY = Math.max(maxY, point.y + pad);
    }
  };

  const fills: Array<LeafletDrawingPath> = [];
  for (const fill of block.fills ?? []) {
    const points = pointsOf(fill.points, 2);
    const d = polygonPathData(points);
    if (!d) continue;
    extend(points, 0);
    fills.push({ d, color: drawingColor(fill.color) });
  }

  const strokes: Array<LeafletDrawingStrokePath> = [];
  for (const stroke of block.strokes ?? []) {
    const points = pointsOf(stroke.points, 3);
    const d = strokePathData(points);
    if (!d) continue;
    const width =
      typeof stroke.size === "number" && stroke.size > 0
        ? stroke.size
        : DEFAULT_STROKE_SIZE;
    extend(points, width / 2);
    strokes.push({ d, color: drawingColor(stroke.color), width });
  }

  if (fills.length === 0 && strokes.length === 0) return null;

  const viewBox = validViewBox(block.viewBox) ?? {
    x: minX,
    y: minY,
    width: Math.max(1, maxX - minX),
    height: Math.max(1, maxY - minY),
  };
  return { viewBox, fills, strokes };
}

/**
 * Theme colors for a drawing rendered as a standalone image, where it cannot
 * inherit the host page's colors: light ink, with a dark-scheme override.
 */
const SVG_THEME_COLORS: Record<
  LeafletDrawingThemeColor,
  { light: string; dark: string }
> = {
  primary: { light: "#1f1f1f", dark: "#ececec" },
  accent: { light: "#2563eb", dark: "#60a5fa" },
  tertiary: { light: "#6b6b6b", dark: "#a3a3a3" },
};

function svgColor(color: LeafletDrawingColor, attribute: "stroke" | "fill") {
  return color.kind === "hex"
    ? `${attribute}="${color.value}"`
    : `class="${attribute}-${color.value}"`;
}

/**
 * A drawing as a self-contained SVG document, so any renderer can show it as a
 * plain image. Theme colors follow the viewer's color scheme.
 */
export function leafletDrawingSvg(geometry: LeafletDrawingGeometry): string {
  const { x, y, width, height } = geometry.viewBox;
  const themeRules = (scheme: "light" | "dark") =>
    Object.entries(SVG_THEME_COLORS)
      .map(
        ([name, value]) =>
          `.stroke-${name}{stroke:${value[scheme]}}.fill-${name}{fill:${value[scheme]}}`,
      )
      .join("");
  const fills = geometry.fills.map(
    (fill) => `<path d="${fill.d}" ${svgColor(fill.color, "fill")}/>`,
  );
  const strokes = geometry.strokes.map(
    (stroke) =>
      `<path d="${stroke.d}" fill="none" stroke-width="${stroke.width}" stroke-linecap="round" stroke-linejoin="round" ${svgColor(stroke.color, "stroke")}/>`,
  );
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${width} ${height}" width="${width}" height="${height}" overflow="visible"><style>${themeRules("light")}@media (prefers-color-scheme:dark){${themeRules("dark")}}</style>${fills.join("")}${strokes.join("")}</svg>`;
}

/** `leafletDrawingSvg` as a `data:` URL for an `<img src>`. */
export function leafletDrawingDataUrl(
  geometry: LeafletDrawingGeometry,
): string {
  return `data:image/svg+xml,${encodeURIComponent(leafletDrawingSvg(geometry))}`;
}

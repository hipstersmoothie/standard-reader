"use client";

import { useLingui } from "@lingui/react/macro";
import { Button } from "@standard-reader/design-system/button";
import { uiColor } from "@standard-reader/design-system/theme/color.stylex";
import { gap } from "@standard-reader/design-system/theme/semantic-spacing.stylex";
import { spacing } from "@standard-reader/design-system/theme/spacing.stylex";
import * as stylex from "@stylexjs/stylex";
import type { CSSProperties, ReactNode } from "react";
import { Fragment, useLayoutEffect, useRef, useState } from "react";

import { leafletImageCid } from "#/lib/leaflet/image";
import type {
  LeafletCanvasFrame,
  LeafletCanvasPlacement,
  LeafletRenderableBlock,
} from "#/lib/leaflet/types";
import { cdnImageUrl } from "#/server/atproto/blob";

import type { ContentBlobContext } from "../types";
import {
  CANVAS_MOBILE_VIEW_WIDTH,
  LEAFLET_CANVAS_WIDTH,
  LeafletCanvasContext,
  REFLOWABLE_CANVAS_MIN_WIDTH,
} from "./leaflet-canvas-context";
import { canvasQueries, canvasSizes } from "./leaflet-canvas.stylex";

/** Leaflet's padding inside every canvas block, in canvas px. */
const CANVAS_BLOCK_PADDING = "12px";
/** How far past the right edge a block may sit and still show (Leaflet's `MIN_VISIBLE`). */
const MIN_VISIBLE = 24;
/** Leaflet's 32px grid tile (`CanvasBackgroundPattern`), as an SVG mask. */
const GRID_TILE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Cpath fill-rule='evenodd' d='M16.5 0H15.5L15.5 2.06061C15.5 2.33675 15.7239 2.56061 16 2.56061C16.2761 2.56061 16.5 2.33675 16.5 2.06061V0ZM0 16.5V15.5L2.06061 15.5C2.33675 15.5 2.56061 15.7239 2.56061 16C2.56061 16.2761 2.33675 16.5 2.06061 16.5L0 16.5ZM16.5 32H15.5V29.9394C15.5 29.6633 15.7239 29.4394 16 29.4394C16.2761 29.4394 16.5 29.6633 16.5 29.9394V32ZM32 15.5V16.5L29.9394 16.5C29.6633 16.5 29.4394 16.2761 29.4394 16C29.4394 15.7239 29.6633 15.5 29.9394 15.5H32ZM5.4394 16C5.4394 15.7239 5.66325 15.5 5.93939 15.5H10.0606C10.3367 15.5 10.5606 15.7239 10.5606 16C10.5606 16.2761 10.3368 16.5 10.0606 16.5H5.9394C5.66325 16.5 5.4394 16.2761 5.4394 16ZM13.4394 16C13.4394 15.7239 13.6633 15.5 13.9394 15.5H15.5V13.9394C15.5 13.6633 15.7239 13.4394 16 13.4394C16.2761 13.4394 16.5 13.6633 16.5 13.9394V15.5H18.0606C18.3367 15.5 18.5606 15.7239 18.5606 16C18.5606 16.2761 18.3367 16.5 18.0606 16.5H16.5V18.0606C16.5 18.3367 16.2761 18.5606 16 18.5606C15.7239 18.5606 15.5 18.3367 15.5 18.0606V16.5H13.9394C13.6633 16.5 13.4394 16.2761 13.4394 16ZM21.4394 16C21.4394 15.7239 21.6633 15.5 21.9394 15.5H26.0606C26.3367 15.5 26.5606 15.7239 26.5606 16C26.5606 16.2761 26.3367 16.5 26.0606 16.5H21.9394C21.6633 16.5 21.4394 16.2761 21.4394 16ZM16 5.4394C16.2761 5.4394 16.5 5.66325 16.5 5.93939V10.0606C16.5 10.3367 16.2761 10.5606 16 10.5606C15.7239 10.5606 15.5 10.3368 15.5 10.0606V5.9394C15.5 5.66325 15.7239 5.4394 16 5.4394ZM16 21.4394C16.2761 21.4394 16.5 21.6633 16.5 21.9394V26.0606C16.5 26.3367 16.2761 26.5606 16 26.5606C15.7239 26.5606 15.5 26.3367 15.5 26.0606V21.9394C15.5 21.6633 15.7239 21.4394 16 21.4394Z'/%3E%3C/svg%3E";
/**
 * The canvas fitted to its frame, never past 1:1. Dividing two lengths yields
 * a plain number in current browsers; where it doesn't, the declaration is
 * invalid and `useZoomFallback` writes `--sr-canvas-zoom` instead.
 */
const FIT_ZOOM =
  "var(--sr-canvas-zoom, min(1, calc(100cqw / (var(--sr-canvas-width) * 1px))))";
/** Default background tile width, in canvas px. */
const BACKGROUND_TILE_WIDTH = 500;

const styles = stylex.create({
  frame: {
    containerType: "inline-size",
    // Blocks stack among themselves by z-index; isolating the canvas keeps
    // that stacking inside it, under the sticky reader chrome.
    isolation: "isolate",
    marginBottom: spacing["6"],
    marginTop: spacing["0"],
    width: "100%",
  },
  frameReflowable: {
    containerName: "leaflet-canvas leaflet-canvas-frame",
  },
  frameFixed: {
    containerName: "leaflet-canvas-frame",
  },
  /** The reader asked for the original layout on a narrow screen. */
  frameOriginal: {
    containerName: "leaflet-canvas-frame",
    overflowX: "auto",
  },
  toggleRow: {
    display: { default: "none", [canvasQueries.frameNarrow]: "flex" },
    justifyContent: "center",
    marginBottom: gap["2xl"],
  },
  layer: {
    // Canvas positions are physical px from the top-left corner, whatever the
    // text direction; each block sets its own `dir` for its text.
    direction: "ltr",
    display: { default: "grid", [canvasQueries.reflow]: "block" },
    // Leaflet's canvas base size — canvas px, scaled with the canvas.
    fontSize: { default: "16px", [canvasQueries.reflow]: "inherit" },
    lineHeight: { default: 1.5, [canvasQueries.reflow]: "inherit" },
    paddingBottom: {
      default: CANVAS_BLOCK_PADDING,
      [canvasQueries.reflow]: spacing["0"],
    },
    position: "relative",
    width: {
      default: "calc(var(--sr-canvas-width) * 1px)",
      [canvasQueries.reflow]: "auto",
    },
    zoom: {
      // eslint-disable-next-line @stylexjs/valid-styles -- a var()/typed-calc() number
      default: FIT_ZOOM,
      [canvasQueries.reflow]: 1,
    },
  },
  // On a narrow screen the original layout frames Leaflet's mobile-view area
  // instead of the whole canvas, and the frame scrolls sideways.
  layerOriginal: {
    zoom: {
      // eslint-disable-next-line @stylexjs/valid-styles -- a var()/typed-calc() number
      default: FIT_ZOOM,
      // eslint-disable-next-line @stylexjs/valid-styles -- a var()/typed-calc() number
      [canvasQueries.frameNarrow]: `var(--sr-canvas-zoom, min(1, calc(100cqw / ${canvasSizes.mobileView})))`,
    },
  },
  layerFixedSize: {
    height: {
      default: "calc(var(--sr-canvas-height) * 1px)",
      [canvasQueries.reflow]: "auto",
    },
    overflow: { default: "clip", [canvasQueries.reflow]: "visible" },
  },
  backdrop: {
    alignSelf: "stretch",
    display: { default: "block", [canvasQueries.reflow]: "none" },
    gridColumnStart: "1",
    gridRowStart: "1",
    justifySelf: "stretch",
    pointerEvents: "none",
  },
  // Leaflet's own grid tile — a cross at each corner and dashes between —
  // used as a mask so it paints in the theme's border color.
  patternGrid: {
    backgroundColor: uiColor.border1,
    maskImage: `url("${GRID_TILE}")`,
    maskRepeat: "repeat",
    maskSize: "32px 32px",
  },
  patternDot: {
    backgroundImage: `radial-gradient(circle, ${uiColor.border1} 1px, transparent 1.5px)`,
    backgroundSize: "24px 24px",
  },
  backgroundTile: (url: string, tileWidth: number, opacity: number) => ({
    backgroundImage: url,
    backgroundPosition: "center",
    backgroundRepeat: "repeat",
    backgroundSize: `${tileWidth}px`,
    opacity,
  }),
  item: {
    alignSelf: "start",
    boxSizing: "border-box",
    display: "flow-root",
    gridColumnStart: "1",
    gridRowStart: "1",
    justifySelf: "start",
    // Canvas coordinates are physical, so these are too (see `layer`).
    marginLeft: {
      default: "calc(var(--sr-x) * 1px)",
      [canvasQueries.reflow]: spacing["0"],
    },
    marginTop: {
      default: "calc(var(--sr-y) * 1px)",
      [canvasQueries.reflow]: spacing["0"],
    },
    paddingBottom: {
      default: CANVAS_BLOCK_PADDING,
      [canvasQueries.reflow]: spacing["0"],
    },
    paddingInlineEnd: {
      default: CANVAS_BLOCK_PADDING,
      [canvasQueries.reflow]: spacing["0"],
    },
    paddingInlineStart: {
      default: CANVAS_BLOCK_PADDING,
      [canvasQueries.reflow]: spacing["0"],
    },
    paddingTop: {
      default: CANVAS_BLOCK_PADDING,
      [canvasQueries.reflow]: spacing["0"],
    },
    position: "relative",
    transform: {
      default: "rotate(calc(var(--sr-rotation) * 1deg))",
      [canvasQueries.reflow]: "none",
    },
    width: {
      default: "calc(var(--sr-item-width) * 1px)",
      [canvasQueries.reflow]: "auto",
    },
    zIndex: {
      // eslint-disable-next-line @stylexjs/valid-styles -- a var() number
      default: "var(--sr-layer)",
      [canvasQueries.reflow]: "auto",
    },
  },
  alignCenter: { textAlign: "center" },
  alignRight: { textAlign: "right" },
  alignJustify: { textAlign: "justify" },
});

export interface LeafletBlockEntry {
  block: LeafletRenderableBlock;
  /** Position in the document's flat block list. */
  index: number;
}

type RenderBlock = (block: LeafletRenderableBlock, index: number) => ReactNode;

/** The canvas placement a block has at `depth` canvases in (0 = outermost). */
function placementAt(
  block: LeafletRenderableBlock,
  depth: number,
): LeafletCanvasPlacement | undefined {
  const chain: Array<LeafletCanvasPlacement> = [];
  for (let current = block.canvas; current; current = current.parent) {
    chain.unshift(current);
  }
  return chain[depth];
}

/**
 * A run of Leaflet blocks in document order, with every stretch that came off
 * one canvas page drawn as that canvas. `renderBlock` draws a block that is
 * not on a canvas at this depth.
 */
export function LeafletBlockList({
  entries,
  renderBlock,
  blobContext,
  depth = 0,
}: {
  entries: Array<LeafletBlockEntry>;
  renderBlock: RenderBlock;
  blobContext?: ContentBlobContext;
  depth?: number;
}) {
  const nodes: Array<ReactNode> = [];
  let position = 0;
  while (position < entries.length) {
    const first = entries[position];
    if (!first) break;
    const frame = placementAt(first.block, depth)?.frame;
    if (!frame) {
      nodes.push(
        <Fragment key={`block-${first.index}`}>
          {renderBlock(first.block, first.index)}
        </Fragment>,
      );
      position += 1;
      continue;
    }

    const run: Array<LeafletBlockEntry> = [];
    while (position < entries.length) {
      const entry = entries[position];
      if (!entry || placementAt(entry.block, depth)?.frame !== frame) break;
      run.push(entry);
      position += 1;
    }
    nodes.push(
      <LeafletCanvasView
        key={`canvas-${first.index}`}
        frame={frame}
        entries={run}
        depth={depth}
        renderBlock={renderBlock}
        blobContext={blobContext}
      />,
    );
  }
  return nodes;
}

/**
 * Write the zoom in where the stylesheet can't compute it (no typed `calc()`
 * division), from the frame's measured width.
 */
function useZoomFallback(
  frameRef: React.RefObject<HTMLDivElement | null>,
  layerRef: React.RefObject<HTMLDivElement | null>,
  canvasWidth: number,
  original: boolean,
) {
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const layer = layerRef.current;
    if (!frame || !layer) return;
    if (CSS.supports("zoom", "calc(100cqw / 1px)")) return;

    const update = () => {
      const width = frame.clientWidth;
      const framed =
        original && width <= NARROW_FRAME_WIDTH
          ? CANVAS_MOBILE_VIEW_WIDTH
          : canvasWidth;
      layer.style.setProperty(
        "--sr-canvas-zoom",
        String(Math.min(1, width / framed)),
      );
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(frame);
    return () => observer.disconnect();
  }, [frameRef, layerRef, canvasWidth, original]);
}

/** `canvasQueries.frameNarrow`'s breakpoint (48rem), for the script path. */
const NARROW_FRAME_WIDTH = 768;

function alignmentStyle(alignment: string | undefined) {
  if (alignment?.endsWith("#textAlignCenter")) return styles.alignCenter;
  if (alignment?.endsWith("#textAlignRight")) return styles.alignRight;
  if (alignment?.endsWith("#textAlignJustify")) return styles.alignJustify;
  return null;
}

/**
 * A Leaflet canvas page laid out as its author placed it: every block at its
 * x/y, width and rotation, stacked in Leaflet's paint order, over the
 * canvas's pattern and background, with the whole canvas scaled to fit the
 * column (never past 1:1). Blocks render in reading order, so quote
 * highlights, footnotes and narration count through them as they do for a
 * linear page.
 *
 * Below `canvasQueries.reflow` a full-width canvas would shrink its text past
 * reading size, so it reflows into one column in that same reading order; the
 * reader can still ask for the original layout.
 */
function LeafletCanvasView({
  frame,
  entries,
  depth,
  renderBlock,
  blobContext,
}: {
  frame: LeafletCanvasFrame;
  entries: Array<LeafletBlockEntry>;
  depth: number;
  renderBlock: RenderBlock;
  blobContext?: ContentBlobContext;
}) {
  const { t } = useLingui();
  const [showOriginal, setShowOriginal] = useState(false);
  const frameRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const canvasWidth = frame.width ?? LEAFLET_CANVAS_WIDTH;
  const reflowable = canvasWidth >= REFLOWABLE_CANVAS_MIN_WIDTH;
  const original = reflowable && showOriginal;
  useZoomFallback(frameRef, layerRef, canvasWidth, original);

  // Leaflet anchors a phone's view of the canvas at its left edge, or at its
  // centre for `mobileView: center`.
  useLayoutEffect(() => {
    const frameElement = frameRef.current;
    const layer = layerRef.current;
    if (!original || !frameElement || !layer) return;
    if (frame.mobileView !== "center") {
      frameElement.scrollLeft = 0;
      return;
    }
    const zoom = layer.getBoundingClientRect().width / canvasWidth;
    frameElement.scrollLeft =
      ((canvasWidth - CANVAS_MOBILE_VIEW_WIDTH) / 2) * zoom;
  }, [original, frame.mobileView, canvasWidth]);

  const items: Array<{
    placement: LeafletCanvasPlacement;
    entries: Array<LeafletBlockEntry>;
  }> = [];
  for (const entry of entries) {
    const placement = placementAt(entry.block, depth);
    if (!placement) continue;
    const last = items.at(-1);
    if (last?.placement === placement) {
      last.entries.push(entry);
    } else {
      items.push({ placement, entries: [entry] });
    }
  }

  const pattern =
    frame.pattern ?? (frame.width && frame.height ? "plain" : "grid");
  const backgroundCid = frame.background
    ? leafletImageCid(frame.background.image)
    : null;
  const backgroundUrl =
    backgroundCid && blobContext
      ? cdnImageUrl(blobContext.authorDid, backgroundCid, "png")
      : null;

  return (
    <div
      ref={frameRef}
      role={frame.alt ? "group" : undefined}
      aria-label={frame.alt || undefined}
      {...stylex.props(
        styles.frame,
        original
          ? styles.frameOriginal
          : reflowable
            ? styles.frameReflowable
            : styles.frameFixed,
      )}
    >
      {reflowable ? (
        <div {...stylex.props(styles.toggleRow)}>
          <Button
            size="sm"
            variant="secondary"
            onPress={() => setShowOriginal((current) => !current)}
          >
            {showOriginal ? t`Show as one column` : t`Show the original layout`}
          </Button>
        </div>
      ) : null}
      <div
        ref={layerRef}
        style={
          {
            "--sr-canvas-width": canvasWidth,
            "--sr-canvas-height": frame.height,
          } as CSSProperties
        }
        {...stylex.props(
          styles.layer,
          original && styles.layerOriginal,
          frame.width && frame.height ? styles.layerFixedSize : null,
        )}
      >
        {backgroundUrl ? (
          <div
            aria-hidden="true"
            {...stylex.props(
              styles.backdrop,
              styles.backgroundTile(
                `url("${backgroundUrl}")`,
                frame.background?.width ?? BACKGROUND_TILE_WIDTH,
                (frame.background?.opacity ?? 100) / 100,
              ),
            )}
          />
        ) : null}
        {pattern === "grid" || pattern === "dot" ? (
          <div
            aria-hidden="true"
            {...stylex.props(
              styles.backdrop,
              pattern === "grid" ? styles.patternGrid : styles.patternDot,
            )}
          />
        ) : null}
        {items.map(({ placement, entries: itemEntries }) => (
          <div
            key={placement.entry}
            dir="auto"
            style={
              {
                "--sr-x": Math.min(placement.x, canvasWidth - MIN_VISIBLE),
                "--sr-y": placement.y,
                "--sr-item-width": placement.width,
                "--sr-rotation": placement.rotation ?? 0,
                "--sr-layer": placement.layer,
              } as CSSProperties
            }
            {...stylex.props(styles.item, alignmentStyle(placement.alignment))}
          >
            <LeafletCanvasContext value>
              <LeafletBlockList
                entries={itemEntries}
                renderBlock={renderBlock}
                blobContext={blobContext}
                depth={depth + 1}
              />
            </LeafletCanvasContext>
          </div>
        ))}
      </div>
    </div>
  );
}

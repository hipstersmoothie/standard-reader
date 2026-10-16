import { createContext } from "react";

/** Leaflet's width for a canvas page without a fixed size, in canvas px
 *  (`canvasSizes.width` is the stylesheet's copy). */
export const LEAFLET_CANVAS_WIDTH = 1272;

/**
 * Canvases at least this wide can reflow into a reading column on a narrow
 * screen. A narrower one (an embedded drawing is 624) still reads at a usable
 * size scaled to a phone, so it always keeps its layout.
 */
export const REFLOWABLE_CANVAS_MIN_WIDTH = 960;

/**
 * Width of the canvas area a phone shows when the reader asks for the original
 * layout: Leaflet's mobile-view frame (a third wider than a common phone), at
 * which canvas text still reads at about two-thirds size. The rest of the
 * canvas scrolls sideways.
 */
export const CANVAS_MOBILE_VIEW_WIDTH = 520;

/** True for blocks drawn inside a canvas block, which size to canvas px. */
export const LeafletCanvasContext = createContext(false);

/**
 * Retained-selection highlight (CSS Custom Highlight API).
 *
 * On touch devices the OS tears down the native text selection the instant the
 * user taps anything outside it — including our own selection toolbar. There is
 * no reliable way to stop that (preventing the default on the pointer-down does
 * not save the OS selection UI on mobile). So instead of fighting it, we paint
 * the chosen passage with a custom highlight for as long as the toolbar is up.
 * `::selection` paints above custom highlights, so it stays invisible under the
 * real selection and only takes over once the OS drops it.
 *
 * Painting over a `Range` never mutates the DOM, so this can't disturb the
 * article or the live selection it stands in for. See the
 * `::highlight(selection-retain)` rule in `styles.css`.
 */

import { createSingleRangeHighlight } from "#/lib/custom-highlight";

const highlight = createSingleRangeHighlight("selection-retain");

/** Paint the retained selection; returns false when the browser lacks the API. */
export function setSelectionRetentionHighlight(range: Range): boolean {
  return highlight.paint(range);
}

export function clearSelectionRetentionHighlight(): void {
  highlight.clear();
}

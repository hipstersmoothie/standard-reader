/** Firefox lacks `break-before/after: column`; spacers emulate forced column breaks. */

const SPACER_CLASS = "mag-col-spacer";
const SPACER_ATTR = "data-mag-col-spacer";
const BREAK_TARGETS =
  ".flow-col, .editorial-spread > .opener, .feature-body > .opener";

/** Elements that should begin at the top of a fresh column. */
export const MAG_COLUMN_START_SELECTOR = BREAK_TARGETS;

const COL_TOP_EPS_PX = 14;

let forcedBreaksSupported: boolean | null = null;

/** True when the engine honors CSS `break-before: column` in multicol. */
export function supportsForcedColumnBreaks(): boolean {
  if (forcedBreaksSupported !== null) return forcedBreaksSupported;
  if (typeof document === "undefined") return true;

  const probe = document.createElement("div");
  probe.style.setProperty("break-before", "column");
  document.body.append(probe);
  forcedBreaksSupported = getComputedStyle(probe).breakBefore === "column";
  probe.remove();
  return forcedBreaksSupported;
}

function columnTopOffset(flow: HTMLElement, el: HTMLElement): number {
  const flowRect = flow.getBoundingClientRect();
  const elRect = el.getBoundingClientRect();
  return elRect.top - flowRect.top;
}

function spacerHeight(flow: HTMLElement, el: HTMLElement): number {
  const flowHeight = flow.clientHeight;
  if (flowHeight <= 0) return 0;

  const topOffset = columnTopOffset(flow, el);
  if (topOffset <= COL_TOP_EPS_PX) return 0;

  return Math.max(0, flowHeight - topOffset);
}

function insertSpacerBefore(el: HTMLElement, height: number): void {
  const spacer = document.createElement("div");
  spacer.className = SPACER_CLASS;
  spacer.setAttribute(SPACER_ATTR, "1");
  spacer.setAttribute("aria-hidden", "true");
  spacer.style.height = `${height}px`;
  spacer.style.breakInside = "avoid";
  el.parentNode?.insertBefore(spacer, el);
}

/** Remove spacers inserted by {@link applyForcedColumnBreaks}. */
export function clearForcedColumnBreaks(root: ParentNode): void {
  for (const node of root.querySelectorAll(`[${SPACER_ATTR}]`)) {
    node.remove();
  }
}

/**
 * Insert column-fill spacers before break targets when the engine ignores
 * `break-before: column`. Re-run after geometry changes (resize, fonts, images).
 */
export function applyForcedColumnBreaks(flow: HTMLElement): boolean {
  if (supportsForcedColumnBreaks()) {
    clearForcedColumnBreaks(flow);
    return false;
  }

  clearForcedColumnBreaks(flow);

  const maxPasses = 256;
  for (let pass = 0; pass < maxPasses; pass++) {
    const targets = flow.querySelectorAll(BREAK_TARGETS);
    let inserted = false;

    for (const node of targets) {
      if (!(node instanceof HTMLElement)) continue;
      const height = spacerHeight(flow, node);
      if (height <= 0) continue;
      insertSpacerBefore(node, height);
      inserted = true;
      break;
    }

    if (!inserted) return pass > 0;
  }

  return true;
}

export { COL_TOP_EPS_PX };

/** Imperative resize chrome — shows before React can paint a reflow frame. */

export const MAG_RESIZE_START = "mag-resize-start";
export const MAG_RESIZE_END = "mag-resize-end";

const RESIZE_CLASS = "mag-resizing";
const FROZEN_TRANSFORM_VAR = "--mag-frozen-transform";

let sessionActive = false;

export function isResizeChromeActive(): boolean {
  return sessionActive;
}

function readFlowTransformPx(root: HTMLElement): number {
  const flow = root.querySelector<HTMLElement>(".mag-flow");
  if (!flow) return 0;
  const inline = flow.style.transform;
  const match = /translateX\((-?\d+(?:\.\d+)?)px\)/.exec(inline);
  if (match) return Number.parseFloat(match[1]);
  const matrix = globalThis.getComputedStyle(flow).transform;
  if (!matrix || matrix === "none") return 0;
  const parts = matrix.match(/matrix\(([^)]+)\)/);
  if (!parts) return 0;
  const values = parts[1].split(",").map((v) => Number.parseFloat(v.trim()));
  return values.length >= 6 ? values[4] : 0;
}

export function beginResizeChrome(root: HTMLElement | null | undefined): void {
  if (!root) return;

  const starting = !sessionActive;
  if (starting) {
    sessionActive = true;
    const translatePx = readFlowTransformPx(root);
    root.style.setProperty(
      FROZEN_TRANSFORM_VAR,
      `translateX(${translatePx}px)`,
    );
    root.dispatchEvent(new Event(MAG_RESIZE_START, { bubbles: true }));
  }

  root.classList.add(RESIZE_CLASS);
}

/**
 * Snap the frozen transform to the target slide before revealing it.
 *
 * `translatePx` is a *logical* offset from the slide math (negative = further
 * along the flow), so it goes through `--dir` to become physical — the flow
 * mirrors under RTL but `translateX` does not. This differs from
 * `beginResizeChrome`, which freezes an already-physical measured transform.
 */
export function snapResizeChromeTransform(
  root: HTMLElement | null | undefined,
  translatePx: number,
): void {
  root?.style.setProperty(
    FROZEN_TRANSFORM_VAR,
    `translateX(calc(var(--dir) * ${translatePx}px))`,
  );
}

export function endResizeChrome(root: HTMLElement | null | undefined): void {
  if (!sessionActive) return;
  sessionActive = false;
  root?.classList.remove(RESIZE_CLASS);
  root?.style.removeProperty(FROZEN_TRANSFORM_VAR);
  root?.dispatchEvent(new Event(MAG_RESIZE_END, { bubbles: true }));
}

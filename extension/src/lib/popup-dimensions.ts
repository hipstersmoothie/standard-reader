const POPUP_SIZES = {
  default: { width: 400, minHeight: 280, height: null as number | null },
  discussion: { width: 520, minHeight: 520, height: 520 },
} as const;

export type PopupDimensionsMode = keyof typeof POPUP_SIZES;

function applySize(target: HTMLElement, mode: PopupDimensionsMode): void {
  const size = POPUP_SIZES[mode];
  target.style.width = `${size.width}px`;
  target.style.minHeight = `${size.minHeight}px`;

  if (size.height == null) {
    target.style.height = "";
    target.style.overflow = "";
  } else {
    target.style.height = `${size.height}px`;
    target.style.overflow = "hidden";
  }
}

export function setPopupDimensions(mode: PopupDimensionsMode): void {
  const root = document.querySelector("#root");
  applySize(document.documentElement, mode);
  applySize(document.body, mode);
  if (root instanceof HTMLElement) {
    applySize(root, mode);
  }
}

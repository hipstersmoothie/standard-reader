/** Pin a fixed shell to the visible viewport (iOS Safari floating chrome). */
import { beginResizeChrome } from "./resize-chrome";

export function pinElementToVisualViewport(el: HTMLElement): () => void {
  if (globalThis.window === undefined) return () => {};

  let lastW = 0;
  let lastH = 0;

  const sync = () => {
    const vv = globalThis.visualViewport;
    if (!vv) {
      el.style.removeProperty("top");
      el.style.removeProperty("left");
      el.style.removeProperty("width");
      el.style.removeProperty("height");
      return;
    }

    const w = vv.width;
    const h = vv.height;
    const sizeChanged =
      lastW > 0 && (Math.abs(lastW - w) >= 1 || Math.abs(lastH - h) >= 1);
    if (sizeChanged) {
      beginResizeChrome(el.querySelector<HTMLElement>(".mag-chrome"));
    }
    lastW = w;
    lastH = h;

    el.style.top = `${vv.offsetTop}px`;
    el.style.left = `${vv.offsetLeft}px`;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
  };

  sync();
  const vv = globalThis.visualViewport;
  vv?.addEventListener("resize", sync);
  vv?.addEventListener("scroll", sync);
  globalThis.addEventListener("resize", sync);
  globalThis.addEventListener("orientationchange", sync);

  return () => {
    vv?.removeEventListener("resize", sync);
    vv?.removeEventListener("scroll", sync);
    globalThis.removeEventListener("resize", sync);
    globalThis.removeEventListener("orientationchange", sync);
    el.style.removeProperty("top");
    el.style.removeProperty("left");
    el.style.removeProperty("width");
    el.style.removeProperty("height");
  };
}

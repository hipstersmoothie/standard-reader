"use client";

import { useLayoutEffect } from "react";

import { SUBSCRIBE_EMBED_RESIZE_MESSAGE } from "#/lib/publication-embed";

/** Tell the parent page how tall the subscribe embed is (for iframe auto-resize). */
export function SubscribeEmbedResizeReporter() {
  useLayoutEffect(() => {
    const { parent, window: selfWindow } = globalThis;
    if (selfWindow === undefined) {
      return;
    }

    document.documentElement.dataset.embed = "subscribe";

    if (parent === selfWindow) {
      return;
    }

    const report = () => {
      const root =
        document.querySelector<HTMLElement>("[data-subscribe-embed]") ??
        document.body;
      const height = Math.ceil(
        Math.max(root.scrollHeight, root.getBoundingClientRect().height),
      );
      parent.postMessage({ type: SUBSCRIBE_EMBED_RESIZE_MESSAGE, height }, "*");
    };

    report();

    const observer = new ResizeObserver(report);
    observer.observe(document.documentElement);
    selfWindow.addEventListener("load", report);
    selfWindow.addEventListener("resize", report);

    return () => {
      observer.disconnect();
      selfWindow.removeEventListener("load", report);
      selfWindow.removeEventListener("resize", report);
      delete document.documentElement.dataset.embed;
    };
  }, []);

  return null;
}

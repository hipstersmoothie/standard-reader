"use client";

import { useLayoutEffect } from "react";

import { EMBED_RESIZE_MESSAGE } from "#/lib/embed-snippet";

/**
 * Tell the parent page how tall this embed card is, so the snippet's resize
 * script can size its iframe to the content. Shared by the publication
 * subscribe embed and the author follow embed — the message shape is what the
 * pasted script listens for, so both must speak it.
 */
export function EmbedResizeReporter({
  kind,
}: {
  /** Which embed this is — becomes `<html data-embed>` for the shrink-wrap CSS. */
  kind: "subscribe" | "follow";
}) {
  useLayoutEffect(() => {
    const { parent, window: selfWindow } = globalThis;
    if (selfWindow === undefined) {
      return;
    }

    document.documentElement.dataset.embed = kind;

    if (parent === selfWindow) {
      return;
    }

    const report = () => {
      const root =
        document.querySelector<HTMLElement>("[data-embed-card]") ??
        document.body;
      const height = Math.ceil(
        Math.max(root.scrollHeight, root.getBoundingClientRect().height),
      );
      parent.postMessage({ type: EMBED_RESIZE_MESSAGE, height }, "*");
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
  }, [kind]);

  return null;
}

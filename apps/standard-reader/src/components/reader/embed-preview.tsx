"use client";

import * as stylex from "@stylexjs/stylex";
import { useEffect, useState } from "react";

import { EMBED_RESIZE_MESSAGE } from "#/lib/embed-snippet";

import { subscribeCardLayout } from "./subscribe-card.stylex";

const styles = stylex.create({
  frame: {
    borderRadius: subscribeCardLayout.borderRadius,
    cornerShape: "squircle",
    overflow: "hidden",
    flexShrink: 0,
    marginInlineEnd: "auto",
    marginInlineStart: "auto",
    maxWidth: "100%",
    width: subscribeCardLayout.maxWidth,
  },
  iframe: {
    borderStyle: "none",
    borderWidth: 0,
    display: "block",
    width: "100%",
  },
});

/**
 * Live iframe preview of an embed card — same wrapper styling and the same
 * resize handshake as the snippet the dialog hands out, so what an author sees
 * here is what their own page will render.
 */
export function EmbedCardPreview({
  src,
  iframeId,
  title,
  estimatedHeight,
  backgroundColor,
}: {
  src: string;
  iframeId: string;
  title: string;
  /** Height until the embed reports its real one. */
  estimatedHeight: number;
  backgroundColor: string;
}) {
  const [height, setHeight] = useState(estimatedHeight);

  useEffect(() => {
    setHeight(estimatedHeight);
  }, [estimatedHeight, src]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.data?.type !== EMBED_RESIZE_MESSAGE ||
        typeof event.data.height !== "number"
      ) {
        return;
      }

      const frame = document.querySelector(`#${iframeId}`);
      if (
        frame instanceof HTMLIFrameElement &&
        event.source === frame.contentWindow
      ) {
        setHeight(Math.ceil(event.data.height));
      }
    };

    globalThis.addEventListener("message", onMessage);
    return () => {
      globalThis.removeEventListener("message", onMessage);
    };
  }, [iframeId]);

  return (
    <div {...stylex.props(styles.frame)} style={{ backgroundColor }}>
      <iframe
        id={iframeId}
        src={src}
        width={400}
        height={height}
        title={title}
        loading="lazy"
        {...stylex.props(styles.iframe)}
      />
    </div>
  );
}

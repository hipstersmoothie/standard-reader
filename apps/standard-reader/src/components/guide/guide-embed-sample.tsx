"use client";

import { useEffect, useRef, useState } from "react";

import { EMBED_RESIZE_MESSAGE } from "#/lib/embed-snippet";

/**
 * A live embed card in the guide, wired to the same `postMessage` resize
 * handshake the copied snippet uses — so the sample on the page behaves
 * exactly like the one a publisher pastes on their own site, rather than being
 * a screenshot of it.
 */
export function GuideEmbedSample({
  src,
  title,
  initialHeight,
}: {
  src: string;
  title: string;
  /** Height until the embed reports its real one. */
  initialHeight: number;
}) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const [height, setHeight] = useState(initialHeight);

  useEffect(() => {
    function onMessage(event: MessageEvent) {
      if (
        event.data?.type !== EMBED_RESIZE_MESSAGE ||
        typeof event.data.height !== "number"
      ) {
        return;
      }
      if (event.source === iframeRef.current?.contentWindow) {
        setHeight(Math.ceil(event.data.height));
      }
    }
    globalThis.addEventListener("message", onMessage);
    return () => globalThis.removeEventListener("message", onMessage);
  }, []);

  return (
    <div
      style={{
        backgroundColor: "#f9f7f2",
        borderRadius: "1.55rem",
        maxWidth: "100%",
        overflow: "hidden",
        width: "25rem",
      }}
    >
      {/* oxlint-disable-next-line iframe-has-title --
          the title IS set below; the rule can't statically resolve a
          tagged-template expression. */}
      <iframe
        ref={iframeRef}
        src={src}
        width={400}
        height={height}
        style={{
          border: 0,
          colorScheme: "normal",
          display: "block",
          width: "100%",
        }}
        title={title}
        loading="lazy"
      />
    </div>
  );
}

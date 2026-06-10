"use client";

import type { PublicationEmbedMeta } from "#/integrations/tanstack-query/api-publication.functions";
import type { SubscribeEmbedLayout } from "#/lib/publication-embed";

import * as stylex from "@stylexjs/stylex";
import {
  SUBSCRIBE_EMBED_RESIZE_MESSAGE,
  estimateSubscribeEmbedHeight,
  subscribeEmbedIframeId,
  subscribeEmbedUrl,
} from "#/lib/publication-embed";
import { useEffect, useState } from "react";

import { publicationThemeColors } from "./subscribe-card";
import { subscribeCardLayout } from "./subscribe-card.stylex";

const styles = stylex.create({
  frame: {
    borderRadius: subscribeCardLayout.borderRadius,
    cornerShape: "squircle",
    overflow: "hidden",
    flexShrink: 0,
    marginLeft: "auto",
    marginRight: "auto",
    maxWidth: "100%",
    width: subscribeCardLayout.maxWidth,
  },
  iframe: {
    borderStyle: "none",
    borderWidth: 0,
    colorScheme: "normal",
    display: "block",
    width: "100%",
  },
});

function estimateHeight(
  meta: PublicationEmbedMeta,
  layout: SubscribeEmbedLayout,
): number {
  return estimateSubscribeEmbedHeight(
    {
      name: meta.name,
      topic: meta.topic,
      ownerDisplayName: meta.ownerDisplayName,
      ownerHandle: meta.ownerHandle,
      description: meta.description,
    },
    layout,
  );
}

/** Live iframe preview — same wrapper styling and resize behavior as the copied snippet. */
export function SubscribeEmbedPreview({
  meta,
  layout,
  baseUrl,
}: {
  meta: PublicationEmbedMeta;
  layout: SubscribeEmbedLayout;
  baseUrl: string;
}) {
  const iframeId = subscribeEmbedIframeId(meta.rkey);
  const src = subscribeEmbedUrl({
    did: meta.did,
    rkey: meta.rkey,
    layout,
    baseUrl,
  });
  const [height, setHeight] = useState(() => estimateHeight(meta, layout));
  const background = publicationThemeColors(meta).background;

  useEffect(() => {
    setHeight(estimateHeight(meta, layout));
  }, [meta, layout]);

  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (
        event.data?.type !== SUBSCRIBE_EMBED_RESIZE_MESSAGE ||
        typeof event.data.height !== "number"
      ) {
        return;
      }

      const frame = document.getElementById(iframeId);
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
    <div
      {...stylex.props(styles.frame)}
      style={{ backgroundColor: background }}
    >
      <iframe
        id={iframeId}
        src={src}
        width={400}
        height={height}
        title={`Subscribe to ${meta.name}`}
        loading="lazy"
        {...stylex.props(styles.iframe)}
      />
    </div>
  );
}
